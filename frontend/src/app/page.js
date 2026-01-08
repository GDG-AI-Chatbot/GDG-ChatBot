"use client";

import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

export default function Page() {
  // Auth
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("Polly");
  const [password, setPassword] = useState("123");
  const [token, setToken] = useState("");

  // Conversations
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);

  // Messages
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");

  // Files (先保留：上傳成功顯示資訊；之後再綁定到訊息)
  const [file, setFile] = useState(null);
  const [uploadInfo, setUploadInfo] = useState("");

  const [myFiles, setMyFiles] = useState([]); // [{file_id, filename}]
  const [selectedFileIds, setSelectedFileIds] = useState([]); // [id, id...]

  // ---------- helpers ----------
  async function apiJson(path, method = "GET", body = null, t = token) {
    const headers = {};
    if (body !== null) headers["Content-Type"] = "application/json";
    if (t) headers["Authorization"] = `Bearer ${t}`;

    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }

  async function ensureAtLeastOneConversation(t = token) {
    const data = await apiJson("/conversations", "GET", null, t);
    const list = data.conversations || [];
    setConversations(list);

    // 如果沒有聊天室，自動建立一個
    if (list.length === 0) {
      const created = await apiJson("/conversations", "POST", { title: "New Chat" }, t);
      const newId = created.conversation_id;
      // 重新載入列表
      const data2 = await apiJson("/conversations", "GET", null, t);
      const list2 = data2.conversations || [];
      setConversations(list2);

      setActiveConversationId(newId);
      await loadMessages(newId, t);
      return;
    }

    // 有聊天室：如果還沒選，預設選第一個（list 已經是 DESC，第一個通常是最新）
    if (!activeConversationId) {
      const firstId = list[0].id;
      setActiveConversationId(firstId);
      await loadMessages(firstId, t);
    }
  }

  async function loadMessages(conversationId, t = token) {
    const data = await apiJson(`/conversations/${conversationId}/messages`, "GET", null, t);
    setMessages(data.messages || []);
  }

  // ---------- lifecycle ----------
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) {
      setToken(t);
      // 登入狀態下：載入聊天室列表 + 預設選一個
      ensureAtLeastOneConversation(t).catch((e) => {
        // token 失效就登出
        console.error(e);
        localStorage.removeItem("token");
        setToken("");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- auth ----------
  async function register() {
    try {
      await apiJson("/auth/register", "POST", { username, password }, "");
      alert("註冊成功！請登入");
      setMode("login");
    } catch (e) {
      alert(`註冊失敗：${e.message}`);
    }
  }

  async function login() {
    try {
      const data = await apiJson("/auth/login", "POST", { username, password }, "");
      localStorage.setItem("token", data.access_token);
      setToken(data.access_token);

      // 登入後：載入聊天室列表/預設聊天室
      await ensureAtLeastOneConversation(data.access_token);
    } catch (e) {
      alert(`登入失敗：${e.message}`);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setMessage("");
    setUploadInfo("");
  }

  // ---------- conversations ----------
  async function createConversation() {
    try {
      const created = await apiJson("/conversations", "POST", { title: "New Chat" });
      const newId = created.conversation_id;

      const data2 = await apiJson("/conversations", "GET");
      const list2 = data2.conversations || [];
      setConversations(list2);

      setActiveConversationId(newId);
      await loadMessages(newId);
    } catch (e) {
      alert(`建立聊天室失敗：${e.message}`);
    }
  }

  async function selectConversation(id) {
    setActiveConversationId(id);
    try {
      await loadMessages(id);
    } catch (e) {
      alert(`載入訊息失敗：${e.message}`);
    }
  }

  // ---------- chat ----------
  async function sendMessage() {
    const text = message.trim();
    if (!text) return;
    if (!activeConversationId) {
      alert("尚未選擇聊天室");
      return;
    }

    try {
      await apiJson("/chat", "POST", {
        conversation_id: activeConversationId,
        message: text,
        file_ids: selectedFileIds,
      });
      setSelectedFileIds([]);
      setMessage("");
      await loadMessages(activeConversationId);
    } catch (e) {
      alert(`送出失敗：${e.message}`);
    }
  }

  // ---------- upload ----------
  async function uploadFile() {
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API}/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      setUploadInfo(`上傳成功：${data.filename}（file_id=${data.file_id}）`);
      setMyFiles((prev) => [{ file_id: data.file_id, filename: data.filename }, ...prev]);
    } catch (e) {
      alert(`上傳失敗：${e.message}`);
    }
  }

  async function downloadWithToken(fileId, filename) {
  try {
    const res = await fetch(`${API}/files/${fileId}/download`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } catch (e) {
    alert(`下載失敗：${e.message}`);
  }
}

  // ---------- UI ----------
  if (!token) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>GDG Chatbot（前端 v2）</h1>
        <p style={{ opacity: 0.7 }}>現在加入聊天室列表（Conversations）。</p>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => setMode("login")}>登入</button>
          <button onClick={() => setMode("register")}>註冊</button>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {mode === "register" ? (
            <button onClick={register}>註冊</button>
          ) : (
            <button onClick={login}>登入</button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{ height: "90vh", display: "flex", gap: 12, padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      {/* 左側：聊天室列表 */}
      <aside style={{ width: 280, border: "1px solid #ddd", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <b>聊天室</b>
          <button onClick={logout}>登出</button>
        </div>

        <button onClick={createConversation}>＋ 新增聊天室</button>

        <div style={{ marginTop: 10, overflowY: "auto", flex: 1 }}>
          {conversations.map((c) => {
            const active = c.id === activeConversationId;
            return (
              <div
                key={c.id}
                onClick={() => selectConversation(c.id)}
                style={{
                  padding: "10px 8px",
                  marginBottom: 6,
                  borderRadius: 8,
                  cursor: "pointer",
                  border: "1px solid #ddd",
                  background: active ? "#f3f3f3" : "white",
                }}
                title={c.created_at}
              >
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>id: {c.id}</div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 右側：聊天區 */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 上傳 */}
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <b>上傳檔案</b>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button onClick={uploadFile}>上傳</button>
          </div>
          {uploadInfo && <p style={{ marginTop: 8, opacity: 0.75 }}>{uploadInfo}</p>}
          <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            （下一步我們會把 file_id 綁到訊息，送去 digiRunner/Dify）
          </p>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <b>選擇要附加到下一則訊息的檔案</b>
          {myFiles.length === 0 ? (
            <p style={{ opacity: 0.7, marginTop: 6 }}>目前沒有已上傳檔案</p>
          ) : (
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {myFiles.map((f) => (
                <label key={f.file_id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedFileIds.includes(f.file_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFileIds((prev) => [...prev, f.file_id]);
                      } else {
                        setSelectedFileIds((prev) => prev.filter((id) => id !== f.file_id));
                      }
                    }}
                  />
                  <span>
                    {f.filename} <span style={{ opacity: 0.6 }}>(id: {f.file_id})</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {selectedFileIds.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              已選：{selectedFileIds.join(", ")}
            </p>
          )}

          <button
            style={{ marginTop: 10 }}
            onClick={() => setSelectedFileIds([])}
            disabled={selectedFileIds.length === 0}
          >
            清空選取
          </button>
        </div>

        {/* 訊息顯示 */}
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, flex: 1, overflowY: "auto" }}>
          {!activeConversationId ? (
            <p style={{ opacity: 0.7 }}>請先選擇或建立一個聊天室</p>
          ) : messages.length === 0 ? (
            <p style={{ opacity: 0.7 }}>這個聊天室目前沒有訊息，來傳第一句吧！</p>
          ) : (
            messages.map((m, idx) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <div>
                  <b>{m.role}：</b> {m.content}
                </div>

                {m.files && m.files.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 16, fontSize: 13, opacity: 0.85 }}>
                    <div><b>附件：</b></div>
                    <ul style={{ marginTop: 4 }}>
                      {m.files.map((f) => (
                        <li key={f.file_id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span>
                            {f.filename} <span style={{ opacity: 0.6 }}>(id: {f.file_id})</span>
                          </span>

                          <button
                            onClick={() => {
                              // 用 fetch 帶 Authorization 下載 blob，再用瀏覽器下載
                              downloadWithToken(f.file_id, f.filename);
                            }}
                          >
                            下載
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 輸入送出 */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1 }}
            placeholder="輸入訊息..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? sendMessage() : null)}
          />
          <button onClick={sendMessage} disabled={!activeConversationId}>
            送出
          </button>
        </div>
      </section>
    </main>
  );
}
