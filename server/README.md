# FinAI — Backend (Module 1: Authentication)

## What's built so far

- Project skeleton (`src/config`, `controllers`, `middleware`, `models`, `routes`, `services`, `validators`, `utils`, `ai`, `constants`, `jobs`)
- `User` model with role-conditional sub-profiles (`customerProfile`, `officerProfile`)
- Full Authentication module: register, login, refresh, logout, get current user
- JWT access + refresh token flow (refresh token in httpOnly cookie)
- Centralized error handling, role-based access middleware, request validation
- Jest + Supertest test suite (`tests/auth.test.js`)

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` — your MongoDB Atlas connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate two different random strings, e.g. `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Leave `CLOUDINARY_*` and `GEMINI_API_KEY` blank for now — not needed until later modules

## Run

```bash
npm run dev      # starts on http://localhost:5000 with nodemon
```

Check it's alive: `GET http://localhost:5000/api/health`

## Run tests

```bash
npm test
```

This spins up an in-memory MongoDB automatically (no need for a real DB during testing) and runs the full auth test suite: register, login, protected routes, refresh flow, logout, and validation edge cases.

> Note: the first `npm test` run will download a MongoDB binary (~100MB) — needs internet access once, then it's cached locally.

## API Reference — Auth Module

| Method | Route | Access | Body |
|---|---|---|---|
| POST | `/api/auth/register` | Public | `{ name, email, phone, password }` |
| POST | `/api/auth/login` | Public | `{ email, password }` |
| POST | `/api/auth/refresh` | Public (needs refresh cookie) | — |
| POST | `/api/auth/logout` | Private | — |
| GET | `/api/auth/me` | Private | — |

All private routes require: `Authorization: Bearer <accessToken>`

### Example: Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Harpreet Kaur","email":"harpreet@example.com","phone":"9876543210","password":"password123"}'
```

## Design decisions worth remembering for interviews

1. **`app.js` vs `server.js` split** — `app.js` only configures Express (no DB connection, no `listen()`). This makes the app importable and testable (Supertest) without opening a real port or DB connection per test file.
2. **Access + refresh token pattern** — short-lived access token (15m) sent in the `Authorization` header; long-lived refresh token (7d) stored as an httpOnly cookie AND mirrored in the DB. Comparing the incoming refresh token against the DB copy means a single logout / DB update can revoke a compromised token — you can't do that with a stateless-only JWT approach.
3. **Only `customer` self-registers** — officer/admin accounts must be created by an admin (built in the next module, User Management). Never let the public register as a loan officer.
4. **`select: false` on `password` and `refreshToken`** — these fields never leak in a normal `User.find()` unless explicitly requested with `.select('+password')`. Defense in depth beyond just remembering to strip them in each response.
5. **Centralized error handler** — every controller just `throw`s an `ApiError(statusCode, message)`; one middleware formats every error response the same way. No repeated try/catch blocks.

## Next module: User Management (admin creates officers, profile completion)
