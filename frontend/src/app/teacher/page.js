"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

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
  const [question, setQuestion] = useState(createDefaultQuestion);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      const safeQuestion = {
        prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
        options: {
          A: typeof parsed.options?.A === "string" ? parsed.options.A : "",
          B: typeof parsed.options?.B === "string" ? parsed.options.B : "",
          C: typeof parsed.options?.C === "string" ? parsed.options.C : "",
          D: typeof parsed.options?.D === "string" ? parsed.options.D : "",
        },
        correctOption:
          parsed.correctOption === "A" || parsed.correctOption === "B" || parsed.correctOption === "C" || parsed.correctOption === "D"
            ? parsed.correctOption
            : "A",
        shortAnswer: typeof parsed.shortAnswer === "string" ? parsed.shortAnswer : "",
      };

      setQuestion(safeQuestion);
    } catch (error) {
      console.error("load mock question failed", error);
      setNoticeType("error");
      setNotice("讀取本地暫存失敗，已使用空白表單。");
    }
  }, []);

  function updateOption(key, value) {
    setQuestion((prev) => ({
      ...prev,
      options: {
        ...prev.options,
        [key]: value,
      },
    }));
  }

  function handleSaveMock() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(question));
      setNoticeType("success");
      setNotice("暫存成功（mock）。目前尚未串接後端上傳 API。");
    } catch (error) {
      console.error("save mock question failed", error);
      setNoticeType("error");
      setNotice("暫存失敗，請稍後再試。");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.navRow}>
          <Link href="/" className={styles.link}>
            返回主頁 / 聊天室
          </Link>
          <Link href="/student" className={styles.link}>
            前往學生作答頁
          </Link>
        </div>
        <p className={styles.badge}>Prototype / Mock Only（尚未串後端）</p>
        <h1 className={styles.title}>老師端題目暫存原型</h1>
        <p className={styles.subtitle}>尚未串接後端：目前僅提供前端狀態與 localStorage 暫存示範。</p>

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

        <button type="button" className={styles.saveButton} onClick={handleSaveMock}>
          暫存題目（mock）
        </button>

        {notice ? (
          <p className={noticeType === "error" ? styles.errorNotice : styles.successNotice} role="status">
            {notice}
          </p>
        ) : null}

        <div className={styles.linkRow}>
          <Link href="/student" className={styles.link}>
            以學生身分檢視題目
          </Link>
        </div>
      </section>
    </main>
  );
}
