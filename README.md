# Bytewise Quiz App

## Flask setup

Run these commands from the `a` project directory in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "replace-with-a-long-unique-password"
python seed.py
python app.py
```

Open `http://127.0.0.1:5000`. Flask serves the frontend and API from the same origin. The SQLite database is created at `instance/bytewise.sqlite3`; set `DATABASE_URL` to use another SQLAlchemy database URL. Keep `SECRET_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` out of source control. Set a persistent `SECRET_KEY` before starting the server so signed sessions remain valid across restarts.

The admin credentials are provisioned as an admin account by `seed.py` when both admin environment variables are set. The five rounds contain 10 stored question rows apiece. Since each existing source module has 25 unique questions, the seed script cycles those questions into later rounds without duplicates inside a round.

## API

- `POST /api/register` and `POST /api/login` issue signed bearer tokens.
- `POST /api/admin/login` verifies the configured server-side admin credentials.
- `GET /api/subjects` and authenticated `GET /api/progress` populate the subject dashboard.
- `GET /api/questions?subject=Networks&type=Theory&round=1` returns one round of 10 questions.
- Authenticated `POST /api/submit-score` records a student's best score for a round.
- `GET /api/leaderboard` returns the top 100 students, ordered by total score and rounds completed.
- Admin-only `POST /api/admin/add-question` adds a question to a seeded round.

API requests use an `Authorization: Bearer <token>` header. The server allows CORS for local frontend development; production deployments should set `CORS_ORIGINS` to an explicit comma-separated origin list.
