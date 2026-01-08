from typing import Any, Dict, List, Optional

class ChatProvider:
    def reply(
        self,
        user_text: str,
        conversation_id: int,
        user_id: int,
        files: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        raise NotImplementedError
