"""POST /api/info: look up a video link and return its downloadable formats.

Runs as a Vercel Python function. yt-dlp only reads metadata here; nothing is
downloaded or stored. Each format comes back with a short-lived signed token
that /api/download (src/app/api/download/route.ts) exchanges for the file.

Every lookup is counted, and failures worth fixing are stored with enough
detail to reproduce them (see "Failure log" below and /admin).
"""

import base64
import hashlib
import hmac
import json
import os
import re
import time
import traceback
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qsl, urlencode, urlparse

import yt_dlp
from yt_dlp.utils import DownloadError
from yt_dlp.version import __version__ as YTDLP_VERSION

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

# Share buttons in the apps hand out short links that only redirect to the
# real post, and yt-dlp can't read them with the generic extractor off. We
# follow the redirect ourselves, but only while it stays on the platform.
# (host, path prefix or regex or None, domains the redirect may land on)
SHARE_LINKS = (
    ('fb.watch', None, ('facebook.com',)),
    ('fb.com', None, ('facebook.com', 'fb.com')),
    ('facebook.com', '/share/', ('facebook.com',)),
    ('redd.it', None, ('reddit.com', 'redd.it')),
    ('reddit.com', re.compile(r'/r/[^/]+/s/'), ('reddit.com',)),
    ('pin.it', None, ('pinterest.com', 'pin.it')),
    ('instagr.am', None, ('instagram.com', 'instagr.am')),
    ('b23.tv', None, ('bilibili.com', 'b23.tv')),
)
SHARE_LINK_MAX_REDIRECTS = 5
BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
)


class UserError(Exception):
    """A failure we explain to the user. `code` is what the failure log counts."""

    def __init__(self, message, status=400, code='invalid_url', detail=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.detail = detail


# --- Failure log -------------------------------------------------------------
# Counters for every outcome plus full records for failures we can act on,
# written to Upstash Redis over its REST API. The Vercel "Upstash for Redis"
# integration sets KV_REST_API_URL/KV_REST_API_TOKEN; Upstash's own console
# names them UPSTASH_REDIS_REST_URL/TOKEN. Both work. Without a store, records
# still go to the function logs. src/lib/telemetry.ts writes and reads the same
# keys, so keep the two in sync.

KEY_PREFIX = 'fads'
STATS_RETENTION_DAYS = 90
FAILURE_RETENTION_DAYS = 30
MAX_FAILURES_PER_DAY = 2000
STORE_TIMEOUT_SECONDS = 2
# Failures we keep in full; every other outcome is only counted.
STORED_CODES = {'share_link_failed', 'login_required', 'not_found', 'no_direct_formats', 'internal_error'}
# Query parameters some sites need to find the post. All others (share ids,
# tracking tags) are dropped before a link is stored.
KEPT_QUERY_PARAMS = {'v', 'id', 'story_fbid', 'fbid'}
PLATFORM_ID = re.compile(r'[a-z0-9]{1,20}')


def _store_config():
    url = os.environ.get('UPSTASH_REDIS_REST_URL') or os.environ.get('KV_REST_API_URL')
    token = os.environ.get('UPSTASH_REDIS_REST_TOKEN') or os.environ.get('KV_REST_API_TOKEN')
    return (url.rstrip('/'), token) if url and token else None


def redis_pipeline(commands):
    """Runs Redis commands in one request. Returns None when no store is set up."""
    config = _store_config()
    if not config:
        return None
    url, token = config
    body = json.dumps([[str(arg) for arg in cmd] for cmd in commands]).encode()
    req = urllib.request.Request(
        f'{url}/pipeline',
        data=body,
        method='POST',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=STORE_TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read())


def redact_url(url):
    """The link without tracking parameters or fragment, short enough to store."""
    if not url:
        return None
    parsed = urlparse(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parsed.query) if k in KEPT_QUERY_PARAMS])
    clean = parsed._replace(query=query, fragment='', params='').geturl()
    return clean[:300]


def clean_platform(value):
    return value if isinstance(value, str) and PLATFORM_ID.fullmatch(value) else 'unknown'


def record(stage, code, platform='unknown', *, url=None, host=None, extractor=None, detail=None):
    """Counts an outcome and, for failures worth fixing, stores the details. Never raises."""
    try:
        day = time.strftime('%Y-%m-%d', time.gmtime())
        stats_key = f'{KEY_PREFIX}:stats:{day}'
        commands = [
            ['HINCRBY', stats_key, f'{stage}:{platform}:{code}', 1],
            ['EXPIRE', stats_key, STATS_RETENTION_DAYS * 86400],
        ]
        if code in STORED_CODES:
            event = {
                't': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'stage': stage,
                'code': code,
                'platform': platform,
                'url': redact_url(url),
                'host': host or (urlparse(url).hostname if url else None),
                'extractor': extractor,
                'detail': (detail or '')[:600] or None,
                'version': YTDLP_VERSION,
                'build': (os.environ.get('VERCEL_GIT_COMMIT_SHA') or 'local')[:7],
                'region': os.environ.get('VERCEL_REGION'),
            }
            print(json.dumps({'failure': event}))
            failures_key = f'{KEY_PREFIX}:failures:{day}'
            commands += [
                ['LPUSH', failures_key, json.dumps(event)],
                ['LTRIM', failures_key, 0, MAX_FAILURES_PER_DAY - 1],
                ['EXPIRE', failures_key, FAILURE_RETENTION_DAYS * 86400],
            ]
        if code == 'unsupported_site' and host:
            # Which sites people try that we don't support yet.
            demand_key = f'{KEY_PREFIX}:demand:{day[:7]}'
            commands += [['ZINCRBY', demand_key, 1, host.lower()], ['EXPIRE', demand_key, 400 * 86400]]
        redis_pipeline(commands)
    except Exception:  # noqa: BLE001 - logging must never break a lookup
        traceback.print_exc()


# --- Signed download tokens --------------------------------------------------

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


# --- Links -------------------------------------------------------------------

def host_matches(host, domain):
    host = (host or '').lower()
    return host == domain or host.endswith('.' + domain)


def validate_url(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise UserError('Paste a video link first.', code='empty')
    url = raw.strip()
    if len(url) > MAX_URL_LENGTH:
        raise UserError('That link is too long.', code='too_long')
    if '://' not in url:
        url = 'https://' + url
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or '.' not in (parsed.hostname or ''):
        raise UserError('That does not look like a web link.', code='invalid_url')
    for blocked, message in BLOCKED_HOSTS.items():
        if host_matches(parsed.hostname, blocked):
            raise UserError(message, status=422, code='coming_soon')
    return url


def share_link_domains(url):
    """Domains a share link may redirect to, or None if it isn't one."""
    parsed = urlparse(url)
    for host, path, domains in SHARE_LINKS:
        if not host_matches(parsed.hostname, host):
            continue
        if path is None:
            return domains
        if isinstance(path, str) and parsed.path.startswith(path):
            return domains
        if not isinstance(path, str) and path.match(parsed.path):
            return domains
    return None


def _share_link_error(detail):
    return UserError('We could not open that share link. Try the full link instead.', status=422,
                     code='share_link_failed', detail=detail)


class _StayOnPlatform(urllib.request.HTTPRedirectHandler):
    max_redirections = SHARE_LINK_MAX_REDIRECTS

    def __init__(self, domains):
        super().__init__()
        self.domains = domains

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlparse(newurl)
        if target.scheme not in ('http', 'https') or not any(
            host_matches(target.hostname, d) for d in self.domains
        ):
            raise _share_link_error(f'redirect left the platform: {target.scheme}://{target.hostname}')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def follow_redirects(url, domains, timeout=10):
    opener = urllib.request.build_opener(_StayOnPlatform(domains))
    req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA, 'Accept': 'text/html'})
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.geturl()
    except urllib.error.HTTPError as e:
        # Some sites answer the final page with an error for bots, but the
        # redirect already told us where the post is.
        if e.url and e.url != url:
            return e.url
        raise _share_link_error(f'HTTP {e.code} without a redirect')
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise _share_link_error(f'{type(e).__name__}: {e}')


def resolve_share_link(url):
    domains = share_link_domains(url)
    if not domains:
        return url
    resolved = follow_redirects(url, domains)
    if resolved == url:
        raise _share_link_error('no redirect')
    return validate_url(resolved)


# --- Formats -----------------------------------------------------------------

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
    # Only plain HTTP files can be streamed straight to the browser; HLS and
    # segmented DASH would need joining on a server, which is a phase 2 job.
    return bool(fmt.get('url')) and fmt.get('protocol', 'https') in ('http', 'https')


def _label(fmt, kind):
    if kind == 'audio':
        abr = fmt.get('abr')
        return f'Audio {int(abr)} kbps' if abr else 'Audio'
    height = fmt.get('height')
    return f'{height}p' if height else (fmt.get('format_note') or 'Video')


def describe_formats(info):
    """A one-line summary of what yt-dlp found, for failures with no usable format."""
    counts = {}
    for fmt in info.get('formats') or [info]:
        streams = '+'.join(
            name for name, codec in (('video', fmt.get('vcodec')), ('audio', fmt.get('acodec'))) if codec != 'none'
        ) or 'none'
        key = f'{fmt.get("protocol") or "?"} {streams}'
        counts[key] = counts.get(key, 0) + 1
    return ', '.join(f'{k} x{n}' for k, n in sorted(counts.items())) or 'no formats'


# Files the browser can join into one MP4 (see src/lib/mergeAv.ts).
MERGEABLE_VIDEO_EXTS = ('mp4',)
MERGEABLE_AUDIO_EXTS = ('m4a', 'mp4')


def pick_formats(info, *, platform='unknown', source=None):
    candidates = info.get('formats') or [info]
    title = info.get('title')
    expires = int(time.time()) + TOKEN_TTL_SECONDS

    videos, video_only, audios = {}, {}, {}
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
        elif has_video and fmt.get('ext') in MERGEABLE_VIDEO_EXTS:
            key, bucket, kind = fmt.get('height') or 0, video_only, 'video'
        else:
            continue
        # Later formats in yt-dlp's list are better, so they win ties.
        bucket[key] = (fmt, kind)

    def sign(fmt, ext):
        return sign_token({
            'u': fmt['url'],
            'h': _headers_for(fmt),
            'f': safe_filename(title, ext),
            'e': expires,
            # For the failure log if the download itself fails.
            'p': platform,
            's': redact_url(source),
        })

    def size(fmt):
        return fmt.get('filesize') or fmt.get('filesize_approx')

    best_audio = max(audios.items())[1][0] if audios else None
    out = []
    for _, (fmt, kind) in sorted(videos.items(), reverse=True):
        ext = fmt.get('ext') or 'mp4'
        out.append({'kind': kind, 'label': _label(fmt, kind), 'ext': ext, 'height': fmt.get('height'),
                    'filesize': size(fmt), 'token': sign(fmt, ext)})

    # Sites like Reddit keep picture and sound in separate files. When there is no
    # file with both, offer each picture size with the best sound; the browser joins them.
    if not videos and best_audio is not None and best_audio.get('ext') in MERGEABLE_AUDIO_EXTS:
        audio_token = sign(best_audio, best_audio.get('ext'))
        for _, (fmt, kind) in sorted(video_only.items(), reverse=True):
            sizes = (size(fmt), size(best_audio))
            out.append({'kind': kind, 'label': _label(fmt, kind), 'ext': 'mp4', 'height': fmt.get('height'),
                        'filesize': sum(sizes) if all(sizes) else None, 'token': sign(fmt, 'mp4'),
                        'audio_token': audio_token, 'filename': safe_filename(title, 'mp4')})

    if best_audio is not None:
        ext = best_audio.get('ext') or 'm4a'
        out.append({'kind': 'audio', 'label': _label(best_audio, 'audio'), 'ext': ext, 'height': None,
                    'filesize': size(best_audio), 'token': sign(best_audio, ext)})
    return out


def _strip_ansi(text):
    return re.sub(r'\x1b\[[0-9;]*m', '', text)


def extract(url, *, platform='unknown', source=None):
    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            info = ydl.extract_info(url, download=False)
    except DownloadError as e:
        msg = _strip_ansi(str(e))
        lower = msg.lower()
        if 'unsupported url' in lower or 'no suitable extractor' in lower:
            raise UserError('We do not support that site yet.', status=422, code='unsupported_site')
        if any(w in lower for w in ('login', 'log in', 'sign in', 'private')):
            raise UserError('That post is private or needs a login, so we cannot reach it.', status=422,
                            code='login_required', detail=msg)
        raise UserError('We could not find a video at that link.', status=422, code='not_found', detail=msg)

    if info.get('_type') == 'playlist':
        entries = [e for e in info.get('entries') or [] if e]
        if not entries:
            raise UserError('We could not find a video at that link.', status=422, code='not_found',
                            detail='empty playlist')
        info = entries[0]

    if platform == 'unknown':
        platform = clean_platform((info.get('extractor_key') or '').lower())
    formats = pick_formats(info, platform=platform, source=source or url)
    if not formats:
        raise UserError('This video can not be downloaded directly yet.', status=422,
                        code='no_direct_formats', detail=describe_formats(info))
    return {
        'title': info.get('title'),
        'thumbnail': info.get('thumbnail'),
        'duration': info.get('duration'),
        'uploader': info.get('uploader') or info.get('channel'),
        'site': info.get('extractor_key'),
        'platform': platform,
        'formats': formats,
    }


# --- Request handling --------------------------------------------------------

def handle(body):
    """Returns (status, payload). Shared by the Vercel handler and local tests."""
    try:
        data = json.loads(body or b'{}')
        if not isinstance(data, dict):
            raise ValueError
    except ValueError:
        record('info', 'bad_request')
        return 400, {'error': 'Invalid request.'}

    platform = clean_platform(data.get('platform'))
    raw = data.get('url')
    url = None
    try:
        url = validate_url(raw)
        result = extract(resolve_share_link(url), platform=platform, source=url)
        record('info', 'ok', result['platform'])
        return 200, result
    except UserError as e:
        host = urlparse(url).hostname if url else None
        record('info', e.code, platform, url=url if e.code in STORED_CODES else None, host=host,
               detail=e.detail)
        return e.status, {'error': str(e)}
    except Exception:  # noqa: BLE001 - never leak internals to the browser
        tb = traceback.format_exc()
        print(tb)
        record('info', 'internal_error', platform, url=url, detail=tb[-600:])
        return 500, {'error': 'Something went wrong. Please try again.'}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = min(int(self.headers.get('Content-Length') or 0), 16 * 1024)
        try:
            status, payload = handle(self.rfile.read(length))
        except Exception:  # noqa: BLE001 - last resort; handle() already logs
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
