from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import json5
from werkzeug.security import generate_password_hash

from app import BASE_DIR, SUBJECTS, Question, User, app, db, normalized_email


SOURCE_FILE = BASE_DIR / "questions.js"
BANK_SUBJECTS = {
    "computerNetworksBank": "Networks",
    "adaBank": "ADA",
    "javaBank": "Java",
    "pythonAIBank": "Python AI",
    "dbmsBank": "DBMS",
    "frontendBank": "Web Frontend",
    "backendBank": "Web Backend",
}
BANK_DECLARATION = re.compile(r"\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[")


def extract_array(source: str, opening_index: int) -> tuple[list[dict[str, Any]], int]:
    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False

    for index in range(opening_index, len(source)):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""

        if line_comment:
            if char == "\n":
                line_comment = False
            continue
        if block_comment:
            if char == "*" and next_char == "/":
                block_comment = False
            continue
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char == "/" and next_char == "/":
            line_comment = True
            continue
        if char == "/" and next_char == "*":
            block_comment = True
            continue
        if char in ("'", '"', "`"):
            quote = char
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                parsed = json5.loads(source[opening_index : index + 1])
                if not isinstance(parsed, list):
                    raise ValueError("Question bank declaration must contain an array.")
                return parsed, index + 1

    raise ValueError("Unclosed array in questions.js.")


def load_question_banks() -> dict[str, dict[str, list[dict[str, Any]]]]:
    source = SOURCE_FILE.read_text(encoding="utf-8")
    found: dict[str, dict[str, list[dict[str, Any]]]] = {}

    for match in BANK_DECLARATION.finditer(source):
        bank_name = match.group(1)
        if bank_name not in BANK_SUBJECTS:
            continue
        raw_bank, _ = extract_array(source, match.end() - 1)
        subject = BANK_SUBJECTS[bank_name]
        found[subject] = {"Theory": [], "Lab": []}
        for item in raw_bank:
            category = item.get("category", "")
            module_type = "Lab" if "lab" in category.lower() else "Theory"
            options = item.get("options")
            answer_index = item.get("answer")
            question_text = item.get("question")
            if (
                not isinstance(question_text, str)
                or not isinstance(options, list)
                or len(options) != 4
                or isinstance(answer_index, bool)
                or not isinstance(answer_index, int)
                or not 0 <= answer_index <= 3
            ):
                raise ValueError(f"Invalid question in {bank_name}: {item!r}")
            found[subject][module_type].append(
                {
                    "question_text": question_text,
                    "options": options,
                    "answer_index": answer_index,
                }
            )

    missing = set(SUBJECTS) - set(found)
    if missing:
        raise ValueError(f"Missing question banks for: {', '.join(sorted(missing))}")
    for subject, modules in found.items():
        for module_type, questions in modules.items():
            if len(questions) < 10:
                raise ValueError(f"{subject} {module_type} requires at least 10 source questions.")
    return found


def build_seed_rows(
    banks: dict[str, dict[str, list[dict[str, Any]]]],
) -> list[dict[str, Any]]:
    rows = []
    for subject, modules in banks.items():
        for module_type, bank in modules.items():
            for round_number in range(1, 6):
                for question_number in range(10):
                    source_index = ((round_number - 1) * 10 + question_number) % len(bank)
                    rows.append(
                        {
                            "subject": subject,
                            "module_type": module_type,
                            "round_number": round_number,
                            **bank[source_index],
                        }
                    )
    return rows


def seed_questions(rows: list[dict[str, Any]]) -> tuple[int, int]:
    existing = {
        (row.subject, row.module_type, row.round_number, row.question_text): row
        for row in Question.query.all()
    }
    created = 0
    updated = 0

    for values in rows:
        key = (
            values["subject"],
            values["module_type"],
            values["round_number"],
            values["question_text"],
        )
        row = existing.get(key)
        if row is None:
            row = Question(**values)
            db.session.add(row)
            existing[key] = row
            created += 1
        else:
            row.options = values["options"]
            row.answer_index = values["answer_index"]
            updated += 1

    db.session.commit()
    return created, updated


def seed_admin_from_environment() -> str | None:
    email = normalized_email(os.environ.get("ADMIN_EMAIL"))
    password = os.environ.get("ADMIN_PASSWORD")
    if not email and not password:
        return None
    if not email or not password:
        raise ValueError("Set both ADMIN_EMAIL and ADMIN_PASSWORD to seed an admin account.")

    user = User.query.filter_by(email=email).first()
    if user is None:
        user = User(
            name=os.environ.get("ADMIN_NAME", "Bytewise Admin").strip()[:120],
            email=email,
            password_hash=generate_password_hash(password),
            role="admin",
        )
        db.session.add(user)
        db.session.commit()
        return "created"
    if user.role != "admin":
        raise ValueError("ADMIN_EMAIL belongs to a student account and cannot be promoted by seeding.")
    return "existing"


def main() -> None:
    banks = load_question_banks()
    rows = build_seed_rows(banks)
    with app.app_context():
        db.create_all()
        created, updated = seed_questions(rows)
        admin_status = seed_admin_from_environment()
    print(f"Seeded {len(rows)} round questions: {created} created, {updated} refreshed.")
    if admin_status:
        print(f"Admin account: {admin_status} from environment configuration.")
    print(f"Database: {app.config['SQLALCHEMY_DATABASE_URI']}")


if __name__ == "__main__":
    main()