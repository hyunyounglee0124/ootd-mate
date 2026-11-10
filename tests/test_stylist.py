"""
api/stylist.py 자동 테스트 (진짜 AI는 부르지 않음 → 요금 0원)
실행: python3 -m unittest discover tests -v
"""

import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import stylist  # noqa: E402

try:
    import httpx2 as httpx  # 최신 openai/anthropic 패키지가 쓰는 이름
except ImportError:
    import httpx  # 예전 버전

GOOD = {"temperature": "12", "weather": "맑음", "schedule": "조별 발표", "style": "", "color": "네이비", "request": ""}


class ValidateTest(unittest.TestCase):
    def test_정상_입력(self):
        q, err = stylist.validate(GOOD)
        self.assertIsNone(err)
        self.assertEqual(q["temperature"], 12)

    def test_빈_입력(self):
        _, err = stylist.validate({"temperature": "", "weather": ""})
        self.assertIn("필수값", err)

    def test_기온_범위(self):
        _, err = stylist.validate({**GOOD, "temperature": "99"})
        self.assertIn("기온", err)

    def test_기온_문자(self):
        _, err = stylist.validate({**GOOD, "temperature": "따뜻함"})
        self.assertIn("숫자", err)

    def test_없는_선택지(self):
        _, err = stylist.validate({**GOOD, "weather": "<script>"})
        self.assertIn("선택지", err)

    def test_긴_입력(self):
        _, err = stylist.validate({**GOOD, "request": "가" * 201})
        self.assertIn("200자", err)


class ParseTest(unittest.TestCase):
    def test_군더더기_섞인_JSON(self):
        text = '네!\n{"summary":"s","outfits":[{"title":"t","top":"a","bottom":"b","outer":"c","shoes":"d","reason":"r"}],"tip":"x"}'
        self.assertEqual(stylist.parse_answer(text)["outfits"][0]["top"], "a")

    def test_JSON_없음(self):
        with self.assertRaises(ValueError):
            stylist.parse_answer("JSON이 없어요")


class AskAiTest(unittest.TestCase):
    def setUp(self):
        self.q, _ = stylist.validate(GOOD)

    @mock.patch.dict(os.environ, {"MOCK_AI": "0", "ANTHROPIC_API_KEY": ""})
    def test_키_없음은_500(self):
        status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 500)
        self.assertIn("ANTHROPIC_API_KEY", body["error"])

    @mock.patch.dict(os.environ, {"MOCK_AI": "1", "MOCK_FAIL": "", "MOCK_DELAY": "0"})
    def test_가짜_응답(self):
        status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 200)
        self.assertEqual(len(body["outfits"]), 3)

    @mock.patch.dict(os.environ, {"MOCK_AI": "1", "MOCK_FAIL": "500", "MOCK_DELAY": "0"})
    def test_가짜_오류(self):
        status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 500)


class OpenAiTest(unittest.TestCase):
    """OpenAI 방식 (진짜 서버는 부르지 않고 가짜 응답으로 검사)"""
    def setUp(self):
        self.q, _ = stylist.validate(GOOD)
        self.env = {"MOCK_AI": "0", "AI_PROVIDER": "openai", "OPENAI_API_KEY": "test",
                    "OPENAI_BASE_URL": "https://example.invalid/v1", "OPENAI_MODEL": "test-model"}

    def fake_client(self, content=None, error=None):
        client = mock.MagicMock()
        if error:
            client.chat.completions.create.side_effect = error
        else:
            msg = mock.MagicMock(); msg.content = content
            client.chat.completions.create.return_value = mock.MagicMock(choices=[mock.MagicMock(message=msg)])
        return client

    def test_정상(self):
        import openai
        answer = '{"summary":"s","outfits":[{"title":"t","top":"a","bottom":"b","outer":"c","shoes":"d","reason":"r"}],"tip":"x"}'
        client = self.fake_client(answer)
        with mock.patch.dict(os.environ, self.env), mock.patch.object(openai, "OpenAI", return_value=client) as made:
            status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 200)
        self.assertEqual(body["outfits"][0]["top"], "a")
        self.assertEqual(made.call_args.kwargs["base_url"], "https://example.invalid/v1")
        self.assertEqual(client.chat.completions.create.call_args.kwargs["model"], "test-model")

    def test_키_없음(self):
        with mock.patch.dict(os.environ, {**self.env, "OPENAI_API_KEY": ""}):
            status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 500)
        self.assertIn("OPENAI_API_KEY", body["error"])

    def test_키_틀림(self):
        import openai
        res = httpx.Response(401, request=httpx.Request("POST", "https://x"))
        err = openai.AuthenticationError("bad", response=res, body=None)
        with mock.patch.dict(os.environ, self.env), mock.patch.object(openai, "OpenAI", return_value=self.fake_client(error=err)):
            status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 500)
        self.assertIn("키", body["error"])

    def test_연결_실패(self):
        import openai
        err = openai.APIConnectionError(request=httpx.Request("POST", "https://x"))
        with mock.patch.dict(os.environ, self.env), mock.patch.object(openai, "OpenAI", return_value=self.fake_client(error=err)):
            status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 502)
        self.assertIn("BASE_URL", body["error"])


class AnthropicTest(unittest.TestCase):
    """Claude(코디세이 Anthropic 호환) 방식 (진짜 서버는 부르지 않음)"""
    def setUp(self):
        self.q, _ = stylist.validate(GOOD)
        self.env = {"MOCK_AI": "0", "AI_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "sk-cody-live-test",
                    "ANTHROPIC_BASE_URL": "", "ANTHROPIC_MODEL": ""}

    def fake_client(self, text=None, error=None):
        client = mock.MagicMock()
        if error:
            client.messages.create.side_effect = error
        else:
            block = mock.MagicMock(type="text", text=text)
            client.messages.create.return_value = mock.MagicMock(content=[block])
        return client

    def test_코디세이_키면_주소와_모델_자동(self):
        import anthropic
        answer = '{"summary":"s","outfits":[{"title":"t","top":"a","bottom":"b","outer":"c","shoes":"d","reason":"r"}],"tip":"x"}'
        client = self.fake_client(answer)
        with mock.patch.dict(os.environ, self.env), mock.patch.object(anthropic, "Anthropic", return_value=client) as made:
            status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 200)
        self.assertEqual(made.call_args.kwargs["base_url"], "https://copa.codyssey.kr")
        self.assertEqual(made.call_args.kwargs["default_headers"]["x-api-key"], "sk-cody-live-test")
        self.assertEqual(client.messages.create.call_args.kwargs["model"], "claude-haiku-4")

    def test_키_종류가_틀리면_403_안내(self):
        import anthropic
        res = httpx.Response(403, request=httpx.Request("POST", "https://x"))
        err = anthropic.PermissionDeniedError("not allowed", response=res, body=None)
        with mock.patch.dict(os.environ, self.env), mock.patch.object(anthropic, "Anthropic", return_value=self.fake_client(error=err)):
            status, body = stylist.ask_ai(self.q)
        self.assertEqual(status, 500)
        self.assertIn("Anthropic 호환", body["error"])

    def test_공식_키면_주소_기본값(self):
        self.assertIsNone(stylist.default_base_url("sk-ant-xxx"))
        self.assertEqual(stylist.default_base_url("sk-cody-live-x", "/v1"), "https://copa.codyssey.kr/v1")


if __name__ == "__main__":
    unittest.main()
