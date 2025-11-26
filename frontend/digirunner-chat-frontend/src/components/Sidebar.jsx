export default function Sidebar() {
  const user = localStorage.getItem("user");

  return (
    <div className="sidebar">
      <h3>使用者 User</h3>
      <p>{user}</p>
      <hr />
      <p>歷史紀錄 History（Demo）</p>
    </div>
  );
}
