"""Serve api/info.py on http://127.0.0.1:8000 for `npm run dev`.

On Vercel the file runs as a serverless function; locally next.config.ts
rewrites /api/info here.
"""

import os
import sys
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
os.environ.setdefault('DOWNLOAD_SIGNING_SECRET', 'dev-secret-change-me')

from info import handler  # noqa: E402

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    print(f'api/info listening on http://127.0.0.1:{port}')
    ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
