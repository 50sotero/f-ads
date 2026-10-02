"""Run with: python3 -m unittest discover tests"""

import base64
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
os.environ['DOWNLOAD_SIGNING_SECRET'] = 'test-secret'

import info  # noqa: E402


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
