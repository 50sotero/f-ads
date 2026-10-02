"""POST /api/info: look up a video link and return its downloadable formats.

Runs as a Vercel Python function. yt-dlp only reads metadata here; nothing is
downloaded or stored. Each format comes back with a short-lived signed token
that /api/download (src/app/api/download/route.ts) exchanges for the file.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import time
import traceback
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

import yt_dlp
from yt_dlp.utils import DownloadError

TOKEN_TTL_SECONDS = 30 * 60
MAX_URL_LENGTH = 2048

# YouTube comes in phase 2, once rotating proxies are in place.
BLOCKED_HOSTS = {
    'youtube.com': 'YouTube support is coming soon.',
    'youtu.be': 'YouTube support is coming soon.',
    'youtube-nocookie.com': 'YouTube support is coming soon.',
}

YDL_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'skip_download': True,
    'noplaylist': True,
    'cachedir': False,
    'socket_timeout': 15,
    # The generic extractor fetches any URL it is given; keep it off so the
    # function can only talk to sites yt-dlp knows.
    'allowed_extractors': ['default', '-generic', r'-youtube.*'],
}

FORWARDED_HEADERS = ('User-Agent', 'Referer', 'Origin', 'Cookie', 'Accept')


class UserError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _signing_secret():
    secret = os.environ.get('DOWNLOAD_SIGNING_SECRET')
    if not secret:
        raise RuntimeError('DOWNLOAD_SIGNING_SECRET is not set')
    return secret.encode()


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def sign_token(payload):
    body = _b64(json.dumps(payload, separators=(',', ':')).encode())
    sig = _b64(hmac.new(_signing_secret(), body.encode(), hashlib.sha256).digest())
    return f'{body}.{sig}'


def validate_url(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise UserError('Paste a video link first.')
    url = raw.strip()
    if len(url) > MAX_URL_LENGTH:
        raise UserError('That link is too long.')
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        raise UserError('That does not look like a web link.')
    host = parsed.hostname.lower()
    for blocked, message in BLOCKED_HOSTS.items():
        if host == blocked or host.endswith('.' + blocked):
            raise UserError(message, status=422)
    return url


def safe_filename(title, ext):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', ' ', title or 'video')
    name = re.sub(r'\s+', ' ', name).strip()[:80] or 'video'
    return f'{name}.{ext or "mp4"}'


def _headers_for(fmt):
    headers = {k: v for k, v in (fmt.get('http_headers') or {}).items() if k in FORWARDED_HEADERS}
    if fmt.get('cookies'):
        headers['Cookie'] = fmt['cookies']
    return headers


def _is_direct(fmt):
    # Only plain HTTP files can be streamed straight to the browser; HLS/DASH
    # need merging, which is a phase 2 job.
    return bool(fmt.get('url')) and fmt.get('protocol', 'https') in ('http', 'https')


def _label(fmt, kind):
    if kind == 'audio':
        abr = fmt.get('abr')
        return f'Audio {int(abr)} kbps' if abr else 'Audio'
    height = fmt.get('height')
    return f'{height}p' if height else (fmt.get('format_note') or 'Video')


def pick_formats(info):
    candidates = info.get('formats') or [info]
    title = info.get('title')
    expires = int(time.time()) + TOKEN_TTL_SECONDS

    videos, audios = {}, {}
    for fmt in candidates:
        if not _is_direct(fmt):
            continue
        vcodec, acodec = fmt.get('vcodec'), fmt.get('acodec')
        has_video = vcodec != 'none'
        # Unknown acodec (None) usually means a muxed file on X/TikTok/etc.
        has_audio = acodec != 'none'
        if has_video and has_audio:
            key, bucket, kind = fmt.get('height') or 0, videos, 'video'
        elif not has_video and has_audio:
            key, bucket, kind = int(fmt.get('abr') or 0), audios, 'audio'
        else:
            continue
        # Later formats in yt-dlp's list are better, so they win ties.
        bucket[key] = (fmt, kind)

    picked = sorted(videos.items(), reverse=True) + sorted(audios.items(), reverse=True)[:1]
    out = []
    for _, (fmt, kind) in picked:
        ext = fmt.get('ext') or ('m4a' if kind == 'audio' else 'mp4')
        token = sign_token({
            'u': fmt['url'],
            'h': _headers_for(fmt),
            'f': safe_filename(title, ext),
            'e': expires,
        })
        out.append({
            'kind': kind,
            'label': _label(fmt, kind),
            'ext': ext,
            'height': fmt.get('height'),
            'filesize': fmt.get('filesize') or fmt.get('filesize_approx'),
            'token': token,
        })
    return out


def extract(url):
    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            info = ydl.extract_info(url, download=False)
    except DownloadError as e:
        msg = str(e)
        lower = msg.lower()
        if 'unsupported url' in lower or 'no suitable extractor' in lower:
            raise UserError('We do not support that site yet.', status=422)
        if any(w in lower for w in ('login', 'log in', 'sign in', 'private')):
            raise UserError('That post is private or needs a login, so we cannot reach it.', status=422)
        raise UserError('We could not find a video at that link.', status=422)

    if info.get('_type') == 'playlist':
        entries = [e for e in info.get('entries') or [] if e]
        if not entries:
            raise UserError('We could not find a video at that link.', status=422)
        info = entries[0]

    formats = pick_formats(info)
    if not formats:
        raise UserError('This video can not be downloaded directly yet.', status=422)
    return {
        'title': info.get('title'),
        'thumbnail': info.get('thumbnail'),
        'duration': info.get('duration'),
        'uploader': info.get('uploader') or info.get('channel'),
        'site': info.get('extractor_key'),
        'formats': formats,
    }


def handle(body):
    """Returns (status, payload). Shared by the Vercel handler and local tests."""
    try:
        data = json.loads(body or b'{}')
    except ValueError:
        return 400, {'error': 'Invalid request.'}
    try:
        url = validate_url(data.get('url') if isinstance(data, dict) else None)
        return 200, extract(url)
    except UserError as e:
        return e.status, {'error': str(e)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = min(int(self.headers.get('Content-Length') or 0), 16 * 1024)
        try:
            status, payload = handle(self.rfile.read(length))
        except Exception:  # noqa: BLE001 - never leak internals to the browser
            traceback.print_exc()
            status, payload = 500, {'error': 'Something went wrong. Please try again.'}
        out = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        self.send_response(405)
        self.send_header('Allow', 'POST')
        self.end_headers()
