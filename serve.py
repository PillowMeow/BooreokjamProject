#!/usr/bin/env python3
"""개발용 정적 서버.

python -m http.server 를 그대로 써도 되지만, 브라우저가 ES 모듈을 캐시해서
파일을 고쳐도 새로고침이 안 먹는 일이 잦다. 이 서버는 캐시를 끈다.

    python serve.py            # http://localhost:8123
    python serve.py 9000       # 포트 지정
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    root = Path(__file__).resolve().parent
    handler = partial(NoCacheHandler, directory=str(root))
    with ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"http://localhost:{port}/  ({root})")
        print("Ctrl+C 로 종료")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n종료")


if __name__ == "__main__":
    main()
