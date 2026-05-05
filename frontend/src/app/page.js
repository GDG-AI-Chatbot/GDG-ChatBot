"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createConversation as createConversationApi,
  deleteConversation as deleteConversationApi,
  getConversations,
  renameConversation as renameConversationApi,
} from "../lib/conversationsApi";
import styles from "./page.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? window.location.protocol + "//" + window.location.hostname + ":8000"
    : "http://127.0.0.1:8000");

export default function Page() {
  const ENABLE_FILE_UI = false;

  // Auth
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("Polly");
  const [password, setPassword] = useState("123");
  const [registerRole, setRegisterRole] = useState("");
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Conversations
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [renamingConversationId, setRenamingConversationId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [openActionMenuConversationId, setOpenActionMenuConversationId] = useState(null);
  const [contextMenuPosition, setContextMenuPosition] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const actionMenuRef = useRef(null);

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
    const list = await getConversations({ apiBaseUrl: API, token: t });
    setConversations(list);

    // 如果沒有聊天室，自動建立一個
    if (list.length === 0) {
      const created = await createConversationApi({ apiBaseUrl: API, token: t, title: "New Chat" });
      const newId = created.conversation_id;
      // 重新載入列表
      const list2 = await getConversations({ apiBaseUrl: API, token: t });
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
    const user = username.trim();
    const pw = password.trim();
    if (!user || !pw) {
      setAuthError("請輸入帳號與密碼");
      return;
    }
    if (!registerRole) {
      setAuthError("請選擇角色（學生或老師）");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      await apiJson("/auth/register", "POST", { username: user, password: pw, role: registerRole }, "");
      alert("註冊成功！請登入");
      setMode("login");
      setRegisterRole("");
    } catch (e) {
      setAuthError(`註冊失敗：${e.message}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function login() {
    const user = username.trim();
    const pw = password.trim();
    if (!user || !pw) {
      setAuthError("請輸入帳號與密碼");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await apiJson("/auth/login", "POST", { username: user, password: pw }, "");
      localStorage.setItem("token", data.access_token);
      setToken(data.access_token);

      // 登入後：載入聊天室列表/預設聊天室
      await ensureAtLeastOneConversation(data.access_token);
    } catch (e) {
      setAuthError(`登入失敗：${e.message}`);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleAuthSubmit(e) {
    e.preventDefault();
    if (authLoading) return;
    if (mode === "register") {
      register();
      return;
    }
    login();
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setMessage("");
    setUploadInfo("");
    setRenamingConversationId(null);
    setRenameDraft("");
    setRenameLoading(false);
    setRenameError("");
  }

  // ---------- conversations ----------
  async function createConversation() {
    try {
      const created = await createConversationApi({ apiBaseUrl: API, token, title: "New Chat" });
      const newId = created.conversation_id;

      const list2 = await getConversations({ apiBaseUrl: API, token });
      setConversations(list2);

      setActiveConversationId(newId);
      await loadMessages(newId);
    } catch (e) {
      alert(`建立聊天室失敗：${e.message}`);
    }
  }

  async function selectConversation(id) {
    if (renameLoading || deletingConversationId !== null) return;
    setActiveConversationId(id);
    setRenameError("");
    try {
      await loadMessages(id);
    } catch (e) {
      alert(`載入訊息失敗：${e.message}`);
    }
  }

  function closeActionMenu() {
    setOpenActionMenuConversationId(null);
    setContextMenuPosition(null);
  }

  function startRenameConversation(conversation) {
    if (renameLoading || deletingConversationId !== null) return;
    closeActionMenu();
    setRenamingConversationId(conversation.id);
    setRenameDraft(conversation.title || "");
    setRenameError("");
  }

  function cancelRenameConversation() {
    if (renameLoading || deletingConversationId !== null) return;
    setRenamingConversationId(null);
    setRenameDraft("");
    setRenameError("");
  }

  async function saveRenameConversation(conversationId) {
    const normalized = renameDraft.trim();
    if (!normalized) {
      setRenameError("名稱不可為空白");
      return;
    }
    if (normalized.length > 80) {
      setRenameError("名稱不可超過 80 字元");
      return;
    }

    setRenameLoading(true);
    setRenameError("");
    try {
      await renameConversationApi({
        apiBaseUrl: API,
        token,
        conversationId,
        title: normalized,
      });
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, title: normalized } : conversation
        )
      );
      setRenamingConversationId(null);
      setRenameDraft("");
    } catch (e) {
      if (e?.code === "NOT_IMPLEMENTED" || e?.status === 404 || e?.status === 501) {
        setRenameError("後端尚未開通改名功能。");
        return;
      }
      setRenameError(`改名失敗：${e.message}`);
    } finally {
      setRenameLoading(false);
    }
  }

  async function handleDeleteConversation(conversationId) {
    if (renameLoading || deletingConversationId !== null) return;

    const targetConversation = conversations.find((conversation) => conversation.id === conversationId);
    if (!targetConversation) return;

    const confirmed = window.confirm(`確定要刪除「${targetConversation.title}」嗎？此操作無法復原。`);
    if (!confirmed) return;

    closeActionMenu();
    setDeletingConversationId(conversationId);
    setRenameError("");

    try {
      await deleteConversationApi({ apiBaseUrl: API, token, conversationId });

      const currentList = await getConversations({ apiBaseUrl: API, token });
      setConversations(currentList);

      if (currentList.length === 0) {
        await ensureAtLeastOneConversation();
        return;
      }

      const activeStillExists = currentList.some((conversation) => conversation.id === activeConversationId);
      if (activeStillExists) return;

      const deletedIndex = conversations.findIndex((conversation) => conversation.id === conversationId);
      const fallbackConversation = currentList[Math.min(deletedIndex, currentList.length - 1)] || currentList[0];
      setActiveConversationId(fallbackConversation.id);
      await loadMessages(fallbackConversation.id);
    } catch (e) {
      if (e?.code === "NOT_IMPLEMENTED" || e?.status === 404 || e?.status === 501) {
        setRenameError("後端尚未開通刪除聊天室功能。");
        return;
      }
      setRenameError(`刪除聊天室失敗：${e.message}`);
    } finally {
      setDeletingConversationId(null);
    }
  }

  function toggleActionMenu(conversationId) {
    if (renameLoading || deletingConversationId !== null) return;
    if (openActionMenuConversationId === conversationId) {
      closeActionMenu();
      return;
    }
    setOpenActionMenuConversationId(conversationId);
    setContextMenuPosition(null);
  }

  function openActionMenuByContextMenu(event, conversationId) {
    if (renameLoading || deletingConversationId !== null) return;
    event.preventDefault();
    setOpenActionMenuConversationId(conversationId);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  }

  useEffect(() => {
    if (openActionMenuConversationId === null) return undefined;

    function handleOutsideClick(event) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        closeActionMenu();
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        closeActionMenu();
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionMenuConversationId]);

  useEffect(() => {
    if (renamingConversationId !== null) {
      closeActionMenu();
    }
  }, [renamingConversationId]);

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
        file_ids: ENABLE_FILE_UI ? selectedFileIds : [],
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

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // ---------- UI ----------
  if (!token) {
    return (
      <main className={styles.authPage}>
        <div className={styles.authBackdrop} />
        <section className={styles.authShell}>
          <aside className={styles.brandPanel}>
            <p className={styles.brandKicker}>GDG Campus NTPU presents</p>
            <h1 className={styles.brandTitle}>GDG ChatBot</h1>
            <p className={styles.brandDescription}>
              A premium campus AI workspace for focused conversations, fast collaboration,
              and thoughtful learning.
            </p>
          </aside>

          <section className={styles.formPanel}>
            <div className={styles.modeSwitch}>
              <button
                type="button"
                className={`${styles.modeButton} ${mode === "login" ? styles.modeButtonActive : ""}`}
                onClick={() => {
                  setMode("login");
                  setAuthError("");
                  setRegisterRole("");
                }}
              >
                登入
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${mode === "register" ? styles.modeButtonActive : ""}`}
                onClick={() => {
                  setMode("register");
                  setAuthError("");
                }}
              >
                註冊
              </button>
            </div>

            <h2 className={styles.formTitle}>
              {mode === "register" ? "建立你的帳號" : "歡迎回來"}
            </h2>
            <p className={styles.formDescription}>
              {mode === "register"
                ? "完成註冊後即可開始建立聊天室與管理附件。"
                : "登入後可直接進入聊天室列表與對話介面。"}
            </p>

            <form className={styles.formGrid} onSubmit={handleAuthSubmit}>
              <label className={styles.inputLabel}>
                Username
                <input
                  className={styles.inputField}
                  placeholder="輸入帳號"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>

              <label className={styles.inputLabel}>
                Password
                <input
                  className={styles.inputField}
                  placeholder="輸入密碼"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {mode === "register" && (
                <label className={styles.inputLabel}>
                  角色
                  <select
                    className={`${styles.inputField} ${styles.selectField}`}
                    value={registerRole}
                    onChange={(e) => setRegisterRole(e.target.value)}
                  >
                    <option value="">請選擇角色</option>
                    <option value="student">學生</option>
                    <option value="teacher">老師</option>
                  </select>
                </label>
              )}

              {authError && (
                <p className={styles.authError} role="alert" aria-live="polite">
                  {authError}
                </p>
              )}

              {mode === "register" ? (
                <button className={styles.submitButton} type="submit" disabled={authLoading}>
                  {authLoading ? "建立中..." : "建立帳號"}
                </button>
              ) : (
                <button className={styles.submitButton} type="submit" disabled={authLoading}>
                  {authLoading ? "登入中..." : "進入 GDG ChatBot"}
                </button>
              )}
            </form>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.chatPage}>
      <div className={styles.authBackdrop} />
      <section className={`${styles.chatShell} ${isSidebarCollapsed ? styles.chatShellCollapsed : ""}`}>
        <aside className={`${styles.chatSidebar} ${isSidebarCollapsed ? styles.chatSidebarCollapsed : ""}`}>
          <div className={`${styles.sidebarHeader} ${isSidebarCollapsed ? styles.sidebarHeaderCollapsed : ""}`}>
            {!isSidebarCollapsed && (
              <div>
                <p className={styles.sidebarKicker}>GDG Campus NTPU</p>
                <h2 className={styles.sidebarTitle}>Chat Lounge</h2>
              </div>
            )}
            <div className={styles.sidebarActions}>
              <button
                type="button"
                className={styles.sidebarGhostButton}
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                aria-label={isSidebarCollapsed ? "展開側欄" : "收合側欄"}
                title={isSidebarCollapsed ? "展開側欄" : "收合側欄"}
              >
                {isSidebarCollapsed ? "»" : "«"}
              </button>
              <button
                type="button"
                className={styles.sidebarGhostButton}
                onClick={logout}
                aria-label="登出"
                title="登出"
              >
                ⎋
              </button>
            </div>
          </div>

          {!isSidebarCollapsed && (
            <button type="button" className={styles.newChatButton} onClick={createConversation}>
              + 新增聊天室
            </button>
          )}

          {!isSidebarCollapsed && (
            <>
              <div className={styles.conversationList}>
                {conversations.length === 0 ? (
                  <p className={styles.sidebarEmpty}>目前沒有聊天室，先建立一個吧。</p>
                ) : (
                  conversations.map((c) => {
                    const active = c.id === activeConversationId;
                    const isRenaming = c.id === renamingConversationId;
                    return (
                      <article
                        key={c.id}
                        className={`${styles.conversationCard} ${active ? styles.conversationCardActive : ""}`}
                        title={c.created_at}
                        onContextMenu={(event) => openActionMenuByContextMenu(event, c.id)}
                      >
                        {isRenaming ? (
                          <div className={styles.renameEditor}>
                            <input
                              className={styles.renameInput}
                              value={renameDraft}
                              maxLength={80}
                              onChange={(e) => {
                                setRenameDraft(e.target.value);
                                if (renameError) setRenameError("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveRenameConversation(c.id);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelRenameConversation();
                                }
                              }}
                              autoFocus
                              aria-label="聊天室新名稱"
                            />
                            <div className={styles.renameActions}>
                              <button
                                type="button"
                                className={styles.renameSaveButton}
                                onClick={() => saveRenameConversation(c.id)}
                                disabled={renameLoading}
                              >
                                {renameLoading ? "儲存中..." : "儲存"}
                              </button>
                              <button
                                type="button"
                                className={styles.renameCancelButton}
                                onClick={cancelRenameConversation}
                                disabled={renameLoading}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.conversationBody}>
                            <button
                              type="button"
                              className={styles.conversationSelectButton}
                              onClick={() => selectConversation(c.id)}
                            >
                              <span className={styles.conversationTitle}>{c.title}</span>
                              <span className={styles.conversationMeta}>Conversation #{c.id}</span>
                            </button>
                            <div className={styles.conversationMenuWrap}>
                              <button
                                type="button"
                                className={styles.menuTriggerButton}
                                onClick={() => toggleActionMenu(c.id)}
                                disabled={renameLoading || deletingConversationId !== null}
                                aria-label="聊天室操作選單"
                                aria-haspopup="menu"
                                aria-expanded={openActionMenuConversationId === c.id}
                              >
                                ⋮
                              </button>
                              {openActionMenuConversationId === c.id && (
                                <div
                                  ref={actionMenuRef}
                                  className={`${styles.conversationActionMenu} ${
                                    contextMenuPosition ? styles.conversationActionMenuContext : ""
                                  }`}
                                  style={
                                    contextMenuPosition
                                      ? {
                                          left: contextMenuPosition.x,
                                          top: contextMenuPosition.y,
                                          position: "fixed",
                                        }
                                      : undefined
                                  }
                                  role="menu"
                                  aria-label="聊天室操作"
                                >
                                  <button
                                    type="button"
                                    className={styles.actionMenuItem}
                                    onClick={() => startRenameConversation(c)}
                                    role="menuitem"
                                  >
                                    改名
                                  </button>
                                  <button
                                    type="button"
                                    className={`${styles.actionMenuItem} ${styles.actionMenuItemDanger}`}
                                    onClick={() => handleDeleteConversation(c.id)}
                                    role="menuitem"
                                  >
                                    {deletingConversationId === c.id ? "刪除中..." : "刪除"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
              {renameError && (
                <p className={styles.renameError} role="alert" aria-live="polite">
                  {renameError}
                </p>
              )}
            </>
          )}
        </aside>

        <section className={`${styles.chatMain} ${!ENABLE_FILE_UI ? styles.chatMainCompact : ""}`}>
          <header className={styles.chatTopBar}>
            <div className={styles.chatTopMain}>
              <div>
                <p className={styles.chatTopKicker}>GDG Chat Workspace</p>
                <h3 className={styles.chatTopTitle}>
                  {activeConversation ? activeConversation.title : "請先選擇聊天室"}
                </h3>
              </div>
              <div className={styles.entryActions}>
                <Link href="/teacher" className={styles.entryActionButton}>
                  老師：上傳題目與解答
                </Link>
                <Link href="/student" className={styles.entryActionButton}>
                  學生：開始作答
                </Link>
              </div>
            </div>
            <p className={styles.prototypeHint}>
              Prototype 導覽：老師/學生頁為前端示範流程，尚未串接正式後端評分與上傳 API。
            </p>
            <span className={styles.chatTopMeta}>
              {activeConversation
                ? `Conversation #${activeConversation.id}`
                : "No active conversation"}
            </span>
          </header>

          {ENABLE_FILE_UI && (
            <div className={styles.utilityGrid}>
              <section className={styles.utilityCard}>
                <div className={styles.utilityHeader}>
                  <h4>檔案上傳</h4>
                  <p>上傳後可加入下一則訊息附件。</p>
                </div>
                <div className={styles.fileUploadRow}>
                  <input
                    className={styles.fileInput}
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <button type="button" className={styles.ghostActionButton} onClick={uploadFile}>
                    上傳
                  </button>
                </div>
                {uploadInfo && <p className={styles.uploadInfo}>{uploadInfo}</p>}
              </section>

              <section className={styles.utilityCard}>
                <div className={styles.utilityHeader}>
                  <h4>訊息附件</h4>
                  <p>勾選後會附加到下一則送出的訊息。</p>
                </div>

                {myFiles.length === 0 ? (
                  <p className={styles.utilityEmpty}>目前沒有已上傳檔案</p>
                ) : (
                  <div className={styles.fileList}>
                    {myFiles.map((f) => (
                      <label key={f.file_id} className={styles.fileOption}>
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
                        <span className={styles.fileOptionText}>
                          {f.filename} <span>(id: {f.file_id})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {selectedFileIds.length > 0 && (
                  <p className={styles.selectionHint}>已選擇：{selectedFileIds.join(", ")}</p>
                )}

                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => setSelectedFileIds([])}
                  disabled={selectedFileIds.length === 0}
                >
                  清空選取
                </button>
              </section>
            </div>
          )}

          <section className={styles.messagePanel}>
            {!activeConversationId ? (
              <p className={styles.messageEmpty}>請先選擇或建立一個聊天室。</p>
            ) : messages.length === 0 ? (
              <p className={styles.messageEmpty}>這個聊天室目前沒有訊息，來傳第一句吧。</p>
            ) : (
              <div className={styles.messageStack}>
                {messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <article
                      key={m.id || `${m.role}-${idx}`}
                      className={`${styles.messageBubble} ${
                        isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant
                      }`}
                    >
                      <p className={styles.messageRole}>{isUser ? "You" : "Assistant"}</p>
                      <p className={styles.messageText}>{m.content}</p>

                      {m.files && m.files.length > 0 && (
                        <div className={styles.messageFiles}>
                          {m.files.map((f) => (
                            <div key={f.file_id} className={styles.fileChip}>
                              <span>{f.filename}</span>
                              <button
                                type="button"
                                className={styles.fileChipButton}
                                onClick={() => downloadWithToken(f.file_id, f.filename)}
                              >
                                下載
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <footer className={styles.composer}>
            <input
              className={styles.composerInput}
              placeholder="輸入訊息..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? sendMessage() : null)}
            />
            <button
              type="button"
              className={styles.composerButton}
              onClick={sendMessage}
              disabled={!activeConversationId}
            >
              送出
            </button>
          </footer>
        </section>
      </section>
    </main>
  );
}
