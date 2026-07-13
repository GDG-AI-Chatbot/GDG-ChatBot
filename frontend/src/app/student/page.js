"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllQuestions, submitAnswers } from "../../lib/conversationsApi";
import styles from "./page.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? window.location.protocol + "//" + window.location.hostname + ":8000"
    : "http://127.0.0.1:8000");

export default function StudentPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [token, setToken] = useState("");
  const [studentId, setStudentId] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storedToken = window.localStorage.getItem("token");
    const storedRole = window.localStorage.getItem("role");
    const storedUserId = window.localStorage.getItem("userId");

    if (!storedToken || storedRole !== "student" || !storedUserId) {
      router.push("/");
      return;
    }

    setToken(storedToken);
    setStudentId(Number(storedUserId));
    setAuthChecked(true);
    loadAllQuestions(storedToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadAllQuestions(tokenOverride) {
    try {
      const data = await getAllQuestions({ apiBaseUrl: API, token: tokenOverride ?? token });
      const questionsList = data.questions || [];
      setQuestions(questionsList);

      // 初始化答案對象
      const initialAnswers = {};
      questionsList.forEach(q => {
        initialAnswers[q.id] = {
          selectedOption: "",
          shortAnswer: "",
        };
      });
      setAnswers(initialAnswers);
    } catch (error) {
      console.error("Failed to load questions from API", error);
      setLoadError("載入題目失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  function updateAnswer(questionId, field, value) {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: value,
      },
    }));
  }

  function isAllQuestionsAnswered() {
    return questions.every(q => answers[q.id]?.selectedOption?.trim());
  }

  async function handleSubmit() {
    if (!isAllQuestionsAnswered()) {
      alert("請完成所有題目的作答再提交！");
      return;
    }

    if (!studentId) {
      alert("學生未登入，無法提交。");
      return;
    }

    setSubmitting(true);

    try {
      // 準備結果數據以發送到後端
      const resultsForBackend = questions.map(q => {
        const answer = answers[q.id];
        const isCorrect = answer.selectedOption === q.correct_option;

        return {
          question_id: q.id,
          selected_option: answer.selectedOption,
          short_answer: answer.shortAnswer,
          is_correct: isCorrect,
        };
      });

      // 發送到後端
      await submitAnswers({
        apiBaseUrl: API,
        token,
        studentId,
        answers: resultsForBackend,
      });

      // 準備結果數據以存儲到sessionStorage（供結果頁面顯示）
      const results = questions.map(q => {
        const answer = answers[q.id];
        const isCorrect = answer.selectedOption === q.correct_option;

        return {
          questionId: q.id,
          questionNumber: q.question_number,
          prompt: q.prompt,
          options: q.options,
          correctOption: q.correct_option,
          selectedOption: answer.selectedOption,
          shortAnswer: answer.shortAnswer,
          isCorrect,
        };
      });

      // 存儲到sessionStorage
      sessionStorage.setItem("student_answers", JSON.stringify(results));

      // 跳轉到結果頁面
      router.push("/student/results");
    } catch (error) {
      console.error("Failed to submit answers", error);
      alert("提交失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p>載入題目中...</p>
        </section>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.navRow}>
            <Link href="/" className={styles.link}>
              返回主頁 / 聊天室
            </Link>
          </div>
          <p className={styles.errorNotice} role="alert">
            {loadError}
          </p>
        </section>
      </main>
    );
  }

  if (questions.length === 0) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.navRow}>
            <Link href="/" className={styles.link}>
              返回主頁 / 聊天室
            </Link>
          </div>
          <h1 className={styles.title}>學生作答介面</h1>
          <p>目前沒有題目可作答。</p>
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

        <h1 className={styles.title}>學生作答介面</h1>
        <p className={styles.description}>
          請完成所有題目的作答，全部作答完畢後才能提交。
        </p>

        <div className={styles.progress}>
          <p className={styles.progressText}>
            進度：{Object.values(answers).filter(a => a.selectedOption?.trim()).length} / {questions.length} 題
          </p>
        </div>

        <div className={styles.questionsContainer}>
          {questions.map((question, index) => (
            <div key={question.id} className={styles.questionBlock}>
              <h2 className={styles.questionTitle}>
                題目 {question.question_number}：{question.prompt}
              </h2>

              <div className={styles.options}>
                {["A", "B", "C", "D"].map((choice) => {
                  const optionText = question.options?.[choice];
                  if (!optionText) return null;

                  return (
                    <label key={choice} className={styles.optionLabel}>
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={choice}
                        checked={answers[question.id]?.selectedOption === choice}
                        onChange={(e) => updateAnswer(question.id, "selectedOption", e.target.value)}
                      />
                      <span>{choice}. {optionText}</span>
                    </label>
                  );
                })}
              </div>

              <div className={styles.shortAnswerBlock}>
                <label className={styles.shortAnswerLabel} htmlFor={`short-answer-${question.id}`}>
                  簡答題（可選）：
                </label>
                <textarea
                  id={`short-answer-${question.id}`}
                  className={styles.shortAnswerTextarea}
                  placeholder="請輸入您的簡答..."
                  value={answers[question.id]?.shortAnswer || ""}
                  onChange={(e) => updateAnswer(question.id, "shortAnswer", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          ))}
        </div>

        <div className={styles.submitSection}>
          <button
            type="button"
            className={`${styles.submitButton} ${!isAllQuestionsAnswered() ? styles.submitButtonDisabled : ""}`}
            onClick={handleSubmit}
            disabled={!isAllQuestionsAnswered()}
          >
            提交所有答案
          </button>
          {!isAllQuestionsAnswered() && (
            <p className={styles.submitWarning}>
              請完成所有必答題目（單選題）再提交
            </p>
          )}
        </div>
      </section>
    </main>
  );
}