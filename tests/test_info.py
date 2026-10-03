"""Run with: python3 -m unittest discover tests"""

import base64
import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
os.environ['DOWNLOAD_SIGNING_SECRET'] = 'test-secret'

import fake_upstash  # noqa: E402
import info  # noqa: E402
import yt_dlp  # noqa: E402
from yt_dlp.utils import DownloadError  # noqa: E402

PLATFORMS_JSON = os.path.join(os.path.dirname(__file__), '..', 'src', 'config', 'platforms.json')
with open(PLATFORMS_JSON) as f:
    PLATFORMS = json.load(f)


def decode(token):
    body = token.split('.')[0]
    return json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))


class ValidateUrlTest(unittest.TestCase):
    def test_rejects_empty_and_non_http(self):
        for bad in ('', '   ', 'ftp://x.com/a', 'javascript:alert(1)', None, 42):
            with self.assertRaises(info.UserError):
                info.validate_url(bad)

    def test_accepts_youtube_links(self):
        for url in ('https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://m.youtube.com/shorts/x'):
            self.assertEqual(info.validate_url(url), url)

    def test_blocked_hosts_are_coming_soon(self):
        with mock.patch.dict(info.BLOCKED_HOSTS, {'soon.example': 'Soon support is coming soon.'}):
            for url in ('https://soon.example/v/1', 'https://m.soon.example/v/1'):
                with self.assertRaisesRegex(info.UserError, 'coming soon'):
                    info.validate_url(url)

    def test_accepts_x_link(self):
        url = 'https://x.com/a/status/1/video/1'
        self.assertEqual(info.validate_url(f'  {url} '), url)

    def test_adds_missing_scheme(self):
        self.assertEqual(info.validate_url('x.com/a/status/1'), 'https://x.com/a/status/1')
        with self.assertRaises(info.UserError):
            info.validate_url('nodot/path')


class PlatformListTest(unittest.TestCase):
    """Keeps src/config/platforms.json honest about what the backend can do."""

    @classmethod
    def setUpClass(cls):
        # YoutubeDL fills in the dict it is given, so hand it a copy.
        ydl = yt_dlp.YoutubeDL(info.ydl_opts('https://x.com/'))
        cls.extractors = [ie for key, ie in ydl._ies.items() if key not in ('Generic', 'UnsupportedURL')]

    def claimed(self, url):
        return any(ie.suitable(url) for ie in self.extractors)

    def test_supported_samples_are_readable(self):
        for p in PLATFORMS:
            if p['status'] != 'supported':
                continue
            for url in p['samples']:
                ok = self.claimed(url) or info.share_link_domains(url) is not None
                self.assertTrue(ok, f'{p["id"]}: nothing handles {url}')

    def test_coming_soon_hosts_are_blocked(self):
        for p in PLATFORMS:
            for url in p['samples']:
                if p['status'] == 'soon':
                    with self.assertRaisesRegex(info.UserError, 'coming soon', msg=url):
                        info.validate_url(url)
                else:
                    info.validate_url(url)


class ShareLinkTest(unittest.TestCase):
    def test_recognises_share_links_only(self):
        for url in ('https://fb.watch/abc/', 'https://www.facebook.com/share/v/1Ab/',
                    'https://www.reddit.com/r/videos/s/AbC', 'https://redd.it/abc',
                    'https://v.redd.it/abc', 'https://pin.it/abc', 'https://b23.tv/abc'):
            self.assertIsNotNone(info.share_link_domains(url), url)
        for url in ('https://www.facebook.com/watch/?v=1', 'https://www.reddit.com/r/videos/comments/abc/t/',
                    'https://x.com/a/status/1', 'https://evilfb.watch/abc'):
            self.assertIsNone(info.share_link_domains(url), url)

    def test_redirect_must_stay_on_platform(self):
        handler = info._StayOnPlatform(('reddit.com',))
        req = urllib.request.Request('https://redd.it/abc')
        ok = handler.redirect_request(req, None, 301, '', {}, 'https://www.reddit.com/r/a/comments/b/')
        self.assertEqual(ok.full_url, 'https://www.reddit.com/r/a/comments/b/')
        for bad in ('https://evil.example/x', 'https://reddit.com.evil.example/', 'file:///etc/passwd'):
            with self.assertRaises(info.UserError, msg=bad):
                handler.redirect_request(req, None, 301, '', {}, bad)

    def test_follows_redirect_chain(self):
        class Redirector(BaseHTTPRequestHandler):
            def do_GET(self):
                hops = {'/start': '/middle', '/middle': '/final', '/away': 'http://localhost:1/x'}
                if self.path in hops:
                    self.send_response(302)
                    self.send_header('Location', hops[self.path])
                    self.end_headers()
                else:
                    self.send_response(403 if self.path == '/final' else 200)
                    self.end_headers()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Redirector)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            # Ends on a 403, like Reddit does for bots, but we still learn the post URL.
            self.assertEqual(info.follow_redirects(f'{base}/start', ('127.0.0.1',)), f'{base}/final')
            with self.assertRaises(info.UserError):
                info.follow_redirects(f'{base}/away', ('127.0.0.1',))
        finally:
            server.shutdown()
            server.server_close()


class PickFormatsTest(unittest.TestCase):
    def test_keeps_best_muxed_per_height_and_one_audio(self):
        data = {
            'title': 'My: clip/1',
            'formats': [
                {'url': 'https://cdn/a', 'protocol': 'm3u8_native', 'height': 720, 'vcodec': 'avc1', 'acodec': 'mp4a'},
                {'url': 'https://cdn/b', 'protocol': 'https', 'height': 360, 'ext': 'mp4'},
                {'url': 'https://cdn/c', 'protocol': 'https', 'height': 720, 'ext': 'mp4',
                 'http_headers': {'User-Agent': 'UA', 'X-Other': 'drop'}, 'cookies': 'a=b'},
                {'url': 'https://cdn/d', 'protocol': 'https', 'height': 1080, 'vcodec': 'avc1', 'acodec': 'none'},
                {'url': 'https://cdn/e', 'protocol': 'https', 'vcodec': 'none', 'acodec': 'mp4a', 'abr': 128, 'ext': 'm4a'},
            ],
        }
        out = info.pick_formats(data)
        self.assertEqual([f['label'] for f in out], ['720p', '360p', 'Audio 128 kbps'])
        top = decode(out[0]['token'])
        self.assertEqual(top['u'], 'https://cdn/c')
        self.assertEqual(top['h'], {'User-Agent': 'UA', 'Cookie': 'a=b'})
        self.assertEqual(top['f'], 'My clip 1.mp4')

    def test_single_file_info_without_formats(self):
        out = info.pick_formats({'title': 't', 'url': 'https://cdn/x', 'ext': 'mp4'})
        self.assertEqual(len(out), 1)


class HandleTest(unittest.TestCase):
    def test_bad_json(self):
        self.assertEqual(info.handle(b'{nope')[0], 400)

    def test_unsupported_site(self):
        status, payload = info.handle(json.dumps({'url': 'https://example.com/video'}).encode())
        self.assertEqual(status, 422)
        self.assertIn('support', payload['error'])


MUXED = {'url': 'https://cdn.example/v.mp4', 'protocol': 'https', 'height': 720, 'ext': 'mp4'}


class StoreTestCase(unittest.TestCase):
    """Runs against a fake Upstash store, and never fetches a JavaScript runtime."""

    def setUp(self):
        self.server, url, self.store = fake_upstash.start()
        self.env = mock.patch.dict(os.environ, {
            'UPSTASH_REDIS_REST_URL': url, 'UPSTASH_REDIS_REST_TOKEN': fake_upstash.TOKEN,
        })
        self.env.start()
        no_deno = mock.patch.object(info, 'find_deno', return_value=None)
        no_deno.start()
        self.addCleanup(no_deno.stop)

    def tearDown(self):
        self.env.stop()
        self.server.shutdown()
        self.server.server_close()

    def stats(self, wait_for=None):
        # A streamed download is counted after its last byte, so the browser
        # can be done before the count lands.
        for _ in range(100):
            stats = next(iter(self.store.hashes.values()), {})
            if wait_for is None or wait_for in stats:
                return stats
            time.sleep(0.02)
        return stats

    def failures(self):
        return [json.loads(e) for lst in self.store.lists.values() for e in lst]


class FailureLogTest(StoreTestCase):
    def lookup(self, url, platform=None, **extract):
        body = json.dumps({'url': url, 'platform': platform}).encode()
        if not extract:
            return info.handle(body)
        with mock.patch.object(yt_dlp.YoutubeDL, 'extract_info', **extract):
            return info.handle(body)

    def test_success_is_counted_and_token_knows_its_source(self):
        status, payload = self.lookup('https://x.com/a/status/1?s=20', 'x',
                                      return_value={'title': 't', 'formats': [MUXED], 'extractor_key': 'Twitter'})
        self.assertEqual(status, 200)
        self.assertEqual(self.stats(), {'info:x:ok': 1})
        token = decode(payload['formats'][0]['token'])
        self.assertEqual((token['p'], token['s']), ('x', 'https://x.com/a/status/1'))
        self.assertEqual(self.failures(), [])

    def test_unknown_site_success_is_counted_under_its_extractor(self):
        self.lookup('https://www.dailymotion.com/video/x8abcde',
                    return_value={'title': 't', 'formats': [MUXED], 'extractor_key': 'Dailymotion'})
        self.assertEqual(self.stats(), {'info:dailymotion:ok': 1})

    def test_not_found_is_stored_with_a_clean_link(self):
        err = DownloadError('ERROR: [twitter] 1: No video could be found in this tweet')
        status, _ = self.lookup('https://x.com/a/status/1?s=20&t=abc#frag', 'x', side_effect=err)
        self.assertEqual(status, 422)
        self.assertEqual(self.stats(), {'info:x:not_found': 1})
        (event,) = self.failures()
        self.assertEqual(event['code'], 'not_found')
        self.assertEqual(event['platform'], 'x')
        self.assertEqual(event['url'], 'https://x.com/a/status/1')
        self.assertEqual(event['host'], 'x.com')
        self.assertIn('No video could be found', event['detail'])
        self.assertEqual(event['version'], info.YTDLP_VERSION)
        self.assertEqual(event['build'], 'local')
        ttls = {k.split(':')[1]: v for k, v in self.store.ttls.items()}
        self.assertEqual(ttls, {'stats': 90 * 86400, 'failures': 30 * 86400})

    def test_login_wall_is_stored(self):
        err = DownloadError('ERROR: [Instagram] abc: Requested content is not available, rate-limit reached or login required')
        self.lookup('https://www.instagram.com/reel/abc/?igsh=xyz', 'instagram', side_effect=err)
        (event,) = self.failures()
        self.assertEqual((event['code'], event['url']), ('login_required', 'https://www.instagram.com/reel/abc/'))

    def test_youtube_bot_check_is_stored(self):
        err = DownloadError("ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser")
        status, payload = self.lookup('https://www.youtube.com/watch?v=abc&si=xyz', 'youtube', side_effect=err)
        self.assertEqual(status, 503)
        self.assertIn('YouTube is blocking', payload['error'])
        self.assertEqual(self.stats(), {'info:youtube:bot_check': 1})
        (event,) = self.failures()
        self.assertEqual((event['code'], event['url']), ('bot_check', 'https://www.youtube.com/watch?v=abc'))

    def test_stream_only_video_stores_what_was_found(self):
        hls = {'url': 'https://cdn.example/a.m3u8', 'protocol': 'm3u8_native', 'vcodec': 'avc1', 'acodec': 'mp4a'}
        status, _ = self.lookup('https://vimeo.com/1', 'vimeo', return_value={'title': 't', 'formats': [hls, hls]})
        self.assertEqual(status, 422)
        (event,) = self.failures()
        self.assertEqual(event['code'], 'no_direct_formats')
        self.assertEqual(event['detail'], 'm3u8_native video+audio x2')

    def test_crash_is_caught_and_stored(self):
        status, payload = self.lookup('https://x.com/a/status/1', 'x', side_effect=RuntimeError('boom'))
        self.assertEqual(status, 500)
        self.assertNotIn('boom', payload['error'])
        (event,) = self.failures()
        self.assertEqual(event['code'], 'internal_error')
        self.assertIn('RuntimeError: boom', event['detail'])

    def test_unsupported_site_counts_demand_but_keeps_no_link(self):
        status, _ = self.lookup('https://example.com/v?id=1', 'bad:id')
        self.assertEqual(status, 422)
        self.assertEqual(self.stats(), {'info:unknown:unsupported_site': 1})
        self.assertEqual(list(self.store.zsets.values()), [{'example.com': 1.0}])
        self.assertEqual(self.failures(), [])

    def test_coming_soon_is_only_counted(self):
        with mock.patch.dict(info.BLOCKED_HOSTS, {'soon.example': 'Soon support is coming soon.'}):
            self.lookup('https://soon.example/v/1', 'soon')
        self.assertEqual(self.stats(), {'info:soon:coming_soon': 1})
        self.assertEqual(self.failures(), [])

    def test_lookup_still_answers_when_the_store_is_down(self):
        self.server.shutdown()
        self.server.server_close()
        status, _ = self.lookup('https://x.com/a/status/1', 'x', side_effect=DownloadError('ERROR: nope'))
        self.assertEqual(status, 422)

    def test_works_without_a_store(self):
        with mock.patch.dict(os.environ, {'UPSTASH_REDIS_REST_URL': '', 'KV_REST_API_URL': ''}):
            status, _ = self.lookup('https://x.com/a/status/1', 'x', side_effect=DownloadError('ERROR: nope'))
        self.assertEqual(status, 422)
        self.assertEqual(self.stats(), {})

    def test_vercel_integration_variable_names(self):
        url = os.environ.pop('UPSTASH_REDIS_REST_URL')
        token = os.environ.pop('UPSTASH_REDIS_REST_TOKEN')
        with mock.patch.dict(os.environ, {'KV_REST_API_URL': url, 'KV_REST_API_TOKEN': token}):
            self.lookup('https://x.com/a/status/1', 'x', return_value={'title': 't', 'formats': [MUXED]})
        self.assertEqual(self.stats(), {'info:x:ok': 1})


class TokenTest(unittest.TestCase):
    def test_round_trip_and_rejects_forged_or_expired(self):
        token = info.sign_token({'u': 'https://a', 'e': 9999999999})
        self.assertEqual(info.verify_token(token)['u'], 'https://a')
        body, sig = token.split('.')
        forged = info._b64(json.dumps({'u': 'https://b', 'e': 9999999999}).encode())
        for bad in (None, '', body, f'{forged}.{sig}', f'{body}.{sig[:-2]}AA',
                    info.sign_token({'u': 'https://a', 'e': 1}), info.sign_token({'e': 9999999999}),
                    info.sign_token(['u'])):
            self.assertIsNone(info.verify_token(bad), bad)


class YoutubeRuntimeTest(unittest.TestCase):
    def test_only_youtube_gets_a_js_runtime(self):
        with mock.patch.object(info, 'find_deno', return_value='/opt/deno'):
            self.assertEqual(info.ydl_opts('https://youtu.be/abc')['js_runtimes'], {'deno': {'path': '/opt/deno'}})
            self.assertNotIn('js_runtimes', info.ydl_opts('https://x.com/a/status/1'))
        with mock.patch.object(info, 'find_deno', return_value=None):
            self.assertNotIn('js_runtimes', info.ydl_opts('https://www.youtube.com/watch?v=abc'))
        self.assertNotIn('js_runtimes', info.YDL_OPTS)

    def test_fetches_deno_when_the_package_has_none(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as zf:
            zf.writestr('deno', b'#!/bin/sh\n')
        data = buf.getvalue()
        answer = mock.MagicMock()
        answer.__enter__.return_value.read.return_value = data
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'bin', 'deno')
            with mock.patch.dict(sys.modules, {'deno': None}), \
                    mock.patch.object(info, 'DENO_TMP_PATH', path), \
                    mock.patch.object(info.urllib.request, 'urlopen', return_value=answer) as urlopen:
                with mock.patch.object(info, 'DENO_ZIP_SHA256', 'not-the-checksum'):
                    self.assertIsNone(info.find_deno())
                self.assertFalse(os.path.exists(path))
                with mock.patch.object(info, 'DENO_ZIP_SHA256', hashlib.sha256(data).hexdigest()):
                    self.assertEqual(info.find_deno(), path)
                    self.assertTrue(os.access(path, os.X_OK))
                    self.assertEqual(info.find_deno(), path)
                self.assertEqual(urlopen.call_count, 2)


class FakeVideoHost(BaseHTTPRequestHandler):
    """Serves BODY in byte ranges, like YouTube's file servers."""

    BODY = bytes(range(256)) * 400
    refuse = False

    def do_GET(self):
        if self.refuse:
            self.send_response(403)
            self.end_headers()
            return
        start, end = (int(x) for x in self.headers['Range'].removeprefix('bytes=').split('-'))
        part = self.BODY[start:end + 1]
        self.send_response(206)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Range', f'bytes {start}-{start + len(part) - 1}/{len(self.BODY)}')
        self.send_header('Content-Length', str(len(part)))
        self.end_headers()
        self.wfile.write(part)

    def log_message(self, *args):
        pass


class YoutubeDownloadTest(StoreTestCase):
    def setUp(self):
        super().setUp()
        FakeVideoHost.refuse = False
        self.host = ThreadingHTTPServer(('127.0.0.1', 0), FakeVideoHost)
        self.api = ThreadingHTTPServer(('127.0.0.1', 0), info.handler)
        for server in (self.host, self.api):
            threading.Thread(target=server.serve_forever, daemon=True).start()
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
        self.video = {
            'title': 'Clip', 'extractor_key': 'Youtube', 'webpage_url': 'https://www.youtube.com/watch?v=abc',
            'formats': [
                {'format_id': '18', 'url': f'http://127.0.0.1:{self.host.server_port}/v', 'protocol': 'https',
                 'height': 360, 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'mp4a'},
                {'format_id': '137', 'url': 'https://cdn/1080', 'protocol': 'https', 'height': 1080,
                 'vcodec': 'avc1', 'acodec': 'none'},
            ],
        }

    def get(self, token):
        url = f'http://127.0.0.1:{self.api.server_port}/api/info?t={token}'
        try:
            with urllib.request.urlopen(url) as resp:
                return resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def token(self):
        (fmt,) = [f for f in info.pick_formats(self.video, platform='youtube', source='https://youtu.be/abc?si=x')]
        payload = decode(fmt['token'])
        self.assertEqual((payload['u'], payload['r'], payload['h']), (self.video['webpage_url'], '18', {}))
        return fmt['token']

    def test_looks_the_video_up_again_and_streams_it_in_ranges(self):
        token = self.token()
        with mock.patch.object(info, 'RANGE_BYTES', 30000), \
                mock.patch.object(yt_dlp.YoutubeDL, 'extract_info', return_value=self.video) as extract:
            status, headers, body = self.get(token)
        self.assertEqual(status, 200)
        self.assertEqual(body, FakeVideoHost.BODY)
        self.assertEqual(headers['Content-Length'], str(len(FakeVideoHost.BODY)))
        self.assertEqual(headers['Content-Type'], 'video/mp4')
        self.assertIn('filename="Clip.mp4"', headers['Content-Disposition'])
        self.assertEqual(extract.call_args.args[0], 'https://www.youtube.com/watch?v=abc')
        self.assertEqual(self.stats(wait_for='download:youtube:ok'), {'download:youtube:ok': 1})

    def test_refused_file_is_stored(self):
        FakeVideoHost.refuse = True
        with mock.patch.object(yt_dlp.YoutubeDL, 'extract_info', return_value=self.video):
            status, _, body = self.get(self.token())
        self.assertEqual(status, 502)
        self.assertIn(b'refused', body)
        (event,) = self.failures()
        self.assertEqual((event['stage'], event['code'], event['url']),
                         ('download', 'upstream_error', 'https://youtu.be/abc'))
        self.assertEqual(event['detail'], 'HTTP 403 from 127.0.0.1')

    def test_bot_check_on_the_second_lookup_is_stored(self):
        err = DownloadError("ERROR: [youtube] abc: Sign in to confirm you're not a bot.")
        with mock.patch.object(yt_dlp.YoutubeDL, 'extract_info', side_effect=err):
            status, _, body = self.get(self.token())
        self.assertEqual(status, 502)
        self.assertIn(b'YouTube is blocking', body)
        self.assertEqual(self.stats(), {'download:youtube:bot_check': 1})

    def test_whole_file_answer_and_unknown_size(self):
        class WholeFile(FakeVideoHost):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.end_headers()
                self.wfile.write(self.BODY)

        self.host.RequestHandlerClass = WholeFile
        with mock.patch.object(yt_dlp.YoutubeDL, 'extract_info', return_value=self.video):
            status, headers, body = self.get(self.token())
        self.assertEqual((status, body), (200, FakeVideoHost.BODY))
        self.assertIsNone(headers['Content-Length'])
        self.assertEqual(self.stats(wait_for='download:youtube:ok'), {'download:youtube:ok': 1})

    def test_rejects_expired_and_non_youtube_tokens(self):
        other = info.sign_token({'u': 'https://cdn/x', 'e': 9999999999})
        for token in ('nope', other):
            status, _, _ = self.get(token)
            self.assertEqual(status, 410)
        self.assertEqual(self.stats(), {'download:unknown:expired': 2})
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(f'http://127.0.0.1:{self.api.server_port}/api/info')
        self.assertEqual(cm.exception.code, 405)


class RedactUrlTest(unittest.TestCase):
    def test_keeps_only_params_needed_to_find_the_post(self):
        self.assertEqual(info.redact_url('https://www.facebook.com/watch/?v=123&ref=share&mibextid=x'),
                         'https://www.facebook.com/watch/?v=123')
        self.assertEqual(info.redact_url('https://vm.tiktok.com/ZM1/?_r=1&_t=abc#x'), 'https://vm.tiktok.com/ZM1/')
        self.assertIsNone(info.redact_url(None))


if __name__ == '__main__':
    unittest.main()
