from typing import List, Optional
import hashlib
import secrets
import jwt
import sqlite3
import os
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from providers.mock import MockProvider
from providers.digirunner import DigiRunnerProvider
from dotenv import load_dotenv
load_dotenv()

def get_provider():
    name = os.getenv("PROVIDER", "mock").lower()

    if name == "mock":
        return MockProvider()

    if name == "digirunner":
        return DigiRunnerProvider()

    raise RuntimeError(f"Unknown PROVIDER: {name}")

provider = get_provider()

# ====== 基本設定 ======
SECRET_KEY = "dev-secret-change-me"  # 之後要改成環境變數
ALGO = "HS256"
DB_PATH = "app.db"
UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

# 讓前端能呼叫後端（開發階段先全部允許）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== DB 初始化 ======
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=30000;")

    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS conversations(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,          -- 'user' 或 'assistant'
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS files(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS message_files(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        file_id INTEGER NOT NULL
    )
    """)

    conn.commit()
    conn.close()

init_db()

def db():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,                 # 等待鎖最多 30 秒
        check_same_thread=False     # 允許不同 thread 使用（FastAPI 常需要）
    )
    conn.row_factory = sqlite3.Row

    # WAL：降低寫入互卡機率（Windows/SQLite 很有用）
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=30000;")  # 30 秒
    return conn

def hash_password(password: str) -> str:
    """
    PBKDF2-SHA256
    回傳格式：pbkdf2$<iterations>$<salt_hex>$<hash_hex>
    """
    iterations = 200_000
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2${iterations}${salt.hex()}${dk.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iters, salt_hex, hash_hex = stored.split("$", 3)
        if scheme != "pbkdf2":
            return False
        iterations = int(iters)
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return secrets.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ====== JWT / Auth ======
def create_token(user_id: int):
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGO)

def require_user_id(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        return int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ====== Request Models ======
class RegisterIn(BaseModel):
    username: str
    password: str

class LoginIn(BaseModel):
    username: str
    password: str

class CreateConversationIn(BaseModel):
    title: str = "New Chat"

class ChatIn(BaseModel):
    conversation_id: int
    message: str
    file_ids: Optional[List[int]] = []

# ====== Routes ======
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/auth/register")
def register(data: RegisterIn):
    pw = data.password

    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users(username, password_hash) VALUES(?, ?)",
            (data.username, hash_password(pw))
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    finally:
        conn.close()
    return {"ok": True}

@app.post("/auth/login")
def login(data: LoginIn):
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM users WHERE username=?", (data.username,))
    row = cur.fetchone()
    conn.close()

    if not row or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(row["id"])
    return {"access_token": token}

@app.post("/auth/token")
def token(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    給 Swagger /docs 的 Authorize 用（OAuth2 password flow 會送 form-data）
    form_data.username / form_data.password
    """
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM users WHERE username=?", (form_data.username,))
    row = cur.fetchone()
    conn.close()

    # 你目前的密碼驗證函式：
    # - 如果你用 PBKDF2：verify_password(...)
    # - 如果你用 bcrypt：bcrypt.verify(...)
    if not row or not verify_password(form_data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    access_token = create_token(row["id"])
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/files/upload")
def upload_file(file: UploadFile = File(...), user_id: int = Depends(require_user_id)):
    # 存檔到 uploads/
    safe_name = file.filename.replace("/", "_").replace("\\", "_")
    save_path = os.path.join(UPLOAD_DIR, f"{int(datetime.utcnow().timestamp())}_{safe_name}")

    with open(save_path, "wb") as f:
        f.write(file.file.read())

    conn = db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO files(user_id, filename, path, created_at) VALUES(?, ?, ?, ?)",
        (user_id, safe_name, save_path, datetime.utcnow().isoformat())
    )
    conn.commit()
    file_id = cur.lastrowid
    conn.close()

    return {"file_id": file_id, "filename": safe_name}

@app.get("/files/{file_id}/download")
def download_file(file_id: int, user_id: int = Depends(require_user_id)):
    conn = db()
    cur = conn.cursor()

    # 只允許下載自己的檔案
    cur.execute(
        "SELECT id, filename, path FROM files WHERE id=? AND user_id=?",
        (file_id, user_id)
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = row["path"]
    filename = row["filename"]

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on server")

    # 下載回應
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

@app.get("/messages")
def list_messages(user_id: int = Depends(require_user_id)):
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT role, content, created_at FROM messages WHERE user_id=? ORDER BY id ASC",
        (user_id,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"messages": rows}

@app.post("/conversations")
def create_conversation(data: CreateConversationIn, user_id: int = Depends(require_user_id)):
    title = (data.title or "New Chat").strip()

    conn = db()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO conversations(user_id, title, created_at) VALUES(?, ?, ?)",
        (user_id, title, now)
    )
    conn.commit()
    convo_id = cur.lastrowid
    conn.close()

    return {"conversation_id": convo_id, "title": title, "created_at": now}


@app.get("/conversations")
def list_conversations(user_id: int = Depends(require_user_id)):
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, title, created_at FROM conversations WHERE user_id=? ORDER BY id DESC",
        (user_id,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"conversations": rows}


@app.get("/conversations/{conversation_id}/messages")
def list_conversation_messages(conversation_id: int, user_id: int = Depends(require_user_id)):
    conn = db()
    cur = conn.cursor()

    # 確認聊天室是這個使用者的
    cur.execute(
        "SELECT id FROM conversations WHERE id=? AND user_id=?",
        (conversation_id, user_id)
    )
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 先撈出這個聊天室的所有訊息
    cur.execute(
        """
        SELECT id, role, content, created_at
        FROM messages
        WHERE user_id=? AND conversation_id=?
        ORDER BY id ASC
        """,
        (user_id, conversation_id)
    )

    messages = []
    message_rows = cur.fetchall()

    # 對每一則訊息，查它有沒有附加檔案
    for row in message_rows:
        msg = dict(row)

        cur.execute(
            """
            SELECT f.id AS file_id, f.filename AS filename
            FROM message_files mf
            JOIN files f ON f.id = mf.file_id
            WHERE mf.message_id = ?
            ORDER BY mf.id ASC
            """,
            (row["id"],)
        )

        msg["files"] = [dict(r) for r in cur.fetchall()]
        messages.append(msg)

    conn.close()
    return {"messages": messages}

@app.post("/chat")
def chat(data: ChatIn, user_id: int = Depends(require_user_id)):
    conversation_id = data.conversation_id
    user_text = data.message.strip()
    file_ids = data.file_ids or []

    if not user_text:
        raise HTTPException(status_code=400, detail="Empty message")

    # ===== 第一段：只做 DB 寫入（快速完成後關掉連線）=====
    conn = db()
    cur = conn.cursor()

    cur.execute(
        "SELECT id FROM conversations WHERE id=? AND user_id=?",
        (conversation_id, user_id)
    )
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Conversation not found")

    now = datetime.utcnow().isoformat()

    cur.execute(
        """
        INSERT INTO messages(conversation_id, user_id, role, content, created_at)
        VALUES(?, ?, ?, ?, ?)
        """,
        (conversation_id, user_id, "user", user_text, now)
    )
    user_message_id = cur.lastrowid

    files_for_provider = []
    if file_ids:
        placeholders = ",".join(["?"] * len(file_ids))
        cur.execute(
            f"""
            SELECT id AS file_id, filename
            FROM files
            WHERE user_id=? AND id IN ({placeholders})
            """,
            [user_id] + file_ids
        )
        owned_files = [dict(r) for r in cur.fetchall()]

        for f in owned_files:
            cur.execute(
                "INSERT INTO message_files(message_id, file_id) VALUES(?, ?)",
                (user_message_id, f["file_id"])
            )

        files_for_provider = owned_files

    conn.commit()
    conn.close()  # 先關掉，避免鎖住 DB

    # ===== 第二段：呼叫 provider（可能耗時）=====
    reply = provider.reply(
        user_text=user_text,
        conversation_id=conversation_id,
        user_id=user_id,
        files=files_for_provider,
    )

    # ===== 第三段：再開新連線寫入 assistant message =====
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO messages(conversation_id, user_id, role, content, created_at)
        VALUES(?, ?, ?, ?, ?)
        """,
        (conversation_id, user_id, "assistant", reply, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

    return {"reply": reply}
