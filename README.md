# SettleTrack

Payment reconciliation and settlement reporting for Nigerian SMEs. Upload transaction records (Paystack CSV, Excel, or bank statements), find missing/duplicate/mismatched payments automatically, and export clean reports — without manual spreadsheet checking.

Pilot-stage product. See [docs/project-control.md](docs/project-control.md) for current MVP scope.

## Stack

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite (dev) / PostgreSQL (production)
- **Frontend:** React, TypeScript, Vite
- **Auth:** JWT, with optional Google Sign-In

## Project structure

```
backend/    FastAPI app, SQLAlchemy models, tests
frontend/   React + Vite single-page app
docs/       Product scope, schema notes, launch materials
```

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate      # Windows Git Bash
# or: source venv/bin/activate    # macOS/Linux
pip install -r requirements.txt
cp .env.example .env               # fill in real values
python -m uvicorn app.main:app --reload --port 8000
```

Runs at `http://127.0.0.1:8000`. Interactive API docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`. **Use `localhost`, not `127.0.0.1`** — the backend's CORS allowlist only permits `localhost:5173`.

### Backend environment variables (`backend/.env`)

| Variable | Purpose |
|---|---|
| `APP_NAME` | Display name for the app |
| `APP_ENV` | `development` or `production` — controls whether `/auth/forgot-password` returns the reset token directly (dev only) |
| `DATABASE_URL` | SQLite file path locally, Postgres URL in production |
| `JWT_SECRET_KEY` | Secret for signing auth tokens — change for production |
| `JWT_ALGORITHM` | JWT signing algorithm (`HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Login session length |
| `GOOGLE_CLIENT_ID` | OAuth Client ID from Google Cloud Console — leave blank to keep Google Sign-In disabled |

### Frontend environment variables (`frontend/.env.local`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL |
| `VITE_GOOGLE_CLIENT_ID` | Same Google OAuth Client ID as the backend — leave blank to keep the Google button disabled |

## Testing

```bash
cd backend
python -m pytest

cd frontend
npm run lint
npm run build
```

## Trying it out

A sample transaction file is at [backend/sample-transactions-demo.csv](backend/sample-transactions-demo.csv) — includes a duplicate reference and failed payments so reconciliation has something to flag. Register an account, create a business, upload that file, then run reconciliation.

Note: `/paystack/sync` is currently a placeholder and doesn't pull real Paystack transactions yet, so "Unmatched" and "Amount mismatch" results aren't demonstrable until that integration is built.

## Deployment

Hosted on Render, auto-deploying from the `feature/settletrack-mvp` branch:
- Frontend (static site) → `settletrack-frontend-1`
- Backend (web service) → `settletrack`

Both are on Render's free tier, which spins down after inactivity — the first request after idle can take 30–90 seconds. Check the **Logs** tab on the Render dashboard if a deploy shows as failed rather than just slow.
