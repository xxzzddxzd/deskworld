#!/usr/bin/env python3
"""场景实验室的本地预览服务器。用法：python3 serve.py [端口]，然后打开 http://localhost:4173"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.realpath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # 改完文件刷新即可见
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print("scene-lab -> http://localhost:%d" % PORT, flush=True)
        httpd.serve_forever()
