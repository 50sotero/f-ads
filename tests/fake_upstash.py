"""A tiny stand-in for Upstash's Redis REST API, for tests.

Supports only the commands the failure log and the YouTube cookies use. Import
`start()` from Python tests, or run `python3 tests/fake_upstash.py` and read
"PORT <n>" from stdout.
"""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = 'test-token'


class Store:
    def __init__(self):
        self.strings, self.lists, self.hashes, self.zsets, self.ttls = {}, {}, {}, {}, {}
        self.lock = threading.Lock()

    def run(self, cmd):
        name, args = cmd[0].upper(), cmd[1:]
        if name == 'GET':
            return self.strings.get(args[0])
        if name == 'SET':
            self.strings[args[0]] = args[1]
            return 'OK'
        if name == 'DEL':
            return sum(self.strings.pop(key, None) is not None for key in args)
        if name == 'HINCRBY':
            key, field, by = args
            h = self.hashes.setdefault(key, {})
            h[field] = h.get(field, 0) + int(by)
            return h[field]
        if name == 'HGETALL':
            flat = []
            for field, value in self.hashes.get(args[0], {}).items():
                flat += [field, str(value)]
            return flat
        if name == 'LPUSH':
            key, *values = args
            lst = self.lists.setdefault(key, [])
            for v in values:
                lst.insert(0, v)
            return len(lst)
        if name == 'LTRIM':
            key, start, stop = args[0], int(args[1]), int(args[2])
            lst = self.lists.get(key, [])
            self.lists[key] = lst[start:stop + 1 if stop >= 0 else None]
            return 'OK'
        if name == 'LRANGE':
            key, start, stop = args[0], int(args[1]), int(args[2])
            lst = self.lists.get(key, [])
            return lst[start:stop + 1 if stop >= 0 else None]
        if name == 'ZINCRBY':
            key, by, member = args
            z = self.zsets.setdefault(key, {})
            z[member] = z.get(member, 0) + float(by)
            return str(z[member])
        if name == 'ZREVRANGE':
            key, start, stop = args[0], int(args[1]), int(args[2])
            items = sorted(self.zsets.get(key, {}).items(), key=lambda kv: -kv[1])
            items = items[start:stop + 1 if stop >= 0 else None]
            if len(args) > 3 and args[3].upper() == 'WITHSCORES':
                flat = []
                for member, score in items:
                    flat += [member, str(int(score) if score == int(score) else score)]
                return flat
            return [m for m, _ in items]
        if name == 'EXPIRE':
            self.ttls[args[0]] = int(args[1])
            return 1
        raise ValueError(f'ERR unsupported command {name}')


def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.headers.get('Authorization') != f'Bearer {TOKEN}':
                self.send_response(401)
                self.end_headers()
                return
            if self.path != '/pipeline':
                self.send_response(404)
                self.end_headers()
                return
            commands = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            results = []
            with store.lock:
                for cmd in commands:
                    if not all(isinstance(a, str) for a in cmd):
                        results.append({'error': 'ERR arguments must be strings'})
                        continue
                    try:
                        results.append({'result': store.run(cmd)})
                    except ValueError as e:
                        results.append({'error': str(e)})
            out = json.dumps(results).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        def log_message(self, *args):
            pass

    return Handler


def start():
    """Returns (server, base_url, store). Call server.shutdown() when done."""
    store = Store()
    server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(store))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_port}', store


if __name__ == '__main__':
    store = Store()
    server = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 0), make_handler(store))
    print(f'PORT {server.server_port}', flush=True)
    server.serve_forever()
