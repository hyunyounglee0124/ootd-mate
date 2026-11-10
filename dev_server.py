"""
로컬 테스트용 서버 (배포에는 쓰지 않음)

VS Code의 Go Live(Live Server)는 HTML만 보여주고 파이썬(api/stylist.py)은 실행하지 못한다.
이 파일로 실행하면 Vercel과 같은 구조로 동작한다.
  - index.html, css, js 같은 파일 → 그대로 보여줌
  - /api/stylist 요청 → api/stylist.py 의 handler 가 처리

실행 방법 (셋 중 아무거나)
  1) VS Code: F5  (또는 메뉴 Run → Start Debugging)
  2) VS Code: 메뉴 Terminal → Run Task… → "옷장메이트 실행"
  3) 터미널:  python3 dev_server.py   (Windows: python dev_server.py)

- API 키가 없으면 자동으로 '가짜 응답(MOCK)' 모드로 켜진다 → 설치 없이 바로 화면 테스트 가능
- 켜지면 브라우저가 자동으로 열린다
- 끄기: 터미널에서 Ctrl + C  (F5로 켰다면 위쪽 빨간 네모 ■ 버튼)
"""

import os
import socket
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent

# 1) .env 파일을 읽어서 환경 변수로 등록
#    (VS Code 터미널에 예전 값이 남아 있어도 .env 내용이 항상 이기도록 덮어씀)
env_file = ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")

# 2) 어떤 AI를 쓰는지 (AI_PROVIDER=openai 또는 anthropic)
PROVIDER = (os.environ.get("AI_PROVIDER") or "anthropic").strip().lower()
KEY_NAME = "OPENAI_API_KEY" if PROVIDER == "openai" else "ANTHROPIC_API_KEY"
PACKAGE = "openai" if PROVIDER == "openai" else "anthropic"

# 3) 키가 없으면 자동으로 가짜 응답 모드
if not os.environ.get(KEY_NAME):
    os.environ["MOCK_AI"] = "1"

# 4) 진짜 AI 모드인데 패키지가 없으면 안내 후 가짜 모드로
if os.environ.get("MOCK_AI") != "1":
    try:
        __import__(PACKAGE)
    except ImportError:
        print(f"⚠️  {PACKAGE} 패키지가 설치되지 않았어요. 아래 명령을 터미널에 입력한 뒤 다시 실행하세요.")
        print("    Mac:     python3 -m pip install -r requirements.txt")
        print("    Windows: python -m pip install -r requirements.txt")
        print("    → 지금은 가짜 응답 모드로 켭니다.\n")
        os.environ["MOCK_AI"] = "1"

sys.path.insert(0, str(ROOT / "api"))
from stylist import handler as StylistHandler  # noqa: E402


class DevHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def is_api(self):
        return self.path.split("?")[0].rstrip("/") == "/api/stylist"

    def do_POST(self):
        if self.is_api():
            return StylistHandler.do_POST(self)
        self.send_error(404)

    def do_GET(self):
        if self.is_api():
            return StylistHandler.do_GET(self)
        return super().do_GET()

    def log_message(self, format, *args):
        pass  # 접속 기록 끄기 (터미널 깔끔하게)

    send_json = StylistHandler.send_json


def find_free_port(start):
    """3000번이 이미 쓰이고 있으면 3001, 3002 … 로 자동 변경."""
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


if __name__ == "__main__":
    port = find_free_port(int(os.environ.get("PORT", "3000")))
    url = f"http://localhost:{port}"
    if os.environ.get("MOCK_AI") == "1":
        mode = f"가짜 응답(MOCK) - {KEY_NAME} 가 없어서 테스트 모드"
    else:
        mode = f"실제 AI ({PROVIDER}) 연결됨 ✅"

    print("=" * 60)
    print(f"  👕 옷장메이트 실행 중:  {url}")
    print(f"  AI 모드: {mode}")
    if os.environ.get("MOCK_AI") != "1":
        key = os.environ.get(KEY_NAME, "")
        model_name = os.environ.get("OPENAI_MODEL" if PROVIDER == "openai" else "ANTHROPIC_MODEL") or "(기본값)"
        print(f"  사용 중인 키: {key[:17]}…  (앞부분만 표시) / 모델: {model_name}")
    print("  끄기: 이 터미널을 클릭하고 Ctrl + C")
    print("=" * 60)

    server = ThreadingHTTPServer(("127.0.0.1", port), DevHandler)
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()  # 1초 뒤 브라우저 자동 열기
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 껐어요.")
