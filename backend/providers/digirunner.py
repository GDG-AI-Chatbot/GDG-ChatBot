# providers/digirunner.py
import os
import time
import requests

class DigiRunnerProvider:
    def __init__(self):
        self.base_url = os.getenv("DIGIRUNNER_BASE_URL", "http://localhost:31080").rstrip("/")
        self.token_path = os.getenv("DIGIRUNNER_TOKEN_PATH", "/oauth/token")
        self.chat_path = os.getenv("DIGIRUNNER_CHAT_PATH", "/dify/chat")

        self.client_id = os.getenv("DIGIRUNNER_CLIENT_ID", "")
        self.client_secret = os.getenv("DIGIRUNNER_CLIENT_SECRET", "")

        if not self.client_id or not self.client_secret:
            raise RuntimeError("Missing DIGIRUNNER_CLIENT_ID / DIGIRUNNER_CLIENT_SECRET in .env")

        self._access_token = None
        self._token_expire_at = 0  # epoch seconds

        self.session = requests.Session()

    def _get_access_token(self) -> str:
        # 還沒過期就沿用（提前 10 秒刷新）
        now = time.time()
        if self._access_token and now < self._token_expire_at - 10:
            return self._access_token

        url = f"{self.base_url}{self.token_path}"

        # 這邊最重要：用 auth=(id, secret) 讓 requests 自己加 Authorization: Basic ...
        resp = self.session.post(
            url,
            auth=(self.client_id, self.client_secret),
            data={"grant_type": "client_credentials"},
            headers={"Accept": "application/json"},
            timeout=20,
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Token failed: {resp.status_code} {resp.text}")

        data = resp.json()
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 3600))

        if not token:
            raise RuntimeError(f"Token response missing access_token: {data}")

        self._access_token = token
        self._token_expire_at = time.time() + expires_in
        return token

    def reply(self, user_text: str, conversation_id: int, user_id: int, files=None) -> str:
        token = self._get_access_token()

        url = f"{self.base_url}{self.chat_path}"
        payload = {
            "inputs": {},
            "query": user_text,
            "response_mode": "blocking",
            "user": str(user_id),
        }

        resp = self.session.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
            timeout=60,
        )

        if resp.status_code != 200:
            raise RuntimeError(f"Chat failed: {resp.status_code} {resp.text}")

        data = resp.json()

        # 依你貼的 response，回答在 answer
        return data.get("answer", "")
