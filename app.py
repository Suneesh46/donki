from __future__ import annotations

import hmac
import os
import secrets
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, abort, g, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import CheckConstraint, UniqueConstraint, func
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)

SUBJECTS = {
    "Networks": {
        "id": "networks",
        "title": "Computer Networks",
        "short": "NET",
        "description": "Protocols, routing, and network tools",
    },
    "ADA": {
        "id": "algorithms",
        "title": "Algorithms & Data Structures",
        "short": "A/D",
        "description": "Complexity, problem solving, and implementation",
    },
    "Java": {
        "id": "java",
        "title": "Java Programming",
        "short": "J",
        "description": "Object-oriented concepts and Java practice",
    },
    "Python AI": {
        "id": "python-ai",
        "title": "Python & AI",
        "short": "AI",
        "description": "Machine learning and intelligent applications",
    },
    "DBMS": {
        "id": "dbms",
        "title": "Database Systems",
        "short": "DB",
        "description": "SQL, relational models, and data design",
    },
    "Web Frontend": {
        "id": "frontend",
        "title": "Web Development",
        "short": "</>",
        "description": "Frontend fundamentals and browser APIs",
    },
    "Web Backend": {
        "id": "backend",
        "title": "Backend Development",
        "short": "API",
        "description": "Servers, APIs, and backend workflows",
    },
}
MODULE_TYPES = ("Theory", "Lab")
TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
FRONTEND_ASSETS = {"style.css", "script.js"}

app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY") or secrets.token_urlsafe(32),
    SQLALCHEMY_DATABASE_URI=os.environ.get(
        "DATABASE_URL", f"sqlite:///{(INSTANCE_DIR / 'bytewise.sqlite3').as_posix()}"
    ),
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)
db = SQLAlchemy(app)
CORS(
    app,
    resources={r"/api/*": {"origins": os.environ.get("CORS_ORIGINS", "*").split(",")}},
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "OPTIONS"],
)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(16), nullable=False, default="student")
    score_records = db.relationship(
        "ScoreRecord", back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (CheckConstraint("role IN ('student', 'admin')", name="user_role"),)


class Question(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    subject = db.Column(db.String(40), nullable=False)
    module_type = db.Column(db.String(16), nullable=False)
    round_number = db.Column(db.Integer, nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    options = db.Column(db.JSON, nullable=False)
    answer_index = db.Column(db.Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "subject",
            "module_type",
            "round_number",
            "question_text",
            name="question_round_text",
        ),
        CheckConstraint("round_number BETWEEN 1 AND 5", name="question_round_range"),
        CheckConstraint("answer_index BETWEEN 0 AND 3", name="question_answer_range"),
        CheckConstraint("module_type IN ('Theory', 'Lab')", name="question_module_type"),
    )


class ScoreRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    subject = db.Column(db.String(40), nullable=False)
    module_type = db.Column(db.String(16), nullable=False)
    round_number = db.Column(db.Integer, nullable=False)
    score = db.Column(db.Integer, nullable=False)
    completed_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    user = db.relationship("User", back_populates="score_records")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "subject",
            "module_type",
            "round_number",
            name="score_user_module_round",
        ),
        CheckConstraint("round_number BETWEEN 1 AND 5", name="score_round_range"),
        CheckConstraint("score BETWEEN 0 AND 10", name="score_value_range"),
        CheckConstraint("module_type IN ('Theory', 'Lab')", name="score_module_type"),
    )


def token_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="bytewise-api-v1")


def create_token(user: User) -> str:
    return token_serializer().dumps({"user_id": user.id})


def user_payload(user: User) -> dict[str, Any]:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


def json_body() -> dict[str, Any] | None:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else None


def api_error(message: str, status: int):
    return jsonify({"error": message}), status


def normalized_email(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    email = value.strip().lower()
    if len(email) > 254 or "@" not in email or email.startswith("@") or email.endswith("@"):
        return None
    return email


def valid_module(subject: Any, module_type: Any, round_number: Any) -> tuple[str, str, int] | None:
    if subject not in SUBJECTS or module_type not in MODULE_TYPES:
        return None
    try:
        parsed_round = int(round_number)
    except (TypeError, ValueError):
        return None
    if not 1 <= parsed_round <= 5:
        return None
    return subject, module_type, parsed_round


def require_auth(role: str | None = None) -> Callable:
    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get("Authorization", "")
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() != "bearer" or not token:
                return api_error("Authentication required.", 401)
            try:
                token_data = token_serializer().loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
            except SignatureExpired:
                return api_error("Your session expired. Please sign in again.", 401)
            except BadSignature:
                return api_error("Invalid authentication token.", 401)

            user = db.session.get(User, token_data.get("user_id"))
            if user is None:
                return api_error("Account not found.", 401)
            if role and user.role != role:
                return api_error("You do not have permission to perform this action.", 403)
            g.current_user = user
            return view(*args, **kwargs)

        return wrapped

    return decorator


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:asset>")
def frontend_asset(asset: str):
    if asset not in FRONTEND_ASSETS:
        abort(404)
    return send_from_directory(BASE_DIR, asset)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/register")
def register():
    payload = json_body()
    if payload is None:
        return api_error("Expected a JSON request body.", 400)
    name = payload.get("name")
    email = normalized_email(payload.get("email"))
    password = payload.get("password")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        return api_error("Name is required and must be at most 120 characters.", 400)
    if email is None:
        return api_error("Enter a valid email address.", 400)
    if not isinstance(password, str) or len(password) < 8:
        return api_error("Password must be at least 8 characters.", 400)

    user = User(
        name=name.strip(),
        email=email,
        password_hash=generate_password_hash(password),
        role="student",
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return api_error("An account with that email already exists.", 409)
    return jsonify({"token": create_token(user), "user": user_payload(user)}), 201


@app.post("/api/login")
def login():
    payload = json_body()
    if payload is None:
        return api_error("Expected a JSON request body.", 400)
    email = normalized_email(payload.get("email"))
    password = payload.get("password")
    user = User.query.filter_by(email=email).first() if email else None
    if (
        user is None
        or user.role != "student"
        or not isinstance(password, str)
        or not check_password_hash(user.password_hash, password)
    ):
        return api_error("Email or password is incorrect.", 401)
    return jsonify({"token": create_token(user), "user": user_payload(user)})


@app.post("/api/admin/login")
def admin_login():
    payload = json_body()
    if payload is None:
        return api_error("Expected a JSON request body.", 400)
    configured_email = normalized_email(os.environ.get("ADMIN_EMAIL"))
    configured_password = os.environ.get("ADMIN_PASSWORD")
    if not configured_email or not configured_password:
        return api_error("Admin credentials are not configured on the server.", 503)

    email = normalized_email(payload.get("email"))
    password = payload.get("password")
    if (
        email is None
        or email != configured_email
        or not isinstance(password, str)
        or not hmac.compare_digest(password, configured_password)
    ):
        return api_error("Admin email or password is incorrect.", 401)

    user = User.query.filter_by(email=configured_email).first()
    if user is None:
        user = User(
            name=os.environ.get("ADMIN_NAME", "Bytewise Admin").strip()[:120],
            email=configured_email,
            password_hash=generate_password_hash(configured_password),
            role="admin",
        )
        db.session.add(user)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            user = User.query.filter_by(email=configured_email).first()
    elif user.role != "admin" or not check_password_hash(user.password_hash, password):
        return api_error("Configured admin account conflicts with an existing account.", 409)

    if user is None:
        return api_error("Unable to initialize the admin account.", 500)
    return jsonify({"token": create_token(user), "user": user_payload(user)})


@app.get("/api/subjects")
def subjects():
    subject_list = []
    for name, metadata in SUBJECTS.items():
        counts = {
            module_type: Question.query.filter_by(subject=name, module_type=module_type).count()
            for module_type in MODULE_TYPES
        }
        subject_list.append({"subject": name, **metadata, "question_counts": counts})
    return jsonify({"subjects": subject_list})


@app.get("/api/questions")
def questions():
    selection = valid_module(
        request.args.get("subject"), request.args.get("type"), request.args.get("round")
    )
    if selection is None:
        return api_error("Provide a valid subject, type (Theory or Lab), and round (1-5).", 400)
    subject, module_type, round_number = selection
    rows = (
        Question.query.filter_by(
            subject=subject, module_type=module_type, round_number=round_number
        )
        .order_by(func.random())
        .limit(10)
        .all()
    )
    if len(rows) != 10:
        return api_error("This round must have at least 10 questions.", 404)
    return jsonify(
        {
            "subject": subject,
            "type": module_type,
            "round": round_number,
            "questions": [
                {
                    "id": row.id,
                    "category": f"{subject} {module_type}",
                    "question": row.question_text,
                    "options": row.options,
                    "answer": row.answer_index,
                }
                for row in rows
            ],
        }
    )


@app.post("/api/submit-score")
@require_auth("student")
def submit_score():
    payload = json_body()
    if payload is None:
        return api_error("Expected a JSON request body.", 400)
    selection = valid_module(
        payload.get("subject"), payload.get("module_type"), payload.get("round_number")
    )
    score = payload.get("score")
    if selection is None:
        return api_error("Provide a valid subject, module_type, and round_number.", 400)
    if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 10:
        return api_error("Score must be an integer from 0 to 10.", 400)

    subject, module_type, round_number = selection
    question_count = Question.query.filter_by(
        subject=subject, module_type=module_type, round_number=round_number
    ).count()
    if question_count < 10:
        return api_error("Cannot submit a score for an unseeded round.", 404)

    record = ScoreRecord.query.filter_by(
        user_id=g.current_user.id,
        subject=subject,
        module_type=module_type,
        round_number=round_number,
    ).first()
    previous_best = record.score if record is not None else 0
    if record is None:
        record = ScoreRecord(
            user_id=g.current_user.id,
            subject=subject,
            module_type=module_type,
            round_number=round_number,
            score=score,
        )
        db.session.add(record)
    else:
        record.score = max(record.score, score)
        record.completed_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(
        {
            "score": score,
            "best_score": record.score,
            "xp_awarded": max(0, record.score - previous_best) * 10,
            "round_number": round_number,
            "saved": True,
        }
    )


@app.get("/api/progress")
@require_auth("student")
def progress():
    records = ScoreRecord.query.filter_by(user_id=g.current_user.id).all()
    grouped: dict[str, dict[str, list[ScoreRecord]]] = {}
    for record in records:
        grouped.setdefault(record.subject, {}).setdefault(record.module_type, []).append(record)

    result: dict[str, dict[str, dict[str, int]]] = {}
    for subject, modules in grouped.items():
        result[subject] = {}
        for module_type, module_records in modules.items():
            completed_rounds = {item.round_number for item in module_records}
            consecutive_rounds = 0
            while consecutive_rounds + 1 in completed_rounds:
                consecutive_rounds += 1
            result[subject][module_type] = {
                "completed_round": consecutive_rounds,
                "rounds_completed": len(completed_rounds),
                "best_score": max(item.score for item in module_records),
                "xp": sum(item.score * 10 for item in module_records),
            }
    return jsonify({"progress": result})


@app.get("/api/leaderboard")
def leaderboard():
    total_score = func.sum(ScoreRecord.score).label("total_score")
    rounds_completed = func.count(ScoreRecord.id).label("rounds_completed")
    rows = (
        db.session.query(User.name, total_score, rounds_completed)
        .join(ScoreRecord, ScoreRecord.user_id == User.id)
        .filter(User.role == "student")
        .group_by(User.id, User.name)
        .order_by(total_score.desc(), rounds_completed.desc(), User.name.asc())
        .limit(100)
        .all()
    )
    rankings = [
        {
            "rank": index,
            "name": row.name,
            "rounds_completed": row.rounds_completed,
            "total_score": row.total_score,
        }
        for index, row in enumerate(rows, start=1)
    ]
    return jsonify({"leaderboard": rankings})


@app.post("/api/admin/add-question")
@require_auth("admin")
def add_question():
    payload = json_body()
    if payload is None:
        return api_error("Expected a JSON request body.", 400)
    selection = valid_module(
        payload.get("subject"), payload.get("module_type"), payload.get("round_number")
    )
    question_text = payload.get("question_text")
    options = payload.get("options")
    answer_index = payload.get("answer_index")
    if selection is None:
        return api_error("Provide a valid subject, module_type, and round_number.", 400)
    if not isinstance(question_text, str) or not question_text.strip():
        return api_error("Question text is required.", 400)
    if (
        not isinstance(options, list)
        or len(options) != 4
        or any(not isinstance(option, str) or not option.strip() for option in options)
    ):
        return api_error("Provide exactly four non-empty answer options.", 400)
    if isinstance(answer_index, bool) or not isinstance(answer_index, int) or not 0 <= answer_index <= 3:
        return api_error("answer_index must be an integer from 0 to 3.", 400)

    subject, module_type, round_number = selection
    row = Question(
        subject=subject,
        module_type=module_type,
        round_number=round_number,
        question_text=question_text.strip(),
        options=[option.strip() for option in options],
        answer_index=answer_index,
    )
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return api_error("That question already exists in the selected round.", 409)
    return jsonify({"id": row.id, "created": True}), 201


@app.cli.command("init-db")
def init_db_command():
    """Create database tables without starting the development server."""
    db.create_all()
    print("Database tables are ready.")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
    )