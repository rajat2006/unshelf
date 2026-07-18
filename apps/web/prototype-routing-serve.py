#!/usr/bin/env python3
"""THROWAWAY SPA-fallback server for the #58 routing prototype.

Serves apps/web/prototype-routing.html for *every* path so the History-API
routes work for real: clean URLs, a working refresh, and cold deep-links
(open /trails/rust/stops/async or /items/i1 fresh and it renders). Never
merged to main.

    python3 apps/web/prototype-routing-serve.py
    → http://127.0.0.1:5178/
"""
import http.server
import os
import socketserver

PORT = 5178
HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "prototype-routing.html")


class SPAHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        with open(HTML, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # quiet


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), SPAHandler) as httpd:
        print(f"Routing prototype (#58) → http://127.0.0.1:{PORT}/")
        print("Deep-link tests:")
        print(f"  http://127.0.0.1:{PORT}/all?label=video")
        print(f"  http://127.0.0.1:{PORT}/trails/rust")
        print(f"  http://127.0.0.1:{PORT}/trails/rust/stops/async   (cold-load an open Stop)")
        print(f"  http://127.0.0.1:{PORT}/items/i1                  (cold-load an Item)")
        print(f"  http://127.0.0.1:{PORT}/sign-in?redirect=/items/i1")
        httpd.serve_forever()
