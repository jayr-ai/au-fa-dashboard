#!/usr/bin/env python3
"""Static server for the dashboard - used for local preview and in the Railway container.

`python -m http.server` is not used: it evaluates os.getcwd() at import time, which the
local sandbox denies. Changing directory first, then importing, avoids that.

Binds 127.0.0.1 by default so a local preview is not exposed on the LAN. The container
sets HOST=0.0.0.0, which it must - binding loopback inside a container would make the
service unreachable and Railway's healthcheck would fail with no obvious cause.
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

from http.server import HTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # The page is public and unauthenticated; keep it out of search indexes at
        # least. This is defence in depth, not access control.
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        # data.json changes nightly; never let a proxy pin a stale copy.
        if self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8811))
    host = os.environ.get("HOST", "127.0.0.1")
    sys.stderr.write("serving %s on %s:%d\n" % (ROOT, host, port))
    HTTPServer((host, port), Handler).serve_forever()
