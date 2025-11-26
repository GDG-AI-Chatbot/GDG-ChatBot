import { useState } from "react";
import { sendMessage } from "../api/chatApi";
import Sidebar from "../components/Sidebar";
import MessageBox from "../components/MessageBox";

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(
    JSON.parse(localStorage.getItem("messages")) || []
  );

  const handleSend = async () => {
    if (!input) return;
    const newMsg = { role: "user", content: input };
    const next = [...messages, newMsg];
    setMessages(next);
    setInput("");

    const aiRes = await sendMessage(input);
    const aiMsg = { role: "assistant", content: aiRes.answer || "No response" };

    const final = [...next, aiMsg];
    setMessages(final);
    localStorage.setItem("messages", JSON.stringify(final));
  };

  const logout = () => {
    localStorage.clear();
    location.href = "/login";
  };

  return (
    <div className="chat-layout">
      <Sidebar />
      <div className="chat-main">
        <div className="chat-header">
          <span>聊天 Chat</span>
          <button onClick={logout}>登出 Logout</button>
        </div>

        <MessageBox messages={messages} />

        <div className="chat-input">
          <input
            value={input}
            placeholder="輸入訊息 / Enter message"
            onChange={(e) => setInput(e.target.value)}
          />
          <button onClick={handleSend}>送出 / Send</button>
        </div>
      </div>
    </div>
  );
}
