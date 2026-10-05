"""Run with: python3 -m unittest discover tests"""

import base64
import json
import os
import sys
import threading
import unittest
import urllib.request
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

    def test_youtube_is_coming_soon(self):
        for url in ('https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://m.youtube.com/shorts/x'):
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
        ydl = yt_dlp.YoutubeDL(info.YDL_OPTS)
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

    def test_reddit_file_links_give_the_video_id(self):
        packaged = ('https://packaged-media.redd.it/ba9rghafmmth1/pb/m2-vp9-res_1080p.mp4'
                    '?m=DASHPlaylist.mpd&v=1&e=1791223200&s=abc')
        self.assertEqual(info.reddit_video_id(packaged), 'ba9rghafmmth1')
        self.assertEqual(info.reddit_video_id('https://v.redd.it/abcde12/DASH_720.mp4?source=fallback'), 'abcde12')
        self.assertIsNone(info.reddit_video_id('https://www.reddit.com/r/videos/comments/abc/t/'))
        self.assertIsNone(info.reddit_video_id('https://v.redd.it/../etc'))

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

    def test_separate_picture_and_sound_are_offered_for_merging(self):
        # Reddit: a video-only fallback, single-file DASH video and audio, and HLS.
        data = {
            'title': 'post',
            'formats': [
                {'url': 'https://v/fallback', 'protocol': 'https', 'height': 720, 'vcodec': 'avc1', 'acodec': 'none', 'ext': 'mp4'},
                {'url': 'https://v/hls', 'protocol': 'm3u8_native', 'height': 720, 'vcodec': 'avc1', 'acodec': 'mp4a'},
                {'url': 'https://v/DASH_480.mp4', 'protocol': 'https', 'height': 480, 'vcodec': 'avc1', 'acodec': 'none',
                 'ext': 'mp4', 'filesize': 1000},
                {'url': 'https://v/DASH_720.mp4', 'protocol': 'https', 'height': 720, 'vcodec': 'avc1', 'acodec': 'none',
                 'ext': 'mp4', 'filesize': 3000},
                {'url': 'https://v/DASH_AUDIO_64.mp4', 'protocol': 'https', 'vcodec': 'none', 'acodec': 'mp4a', 'abr': 64, 'ext': 'm4a'},
                {'url': 'https://v/DASH_AUDIO_128.mp4', 'protocol': 'https', 'vcodec': 'none', 'acodec': 'mp4a', 'abr': 128,
                 'ext': 'm4a', 'filesize': 500},
            ],
        }
        out = info.pick_formats(data)
        self.assertEqual([f['label'] for f in out], ['720p', '480p', 'Audio 128 kbps'])
        top = out[0]
        self.assertEqual(decode(top['token'])['u'], 'https://v/DASH_720.mp4')
        self.assertEqual(decode(top['audio_token'])['u'], 'https://v/DASH_AUDIO_128.mp4')
        self.assertEqual(top['filesize'], 3500)
        self.assertEqual(top['filename'], 'post.mp4')
        self.assertNotIn('audio_token', out[2])

    def test_single_file_info_without_formats(self):
        out = info.pick_formats({'title': 't', 'url': 'https://cdn/x', 'ext': 'mp4'})
        self.assertEqual(len(out), 1)


REDDIT_MPD = """<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT10S" minBufferTime="PT1.5S"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static"><Period duration="PT10S">
<AdaptationSet contentType="video" subsegmentAlignment="true">
 <Representation bandwidth="500000" codecs="avc1.4d401e" height="480" id="1" mimeType="video/mp4" width="854">
  <BaseURL>DASH_480.mp4</BaseURL><SegmentBase indexRange="800-900"><Initialization range="0-799"/></SegmentBase>
 </Representation>
 <Representation bandwidth="1000000" codecs="avc1.4d401f" height="720" id="2" mimeType="video/mp4" width="1280">
  <BaseURL>DASH_720.mp4</BaseURL><SegmentBase indexRange="800-900"><Initialization range="0-799"/></SegmentBase>
 </Representation>
</AdaptationSet>
<AdaptationSet contentType="audio" subsegmentAlignment="true">
 <Representation audioSamplingRate="48000" bandwidth="128000" codecs="mp4a.40.2" id="5" mimeType="audio/mp4">
  <BaseURL>DASH_AUDIO_128.mp4</BaseURL><SegmentBase indexRange="700-800"><Initialization range="0-699"/></SegmentBase>
 </Representation>
</AdaptationSet></Period></MPD>"""


class RedditVideoTest(unittest.TestCase):
    def test_reads_the_manifest_and_offers_joined_qualities(self):
        import xml.etree.ElementTree as ET

        def fake_mpd(ie, url, video_id, **kwargs):
            base = url.rsplit('/', 1)[0] + '/'
            return ie._parse_mpd_formats(ET.fromstring(REDDIT_MPD), mpd_base_url=base, mpd_url=url)

        with mock.patch.object(info.InfoExtractor, '_extract_mpd_formats', fake_mpd), \
                mock.patch.object(info, 'record'):
            status, out = info.handle(json.dumps({
                'url': 'https://www.reddit.com/r/factorio/comments/1wy57fg/do_not_walk_on_the_belts/',
                'platform': 'reddit',
                'reddit': {'id': 'ba9rghafmmth1', 'title': 'Do not walk on the belts',
                           'thumbnail': 'javascript:alert(1)', 'duration': 10, 'uploader': 'someone'},
            }).encode())
        self.assertEqual(status, 200, out)
        self.assertEqual(out['title'], 'Do not walk on the belts')
        self.assertIsNone(out['thumbnail'])
        self.assertEqual([f['label'] for f in out['formats']], ['720p', '480p', 'Audio 128 kbps'])
        self.assertEqual(decode(out['formats'][0]['token'])['u'], 'https://v.redd.it/ba9rghafmmth1/DASH_720.mp4')
        self.assertEqual(decode(out['formats'][0]['audio_token'])['u'],
                         'https://v.redd.it/ba9rghafmmth1/DASH_AUDIO_128.mp4')

    def test_ignores_a_video_id_for_other_sites(self):
        with mock.patch.object(info, 'extract_reddit_video') as reddit, \
                mock.patch.object(info, 'extract', return_value={'platform': 'x'}), mock.patch.object(info, 'record'):
            info.handle(json.dumps({'url': 'https://x.com/a/status/1', 'reddit': {'id': 'abcdef'}}).encode())
        reddit.assert_not_called()


class HandleTest(unittest.TestCase):
    def test_bad_json(self):
        self.assertEqual(info.handle(b'{nope')[0], 400)

    def test_unsupported_site(self):
        status, payload = info.handle(json.dumps({'url': 'https://example.com/video'}).encode())
        self.assertEqual(status, 422)
        self.assertIn('support', payload['error'])


MUXED = {'url': 'https://cdn.example/v.mp4', 'protocol': 'https', 'height': 720, 'ext': 'mp4'}


class FailureLogTest(unittest.TestCase):
    def setUp(self):
        self.server, url, self.store = fake_upstash.start()
        self.env = mock.patch.dict(os.environ, {
            'UPSTASH_REDIS_REST_URL': url, 'UPSTASH_REDIS_REST_TOKEN': fake_upstash.TOKEN,
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.server.shutdown()
        self.server.server_close()

    def lookup(self, url, platform=None, **extract):
        body = json.dumps({'url': url, 'platform': platform}).encode()
        if not extract:
            return info.handle(body)
        with mock.patch.object(yt_dlp.YoutubeDL, 'extract_info', **extract):
            return info.handle(body)

    def stats(self):
        return next(iter(self.store.hashes.values()), {})

    def failures(self):
        return [json.loads(e) for lst in self.store.lists.values() for e in lst]

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
        self.lookup('https://youtu.be/abc', 'youtube')
        self.assertEqual(self.stats(), {'info:youtube:coming_soon': 1})
        self.assertEqual(self.failures(), [])

    def test_lookup_still_answers_when_the_store_is_down(self):
        self.server.shutdown()
        self.server.server_close()
        status, _ = self.lookup('https://youtu.be/abc', 'youtube')
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
            self.lookup('https://youtu.be/abc', 'youtube')
        self.assertEqual(self.stats(), {'info:youtube:coming_soon': 1})


class RedactUrlTest(unittest.TestCase):
    def test_keeps_only_params_needed_to_find_the_post(self):
        self.assertEqual(info.redact_url('https://www.facebook.com/watch/?v=123&ref=share&mibextid=x'),
                         'https://www.facebook.com/watch/?v=123')
        self.assertEqual(info.redact_url('https://vm.tiktok.com/ZM1/?_r=1&_t=abc#x'), 'https://vm.tiktok.com/ZM1/')
        self.assertIsNone(info.redact_url(None))


if __name__ == '__main__':
    unittest.main()
