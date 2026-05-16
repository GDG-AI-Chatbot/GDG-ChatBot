"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { uploadQuestion, getAllQuestions, deleteQuestion, updateQuestion } from "../../lib/conversationsApi";
import styles from "./page.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? window.location.protocol + "//" + window.location.hostname + ":8000"
    : "http://127.0.0.1:8000");

const STORAGE_KEY = "gdg_teacher_mock_questions_v1";

function createDefaultQuestion() {
  return {
    prompt: "",
    options: {
      A: "",
      B: "",
      C: "",
      D: "",
    },
    correctOption: "A",
    shortAnswer: "",
  };
}

export default function TeacherPage() {
  const router = useRouter();
  const [question, setQuestion] = useState(createDefaultQuestion);
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("token");
    const storedRole = window.localStorage.getItem("role");

    if (!storedToken || storedRole !== "teacher") {
      router.push("/");
      return;
    }

    setToken(storedToken);
    setIsAuthorized(true);
    loadQuestions(storedToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadQuestions(tokenOverride) {
    try {
      const data = await getAllQuestions({ apiBaseUrl: API, token: tokenOverride ?? token });
      setQuestions(data.questions || []);
    } catch (error) {
      console.error("Failed to load questions", error);
      // Fallback to localStorage
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setQuestions([parsed]);
        }
      } catch (fallbackError) {
        console.error("Fallback load failed", fallbackError);
      }
    }
  }

  function updateOption(key, value) {
    setQuestion((prev) => ({
      ...prev,
      options: {
        ...prev.options,
        [key]: value,
      },
    }));
  }

  function startEditing(questionData) {
    setQuestion({
      prompt: questionData.prompt || "",
      options: questionData.options || { A: "", B: "", C: "", D: "" },
      correctOption: questionData.correct_option || "A",
      shortAnswer: questionData.short_answer || "",
    });
    setEditingId(questionData.id);
  }

  function cancelEditing() {
    setQuestion(createDefaultQuestion());
    setEditingId(null);
  }

  async function handleSave() {
    setLoading(true);
    try {
      const questionData = {
        prompt: question.prompt,
        options: question.options,
        correct_option: question.correctOption,
        short_answer: question.shortAnswer || null,
      };

      if (editingId) {
        // 更新現有題目
        await updateQuestion({
          apiBaseUrl: API,
          token,
          questionId: editingId,
          question: questionData,
        });
        setNotice("題目已更新");
      } else {
        // 新增題目
        await uploadQuestion({
          apiBaseUrl: API,
          token,
          question: questionData,
        });
        setNotice("題目上傳成功！");
      }

      setNoticeType("success");
      setQuestion(createDefaultQuestion());
      setEditingId(null);
      await loadQuestions(); // 重新加載題目列表
    } catch (error) {
      console.error("Save question failed", error);
      setNoticeType("error");
      setNotice("保存失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(questionId) {
    if (!confirm("確定要刪除這個題目嗎？")) return;

    try {
      await deleteQuestion({
        apiBaseUrl: API,
        token,
        questionId,
      });
      setNotice("題目已刪除，並重新排序題號");
      setNoticeType("success");
      await loadQuestions();
    } catch (error) {
      console.error("Delete question failed", error);
      setNoticeType("error");
      setNotice("刪除失敗，請稍後再試。");
    }
  }

  if (!isAuthorized) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p>驗證中，請稍候...</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.navRow}>
          <Link href="/" className={styles.link}>
            返回主頁 / 聊天室
          </Link>
        </div>
        <p className={styles.badge}>老師端題目上傳</p>
        <h1 className={styles.title}>老師端題目上傳</h1>
        <p className={styles.subtitle}>上傳題目到後端資料庫，並同步暫存到本地。</p>

        <label className={styles.label} htmlFor="prompt">
          題目內容
        </label>
        <textarea
          id="prompt"
          className={styles.textarea}
          placeholder="請輸入題目"
          value={question.prompt}
          onChange={(event) => setQuestion((prev) => ({ ...prev, prompt: event.target.value }))}
        />

        <div className={styles.optionsGrid}>
          {(["A", "B", "C", "D"]).map((choice) => (
            <div key={choice} className={styles.optionItem}>
              <label className={styles.label} htmlFor={`option-${choice}`}>
                選項 {choice}
              </label>
              <input
                id={`option-${choice}`}
                className={styles.input}
                type="text"
                placeholder={`請輸入選項 ${choice}`}
                value={question.options[choice]}
                onChange={(event) => updateOption(choice, event.target.value)}
              />
            </div>
          ))}
        </div>

        <label className={styles.label} htmlFor="correct-option">
          正確選項
        </label>
        <select
          id="correct-option"
          className={styles.select}
          value={question.correctOption}
          onChange={(event) => setQuestion((prev) => ({ ...prev, correctOption: event.target.value }))}
        >
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>

        <label className={styles.label} htmlFor="short-answer">
          簡答參考答案（可空）
        </label>
        <textarea
          id="short-answer"
          className={styles.textarea}
          placeholder="可輸入簡答參考答案"
          value={question.shortAnswer}
          onChange={(event) => setQuestion((prev) => ({ ...prev, shortAnswer: event.target.value }))}
        />

        <div className={styles.buttonRow}>
          <button type="button" className={styles.saveButton} onClick={handleSave} disabled={loading}>
            {editingId ? "更新題目" : "上傳題目"}
          </button>
          {editingId && (
            <button type="button" className={styles.cancelButton} onClick={cancelEditing}>
              取消編輯
            </button>
          )}
        </div>

        {notice ? (
          <p className={noticeType === "error" ? styles.errorNotice : styles.successNotice} role="status">
            {notice}
          </p>
        ) : null}

        {/* 題目列表 */}
        <section className={styles.questionsSection}>
          <h2 className={styles.sectionTitle}>已上傳的題目</h2>
          {questions.length === 0 ? (
            <p className={styles.emptyMessage}>尚未上傳任何題目</p>
          ) : (
            <div className={styles.questionsList}>
              {questions.map((q) => (
                <div key={q.id} className={styles.questionItem}>
                  <div className={styles.questionContent}>
                    <h3 className={styles.questionTitle}>
                      題目 {q.question_number}：{q.prompt}
                    </h3>
                    <div className={styles.options}>
                      {Object.entries(q.options).map(([key, value]) => (
                        <div key={key} className={`${styles.option} ${q.correct_option === key ? styles.correctOption : ""}`}>
                          {key}. {value}
                        </div>
                      ))}
                    </div>
                    {q.short_answer && (
                      <p className={styles.shortAnswer}>參考答案：{q.short_answer}</p>
                    )}
                    <p className={styles.createdAt}>建立時間：{new Date(q.created_at).toLocaleString()}</p>
                  </div>
                  <div className={styles.questionActions}>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => startEditing(q)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDelete(q.id)}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
