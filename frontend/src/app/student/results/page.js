"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStudentAnalysis } from "../../../lib/conversationsApi";
import styles from "./page.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? window.location.protocol + "//" + window.location.hostname + ":8000"
    : "http://127.0.0.1:8000");

export default function ResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [studentId, setStudentId] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

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

    // 從sessionStorage獲取作答結果
    const storedResults = sessionStorage.getItem("student_answers");
    if (storedResults) {
      setResults(JSON.parse(storedResults));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!results || results.length === 0) {
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError("");

    if (!studentId) {
      setAnalysisError("學生未登入，無法取得分析結果。切換至主頁重新登入。");
      setAnalysisLoading(false);
      return;
    }

    getStudentAnalysis({ apiBaseUrl: API, studentId, token })
      .then((data) => {
        setAnalysis(data.analysis || "");
      })
      .catch((error) => {
        console.error("Failed to load student analysis", error);
        // 顯示詳細錯誤訊息以便除錯（前端呈現給使用者時仍保持友善）
        setAnalysisError(error?.message ? `分析失敗：${error.message}` : "分析失敗，請稍後再試。");
      })
      .finally(() => {
        setAnalysisLoading(false);
      });
  }, [results]);

  if (!authChecked) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p>驗證中，請稍候...</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p>載入中...</p>
        </section>
      </main>
    );
  }

  if (results.length === 0) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>作答結果</h1>
          <p>沒有找到作答記錄。</p>
          <Link href="/student" className={styles.link}>
            返回作答頁面
          </Link>
        </section>
      </main>
    );
  }

  const totalQuestions = results.length;
  const correctAnswers = results.filter(r => r.isCorrect).length;
  const score = Math.round((correctAnswers / totalQuestions) * 100);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.navRow}>
          <Link href="/" className={styles.link}>
            返回主頁 / 聊天室
          </Link>
          <Link href="/student" className={styles.link}>
            重新作答
          </Link>
        </div>

        <h1 className={styles.title}>作答結果</h1>

        <div className={styles.scoreCard}>
          <h2 className={styles.scoreTitle}>總成績</h2>
          <div className={styles.scoreDisplay}>
            <div className={styles.scoreNumber}>{score}</div>
            <div className={styles.scoreUnit}>分</div>
          </div>
          <p className={styles.scoreDetail}>
            正確題數：{correctAnswers} / {totalQuestions}
          </p>
        </div>

        <div className={styles.resultsList}>
          {results.map((result, index) => (
            <div key={result.questionId} className={styles.resultItem}>
              <h3 className={styles.questionTitle}>
                題目 {result.questionNumber}：{result.prompt}
              </h3>

              <div className={styles.options}>
                {Object.entries(result.options).map(([key, value]) => (
                  <div
                    key={key}
                    className={`${styles.option} ${
                      result.correctOption === key ? styles.correctOption : ""
                    } ${
                      result.selectedOption === key && result.correctOption !== key ? styles.wrongOption : ""
                    }`}
                  >
                    {key}. {value}
                    {result.correctOption === key && <span className={styles.correctMark}> ✓</span>}
                    {result.selectedOption === key && result.correctOption !== key && <span className={styles.wrongMark}> ✗</span>}
                  </div>
                ))}
              </div>

              <div className={styles.answerStatus}>
                <p className={result.isCorrect ? styles.correctText : styles.wrongText}>
                  {result.isCorrect ? "✓ 正確" : "✗ 錯誤"}
                </p>
                <p className={styles.selectedAnswer}>
                  您的答案：{result.selectedOption || "未作答"}
                </p>
                {!result.isCorrect && (
                  <p className={styles.correctAnswer}>
                    正確答案：{result.correctOption}
                  </p>
                )}
              </div>

              {result.shortAnswer && (
                <div className={styles.shortAnswer}>
                  <h4>您的簡答：</h4>
                  <p>{result.shortAnswer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <section className={styles.analysisCard}>
          <h2 className={styles.analysisTitle}>AI 知識盲區分析</h2>
          {analysisLoading ? (
            <p className={styles.analysisLoading}>正在分析學生作答，請稍候...</p>
          ) : analysisError ? (
            <p className={styles.analysisError}>{analysisError}</p>
          ) : (
            <p className={styles.analysisText}>{analysis || "暫無分析結果。"}</p>
          )}
        </section>

        <div className={styles.actions}>
          <Link href="/student" className={styles.primaryButton}>
            重新作答
          </Link>
          <Link href="/" className={styles.secondaryButton}>
            返回主頁
          </Link>
        </div>
      </section>
    </main>
  );
}