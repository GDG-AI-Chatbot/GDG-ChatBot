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
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="auth/token", auto_error=False)

# 讓前端能呼叫後端（開發階段先全部允許）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student'
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

    # 確保 conversations 資料表有儲存 Dify ID 的欄位
    try:
        cur.execute("ALTER TABLE conversations ADD COLUMN dify_conversation_id TEXT")
    except sqlite3.OperationalError:
        pass  # 欄位已存在，跳過

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
    CREATE TABLE IF NOT EXISTS questions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question_number INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        options TEXT NOT NULL,  -- JSON string for options A,B,C,D
        correct_option TEXT NOT NULL,
        short_answer TEXT,
        created_at TEXT NOT NULL
    )
    """)

    # 為現有記錄添加題號（如果不存在）
    try:
        cur.execute("ALTER TABLE questions ADD COLUMN question_number INTEGER")
        # 為現有記錄設置題號
        cur.execute("UPDATE questions SET question_number = id WHERE question_number IS NULL")
    except sqlite3.OperationalError:
        # 欄位已存在，跳過
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS message_files(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        file_id INTEGER NOT NULL
    )
    """)

    # 若舊版 users table 沒有 role 欄位，嘗試新增（SQLite 若欄位已存在會拋出 OperationalError）
    try:
        cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'")
    except sqlite3.OperationalError:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS student_answers(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected_option TEXT NOT NULL,
        short_answer TEXT,
        is_correct BOOLEAN NOT NULL,
        submitted_at TEXT NOT NULL
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
def create_token(user_id: int, role: str):
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGO)

def require_user_id(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        return int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        return {
            "id": int(payload["sub"]),
            "role": payload.get("role", "student"),
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_teacher(user: dict = Depends(require_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


def require_student(user: dict = Depends(require_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return user


def get_optional_user(token: Optional[str] = Depends(oauth2_scheme_optional)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        return {
            "id": int(payload["sub"]),
            "role": payload.get("role", "student"),
        }
    except Exception:
        return None

# ====== Request Models ======
class RegisterIn(BaseModel):
    username: str
    password: str
    role: Optional[str] = "student"  # "student" or "teacher"

class LoginIn(BaseModel):
    username: str
    password: str

class CreateConversationIn(BaseModel):
    title: str = "New Chat"

class ChatIn(BaseModel):
    conversation_id: int
    message: str
    file_ids: Optional[List[int]] = []

class QuestionIn(BaseModel):
    prompt: str
    options: dict  # {"A": "", "B": "", "C": "", "D": ""}
    correct_option: str
    short_answer: Optional[str] = None

class StudentAnswerItem(BaseModel):
    question_id: int
    selected_option: str
    short_answer: Optional[str] = None
    is_correct: bool

class SubmitAnswersIn(BaseModel):
    student_id: int
    answers: List[StudentAnswerItem]

# ====== Routes ======
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/auth/register")
def register(data: RegisterIn):
    pw = data.password
    role = (data.role or "student").lower()
    if role not in ("student", "teacher"):
        raise HTTPException(status_code=400, detail="Invalid role; must be 'student' or 'teacher'")

    conn = db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users(username, password_hash, role) VALUES(?, ?, ?)",
            (data.username, hash_password(pw), role)
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
    cur.execute("SELECT id, password_hash, role FROM users WHERE username=?", (data.username,))
    row = cur.fetchone()
    conn.close()

    if not row or not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(row["id"], row["role"])
    return {"access_token": token, "role": row["role"], "user_id": row["id"]}

@app.post("/auth/token")
def token(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    給 Swagger /docs 的 Authorize 用（OAuth2 password flow 會送 form-data）
    form_data.username / form_data.password
    """
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash, role FROM users WHERE username=?", (form_data.username,))
    row = cur.fetchone()
    conn.close()

    # 你目前的密碼驗證函式：
    # - 如果你用 PBKDF2：verify_password(...)
    # - 如果你用 bcrypt：bcrypt.verify(...)
    if not row or not verify_password(form_data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    access_token = create_token(row["id"], row["role"])
    return {"access_token": access_token, "token_type": "bearer", "role": row["role"], "user_id": row["id"]}

@app.get("/auth/me")
def auth_me(user: dict = Depends(require_user)):
    return {"user_id": user["id"], "role": user["role"]}

@app.post("/files/upload")
def upload_file(file: UploadFile = File(...), user_id: int = Depends(require_user_id)):
    # 存檔到 uploads/
    safe_name = (file.filename or "unnamed_file").replace("/", "_").replace("\\", "_")
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

@app.post("/questions/upload")
def upload_question(data: QuestionIn, user: dict = Depends(require_teacher)):
    import json
    user_id = user["id"]
    conn = db()
    cur = conn.cursor()
    
    # 獲取下一個題號
    cur.execute("SELECT MAX(question_number) FROM questions WHERE user_id=?", (user_id,))
    max_number = cur.fetchone()[0]
    next_number = (max_number or 0) + 1
    
    cur.execute(
        "INSERT INTO questions(user_id, question_number, prompt, options, correct_option, short_answer, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
        (user_id, next_number, data.prompt, json.dumps(data.options), data.correct_option, data.short_answer, datetime.utcnow().isoformat())
    )
    conn.commit()
    question_id = cur.lastrowid
    conn.close()

    return {"question_id": question_id, "question_number": next_number}

@app.put("/questions/{question_id}")
def update_question(question_id: int, data: QuestionIn, user: dict = Depends(require_teacher)):
    import json
    user_id = user["id"]
    conn = db()
    cur = conn.cursor()
    
    # 檢查題目是否存在且屬於該用戶
    cur.execute("SELECT id FROM questions WHERE id=? AND user_id=?", (question_id, user_id))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found")
    
    # 更新題目
    cur.execute(
        "UPDATE questions SET prompt=?, options=?, correct_option=?, short_answer=? WHERE id=? AND user_id=?",
        (data.prompt, json.dumps(data.options), data.correct_option, data.short_answer, question_id, user_id)
    )
    conn.commit()
    conn.close()

    return {"message": "Question updated"}

@app.get("/questions/latest")
def get_latest_question():
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, question_number, prompt, options, correct_option, short_answer, created_at FROM questions ORDER BY question_number DESC LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="No questions found")

    import json
    return {
        "id": row["id"],
        "question_number": row["question_number"],
        "prompt": row["prompt"],
        "options": json.loads(row["options"]),
        "correct_option": row["correct_option"],
        "short_answer": row["short_answer"],
        "created_at": row["created_at"],
    }

@app.get("/questions")
def get_all_questions(user: Optional[dict] = Depends(get_optional_user)):
    conn = db()
    cur = conn.cursor()

    if user and user["role"] == "teacher":
        cur.execute(
            "SELECT id, question_number, prompt, options, correct_option, short_answer, created_at FROM questions WHERE user_id=? ORDER BY question_number ASC",
            (user["id"],)
        )
    else:
        cur.execute(
            "SELECT id, question_number, prompt, options, correct_option, short_answer, created_at FROM questions ORDER BY question_number ASC"
        )

    rows = cur.fetchall()
    conn.close()

    import json
    questions = []
    for row in rows:
        questions.append({
            "id": row["id"],
            "question_number": row["question_number"],
            "prompt": row["prompt"],
            "options": json.loads(row["options"]),
            "correct_option": row["correct_option"],
            "short_answer": row["short_answer"],
            "created_at": row["created_at"],
        })
    return {"questions": questions}

@app.get("/questions/{question_id}")
def get_question(question_id: int):
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, question_number, prompt, options, correct_option, short_answer, created_at FROM questions WHERE id=?",
        (question_id,)
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Question not found")

    import json
    return {
        "id": row["id"],
        "question_number": row["question_number"],
        "prompt": row["prompt"],
        "options": json.loads(row["options"]),
        "correct_option": row["correct_option"],
        "short_answer": row["short_answer"],
        "created_at": row["created_at"],
    }

@app.delete("/questions/{question_id}")
def delete_question(question_id: int, user: dict = Depends(require_teacher)):
    user_id = user["id"]
    conn = db()
    cur = conn.cursor()
    # 檢查題目是否存在且屬於該用戶
    cur.execute("SELECT id FROM questions WHERE id=? AND user_id=?", (question_id, user_id))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found")
    
    cur.execute("DELETE FROM questions WHERE id=? AND user_id=?", (question_id, user_id))
    
    # 重新排序題號
    cur.execute("SELECT id FROM questions WHERE user_id=? ORDER BY question_number ASC", (user_id,))
    rows = cur.fetchall()
    for i, row in enumerate(rows, 1):
        cur.execute("UPDATE questions SET question_number=? WHERE id=?", (i, row["id"]))
    
    conn.commit()
    conn.close()
    return {"message": "Question deleted and renumbered"}

@app.post("/student/answers")
def submit_answers(data: SubmitAnswersIn, user: dict = Depends(require_student)):
    if data.student_id != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot submit answers for another student")
    """接收並儲存學生的作答結果"""
    conn = db()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    """接收並儲存學生的作答結果"""
    conn = db()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    try:
        # 重新作答時先刪除該學生之前的所有紀錄
        cur.execute(
            "DELETE FROM student_answers WHERE student_id = ?",
            (data.student_id,)
        )

        for answer in data.answers:
            cur.execute(
                """
                INSERT INTO student_answers(student_id, question_id, selected_option, short_answer, is_correct, submitted_at)
                VALUES(?, ?, ?, ?, ?, ?)
                """,
                (data.student_id, answer.question_id, answer.selected_option, answer.short_answer, answer.is_correct, now)
            )
        
        conn.commit()
        return {"message": "Answers submitted successfully", "submitted_at": now}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to submit answers: {str(e)}")
    finally:
        conn.close()

@app.get("/student/answers/{student_id}")
def get_student_answers(student_id: int, user: dict = Depends(require_student)):
    if student_id != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot view another student's answers")
    """取得某位學生的所有作答結果"""
    conn = db()
    cur = conn.cursor()
    
    try:
        cur.execute(
            """
            SELECT sa.id, sa.question_id, q.question_number, q.prompt, 
                   sa.selected_option, sa.short_answer, sa.is_correct, sa.submitted_at
            FROM student_answers sa
            JOIN questions q ON q.id = sa.question_id
            WHERE sa.student_id = ?
            ORDER BY sa.submitted_at DESC, q.question_number ASC
            """,
            (student_id,)
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"answers": rows}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Failed to retrieve answers: {str(e)}")

@app.get("/student/analysis/{student_id}")
def analyze_student_knowledge(student_id: int, user: dict = Depends(require_student)):
    if student_id != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot analyze another student's answers")
    """將學生作答資料整理成 prompt，送給 AI 進行知識盲區分析"""
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT q.question_number, q.prompt, q.options, q.correct_option,
               sa.selected_option, sa.short_answer, sa.is_correct
        FROM student_answers sa
        JOIN questions q ON q.id = sa.question_id
        WHERE sa.student_id = ?
        ORDER BY q.question_number ASC
        """,
        (student_id,)
    )
    rows = cur.fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="No answers found for this student")

    import json

    prompt_lines = [
        "請協助分析這位學生的作答表現，找出知識盲區、答題弱點與學習建議。以下是學生的作答紀錄：",
        "",
    ]

    for row in rows:
        options = json.loads(row["options"])
        prompt_lines.append(f"題目 {row['question_number']}：{row['prompt']}")
        for key in ["A", "B", "C", "D"]:
            if key in options:
                prompt_lines.append(f"  {key}. {options[key]}")
        prompt_lines.append(f"  學生答案：{row['selected_option']}")
        prompt_lines.append(f"  正確答案：{row['correct_option']}")
        prompt_lines.append(f"  是否正確：{'是' if row['is_correct'] else '否'}")
        prompt_lines.append(f"  簡答回覆：{row['short_answer'] or '（無）'}")
        prompt_lines.append("")

    prompt_lines.append("請根據以上資料提供：")
    prompt_lines.append("1. 學生的主要知識盲區或觀念不足點。")
    prompt_lines.append("2. 他的錯誤模式，例如常在哪種題型或哪類概念出錯。")
    prompt_lines.append("3. 最適合他的後續學習建議。")
    prompt_lines.append("請用中文簡單回答，並條列出重點。")

    prompt = "\n".join(prompt_lines)

    analysis = provider.reply(
        user_text=prompt,
        conversation_id=0,
        user_id=student_id,
        files=None,
        mode="analyze"
    )

    return {"analysis": analysis}

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

    # ===== 第一段：只做 DB 寫入與查詢 Dify ID =====
    conn = db()
    cur = conn.cursor()

    # 查詢該聊天室是否存在，順便撈出 dify_conversation_id
    cur.execute(
        "SELECT id, dify_conversation_id FROM conversations WHERE id=? AND user_id=?",
        (conversation_id, user_id)
    )
    convo_row = cur.fetchone()
    if not convo_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    dify_conv_id = convo_row["dify_conversation_id"]
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

    reply, new_dify_id = provider.reply(
        user_text=user_text,
        conversation_id=dify_conv_id, 
        user_id=user_id,
        files=files_for_provider,
        mode="chat"
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
    if new_dify_id and not dify_conv_id:
        cur.execute(
            "UPDATE conversations SET dify_conversation_id = ? WHERE id = ?",
            (new_dify_id, conversation_id)
        )
    conn.commit()
    conn.close()

    return {"reply": reply}
