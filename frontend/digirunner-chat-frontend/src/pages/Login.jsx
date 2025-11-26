import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    console.log("Login clicked:", email); // 👈 Debug 用
    if (!email) {
      alert("請輸入 Email / Please enter email");
      return;
    }

    localStorage.setItem("user", email);
    navigate("/");   // 👈 強制導向首頁
  };

  return (
    <div className="login-container">
      <h2>登入 Login</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="密碼 Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {/* 一定要加 type="button" */}
      <button type="button" onClick={handleLogin}>
        登入 / Login
      </button>
    </div>
  );
}
