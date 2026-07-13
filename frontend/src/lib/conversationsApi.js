const DEFAULT_TIMEOUT_MS = 10000;

function buildError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function mapConversationApiError(status, detail) {
  if (status === 404 || status === 405 || status === 501) {
    return buildError(detail || "Conversation API is not implemented on backend", status, "NOT_IMPLEMENTED");
  }
  return buildError(detail || `HTTP ${status}`, status);
}

async function requestJson({ apiBaseUrl, path, method, token, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw mapConversationApiError(res.status, data.detail);
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw buildError("Conversation API request timed out", 408, "TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getConversations({ apiBaseUrl, token }) {
  const data = await requestJson({
    apiBaseUrl,
    path: "/conversations",
    method: "GET",
    token,
  });
  return data.conversations || [];
}

export async function createConversation({ apiBaseUrl, token, title = "New Chat" }) {
  return requestJson({
    apiBaseUrl,
    path: "/conversations",
    method: "POST",
    token,
    body: { title },
  });
}

export async function renameConversation({ apiBaseUrl, token, conversationId, title }) {
  return requestJson({
    apiBaseUrl,
    path: `/conversations/${conversationId}`,
    method: "PATCH",
    token,
    body: { title },
  });
}

export async function deleteConversation({ apiBaseUrl, token, conversationId }) {
  return requestJson({
    apiBaseUrl,
    path: `/conversations/${conversationId}`,
    method: "DELETE",
    token,
  });
}

export async function uploadQuestion({ apiBaseUrl, token, question }) {
  return requestJson({
    apiBaseUrl,
    path: "/questions/upload",
    method: "POST",
    token,
    body: question,
  });
}

export async function getLatestQuestion({ apiBaseUrl }) {
  return requestJson({
    apiBaseUrl,
    path: "/questions/latest",
    method: "GET",
  });
}

export async function getAllQuestions({ apiBaseUrl, token }) {
  return requestJson({
    apiBaseUrl,
    path: "/questions",
    method: "GET",
    token,
  });
}

export async function getQuestion({ apiBaseUrl, questionId }) {
  return requestJson({
    apiBaseUrl,
    path: `/questions/${questionId}`,
    method: "GET",
  });
}

export async function updateQuestion({ apiBaseUrl, token, questionId, question }) {
  return requestJson({
    apiBaseUrl,
    path: `/questions/${questionId}`,
    method: "PUT",
    token,
    body: question,
  });
}

export async function deleteQuestion({ apiBaseUrl, token, questionId }) {
  return requestJson({
    apiBaseUrl,
    path: `/questions/${questionId}`,
    method: "DELETE",
    token,
  });
}

export async function submitAnswers({ apiBaseUrl, studentId, answers, token }) {
  return requestJson({
    apiBaseUrl,
    path: "/student/answers",
    method: "POST",
    token,
    body: {
      student_id: studentId,
      answers: answers,
    },
  });
}

export async function getStudentAnswers({ apiBaseUrl, studentId }) {
  return requestJson({
    apiBaseUrl,
    path: `/student/answers/${studentId}`,
    method: "GET",
  });
}

export async function getStudentAnalysis({ apiBaseUrl, studentId, token }) {
  return requestJson({
    apiBaseUrl,
    path: `/student/analysis/${studentId}`,
    method: "GET",
    token,
    timeoutMs: 60000, // 分析可能較慢，延長超時到 60 秒
  });
}
