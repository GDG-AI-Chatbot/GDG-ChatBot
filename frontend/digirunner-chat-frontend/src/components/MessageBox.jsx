export default function MessageBox({ messages }) {
  return (
    <div className="messages">
      {messages.map((m, i) => (
        <div key={i} className={m.role}>
          <strong>{m.role === "user" ? "你 You" : "AI"}：</strong>
          {m.content}
        </div>
      ))}
    </div>
  );
}
