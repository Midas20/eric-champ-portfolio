"""Quick static preview of public/ without Cloudflare tooling.

    python serve.py            # http://localhost:5173
    python serve.py 8080       # another port

No-cache headers, so every edit shows on a normal refresh. Stack URLs
(/stack/<slug>) and /edit/<anything> are served so you can click around,
but publishing from the editor needs the real Functions server:

    npm run dev                # http://localhost:8788  (Cloudflare runtime + local storage)
"""
import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "public"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/stack" or path.startswith("/stack/") or path.startswith("/work/"):
            self.path = "/index.html"
        elif path.startswith("/demo/"):
            self.path = "/demo.html"
        elif path.startswith("/edit/") or path == "/editor":
            self.path = "/editor.html"
        elif path == "/api/site":
            self.path = "/site.json"
        super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT))) as httpd:
        print(f"Serving {ROOT} at http://localhost:{port} (no-cache, static only)")
        httpd.serve_forever()
