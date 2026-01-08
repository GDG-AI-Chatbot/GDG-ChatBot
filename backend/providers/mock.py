from .base import ChatProvider

class MockProvider(ChatProvider):
    def reply(self, user_text: str, conversation_id: int, user_id: int, files=None) -> str:
        file_note = ""
        if files:
            names = [f.get("filename", str(f.get("file_id"))) for f in files]
            file_note = f"（附件：{', '.join(names)}）"
        return f"你剛剛說：{user_text}{file_note}（目前是假回覆，之後再接 digiRunner/Dify）"
