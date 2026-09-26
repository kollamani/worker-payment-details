# Financial Ledger & Transaction Tracking App

A full-stack web app that digitizes an Excel-style deposit/withdrawal ledger sheet, with JWT-authenticated admin access, member (CRUD) management, transaction recording, a live auto-calculating ledger grid, and an individual user detail/summary view.

**Stack:** Node.js + Express + MongoDB (Mongoose) on the backend, React (Vite) + Tailwind CSS + React Router + Axios + Lucide Icons on the frontend.

---

## 1. Project Structure

```
financial-ledger-app/
├── backend/
│   ├── config/
│   │   └── db.js                  # MongoDB connection
│   ├── models/
│   │   ├── Admin.js                # Admin user (auth)
│   │   ├── Member.js               # Ledger member (J.No, Name...)
│   │   └── Transaction.js          # Deposit / withdrawal records
│   ├── middleware/
│   │   ├── auth.js                 # JWT route protection
│   │   └── errorHandler.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── memberController.js
│   │   └── transactionController.js  # Includes ledger grid aggregation
│   ├── routes/
│   │   ├── auth.js
│   │   ├── members.js
│   │   └── transactions.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── api/axios.js             # Axios instance + JWT interceptor
    │   ├── context/AuthContext.jsx  # Auth state (login/signup/logout)
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── ProtectedRoute.jsx
    │   │   ├── MemberForm.jsx
    │   │   ├── TransactionForm.jsx
    │   │   ├── LedgerTable.jsx      # Excel-style main grid
    │   │   ├── MetricCard.jsx
    │   │   └── ConfirmModal.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Signup.jsx
    │   │   ├── Dashboard.jsx        # Sheet overview + ledger grid
    │   │   ├── Members.jsx          # Manage members (CRUD)
    │   │   ├── RecordTransaction.jsx
    │   │   ├── UsersList.jsx        # Search/select a user
    │   │   └── UserDetail.jsx       # Individual summary + timeline
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── .env.example
```

---

## 2. Data Model

**Member**: `jNo`, `name`, `phone`, `notes`, `isActive`. `sNo` (serial number) is derived from list position, not stored.

**Transaction**: `member` (ref), `date`, `type` (`deposit` | `withdrawal`), `amount`, `note`.

All ledger figures are **derived, never stored**, so they're always accurate:
- **Total Deposited** = sum of that member's `deposit` transactions
- **Off / Half Amount** = Total Deposited ÷ 2
- **Received / Withdrawal** = sum of that member's `withdrawal` transactions
- **Pending Balance** = Total Deposited − Total Withdrawn

The main ledger grid (`GET /api/transactions/ledger/grid`) pivots all transactions into a members × dates matrix, matching the original Excel layout, plus computes grand totals across all members.

---

## 3. Backend Setup

**Prerequisites:** Node.js 18+, and a running MongoDB instance (local install or a free MongoDB Atlas cluster).

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/financial-ledger
JWT_SECRET=replace_with_a_long_random_string
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
RESTRICT_SIGNUP_TO_FIRST_ADMIN=true
```

Run the backend:
```bash
npm run dev     # nodemon, auto-restarts on changes
# or
npm start        # plain node
```

You should see:
```
MongoDB connected: 127.0.0.1/financial-ledger
Server running in development mode on port 5000
```

Test it: `GET http://localhost:5000/api/health` → `{ "success": true, "message": "Financial Ledger API is running" }`

### Key API Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/signup` | Create admin account | Public (restricted to first admin if `RESTRICT_SIGNUP_TO_FIRST_ADMIN=true`) |
| POST | `/api/auth/login` | Log in, returns JWT | Public |
| GET | `/api/auth/me` | Current admin profile | Protected |
| GET | `/api/members` | List all members | Protected |
| POST | `/api/members` | Create member | Protected |
| PUT | `/api/members/:id` | Update member | Protected |
| DELETE | `/api/members/:id` | Delete member + their transactions | Protected |
| GET | `/api/members/:id/summary` | Member totals + timeline | Protected |
| GET | `/api/transactions` | List transactions (filterable) | Protected |
| POST | `/api/transactions` | Record deposit/withdrawal | Protected |
| PUT | `/api/transactions/:id` | Edit a transaction | Protected |
| DELETE | `/api/transactions/:id` | Delete a transaction | Protected |
| GET | `/api/transactions/ledger/grid` | Full pivoted ledger sheet | Protected |

All protected routes require header: `Authorization: Bearer <token>`.

---

## 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `.env` if your backend runs on a different host/port:
```env
VITE_API_URL=http://localhost:5000/api
```

Run the frontend:
```bash
npm run dev
```

Open **http://localhost:5173**. You'll be redirected to `/login`. Since there's no admin yet, click **Sign up**, create your admin account, and you'll be logged straight into the Dashboard.

---

## 5. Using the App

1. **Sign up / Log in** — creates/uses your JWT-authenticated admin session (token stored in `localStorage`, auto-attached to every API call, auto-redirects to `/login` if it expires).
2. **Manage Members** — add each person with their `J.No` and name (mirrors the Excel sheet's serial/journal numbers). Edit or delete (with a confirmation prompt) any time.
3. **Record Transaction** — pick a member, a date, an amount, and whether it's a **Deposit** or a **Withdrawal/Received** amount.
4. **Dashboard / Sheet Overview** — the main grid: one row per member, one column per date that has any transaction anywhere, live totals (Total Deposited, Half/Off Amount, Received/Withdrawn, Pending Balance) per row and as grand totals at the bottom.
5. **User Detail View** — search/select any member to see their 4 summary metric cards and a full chronological timeline of every deposit and withdrawal.

---

## 6. Notes on Production Readiness

- Passwords are hashed with **bcryptjs**; JWTs expire and are verified on every protected request.
- All monetary calculations happen server-side from the transaction ledger (no client-trusted totals).
- Centralized Express error handler normalizes Mongoose cast/validation/duplicate-key errors into clean JSON responses.
- CORS is locked to `CLIENT_URL` — update this env var for your deployed frontend domain.
- For production deployment: set `NODE_ENV=production`, use a managed MongoDB (Atlas), serve the built frontend (`npm run build` → `dist/`) via a static host or behind the same reverse proxy as the API, and set `RESTRICT_SIGNUP_TO_FIRST_ADMIN=true` (or remove the signup route entirely) once your admin account exists.
- **HTTP security headers** (CSP, HSTS, clickjacking / MIME-sniffing / referrer defences, COOP / COEP / CORP, Permissions-Policy, `Cache-Control: no-store` on `/api`) are configured for the API, the SPA and nginx. See **[docs/SECURITY-HEADERS.md](docs/SECURITY-HEADERS.md)** for the policy, the safe Report-Only rollout, the HSTS preload prerequisites and the full verification checklist.
  - Audit anytime: `cd backend && npm run verify:headers` (add `--url <origin> [--profile spa]` for a deployed origin, `--print` for the canonical values, `--hashes <html>` for inline-script hashes).
  - Gate CI with: `cd backend && npm run test:security-headers` — it fails if any of the four header config copies (Vercel x2, `_headers`, nginx) drifts apart.
- **Secrets:** never commit `.env` (a root `.gitignore` now covers them, and `.env.example` only carries placeholders). If this repository has ever been public, rotate the MongoDB Atlas password **and** `JWT_SECRET`, then `git rm --cached backend/.env frontend/.env`.
