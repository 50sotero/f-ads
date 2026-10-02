"""Run with: python3 -m unittest discover tests"""

import base64
import json
import os
import sys
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
os.environ['DOWNLOAD_SIGNING_SECRET'] = 'test-secret'

import info  # noqa: E402
import yt_dlp  # noqa: E402

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


if __name__ == '__main__':
    unittest.main()
