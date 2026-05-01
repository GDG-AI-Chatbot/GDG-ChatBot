"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

const STORAGE_KEY = "gdg_teacher_mock_questions_v1";

export default function StudentPage() {
  const [mockQuestion, setMockQuestion] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
      const normalizedOptions = ["A", "B", "C", "D"]
        .map((choice) => {
          const text = typeof parsed.options?.[choice] === "string" ? parsed.options[choice].trim() : "";
          if (!text) return null;
          return `${choice}. ${text}`;
        })
        .filter(Boolean);

      if (!prompt || normalizedOptions.length === 0) return;

      setMockQuestion({
        id: "teacher-mock-q1",
        title: `【Mock 單選題】${prompt}`,
        options: normalizedOptions,
        shortAnswerPrompt:
          "【Mock 簡答題】請用 1-3 句補充你的作答理由或解題步驟。",
      });
    } catch (error) {
      console.error("load teacher mock question failed", error);
      setLoadError("讀取老師端暫存題目失敗，請返回主頁後再試。");
    }
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!mockQuestion) return;
    setSubmitted(true);
  };

  const optionStatus = selectedOption ? `已作答：${selectedOption}` : "未作答";
  const shortAnswerStatus = shortAnswer.trim() ? shortAnswer.trim() : "（未填寫）";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.navRow}>
          <Link href="/" className={styles.link}>
            返回主頁 / 聊天室
          </Link>
          <Link href="/teacher" className={styles.link}>
            返回老師題目頁
          </Link>
        </div>
        <p className={styles.badge}>Prototype / Mock Only（非正式評分）</p>
        <h1 className={styles.title}>學生端作答頁面原型</h1>
        <p className={styles.description}>
          本頁僅示範前端互動流程，不會送出到後端評分系統。
        </p>
        {loadError ? (
          <p className={styles.errorNotice} role="alert">
            {loadError}
          </p>
        ) : null}

        {!mockQuestion ? (
          <section className={styles.emptyState} aria-live="polite">
            <h2 className={styles.emptyTitle}>目前沒有可作答的 mock 題目</h2>
            <p className={styles.emptyText}>
              請先到老師端建立並暫存題目，學生端才會顯示作答內容。
            </p>
            <div className={styles.links}>
              <Link href="/teacher">前往老師頁建立題目</Link>
              <Link href="/">返回主頁</Link>
            </div>
          </section>
        ) : (
          <>
            <form className={styles.form} onSubmit={handleSubmit}>
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>{mockQuestion.title}</legend>
                <div className={styles.options}>
                  {mockQuestion.options.map((option) => (
                    <label key={option} className={styles.optionLabel}>
                      <input
                        type="radio"
                        name={mockQuestion.id}
                        value={option}
                        checked={selectedOption === option}
                        onChange={(event) => setSelectedOption(event.target.value)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.block}>
                <label className={styles.blockTitle} htmlFor="short-answer">
                  {mockQuestion.shortAnswerPrompt}
                </label>
                <textarea
                  id="short-answer"
                  className={styles.textarea}
                  placeholder="請輸入你的簡答..."
                  value={shortAnswer}
                  onChange={(event) => setShortAnswer(event.target.value)}
                  rows={5}
                />
              </div>

              <button type="submit" className={styles.submitButton}>
                提交作答
              </button>
            </form>

            {submitted && (
              <section className={styles.summary} aria-live="polite">
                <h2 className={styles.summaryTitle}>本地提交摘要（Mock）</h2>
                <p className={styles.summaryLine}>單選題：{optionStatus}</p>
                <p className={styles.summaryLine}>簡答內容：{shortAnswerStatus}</p>
              </section>
            )}
          </>
        )}

        <div className={styles.links}>
          <Link href="/">返回主頁 / 聊天室入口</Link>
        </div>
      </section>
    </main>
  );
}
