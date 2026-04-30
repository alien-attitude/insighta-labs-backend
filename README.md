# Insighta Labs+ — Backend API

Secure, multi-interface demographic intelligence platform. Builds on profile api with GitHub OAuth, PKCE, JWT token management, RBAC, and CSV export.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Insighta Labs+                       │
│                                                         │
│   ┌──────────────┐    ┌──────────────────────────────┐  │
│   │  CLI Tool    │    │     Web Portal (EJS/Express) │  │
│   │  (Node.js)   │    │     HTTP-only cookies + CSRF │  │
│   └──────┬───────┘    └──────────────┬───────────────┘  │
│          │ Bearer token              │ Cookie            │
│          └──────────────┬────────────┘                  │
│                         ▼                               │
│            ┌────────────────────────┐                   │
│            │   Backend API          │                   │
│            │   Express + MongoDB    │                   │
│            │   JWT + PKCE + RBAC    │                   │
│            └────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

Three separate repositories. One backend. All interfaces share the same data and auth system.

---

## Quick Start

```bash
npm install
cp .env.example .env.development.local
# Fill in all env vars

npm run dev       # development
npm start         # production

node scripts/seed.js  # seed 2026 profiles
```

---

## Environment Variables

| Variable              | Description                              |
|-----------------------|------------------------------------------|
| `MONGODB_URI`         | MongoDB Atlas connection string          |
| `PORT`                | Server port (default: 3000)              |
| `SERVER_URL`          | Public backend URL                       |
| `JWT_SECRET`          | Long random string for JWT signing       |
| `GITHUB_CLIENT_ID`    | GitHub OAuth App Client ID               |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth App Client Secret           |
| `FRONTEND_URL`        | Web portal URL (for CORS + redirects)    |

---

## Authentication Flow

### GitHub OAuth App Setup
1. Go to GitHub → Settings → Developer Settings → OAuth Apps → New
2. Homepage URL: your backend URL
3. Callback URL: `https://your-backend.vercel.app/auth/github/callback`

### Web Flow (Browser)
```
1. User visits /login → clicks "Continue with GitHub"
2. Web portal → GET /auth/github
3. Backend generates state, stores in DB, redirects to GitHub
4. User authenticates on GitHub
5. GitHub → GET /auth/github/callback?code=...&state=...
6. Backend validates state, exchanges code for GitHub token
7. Backend fetches GitHub user, upserts in DB
8. Backend issues access + refresh tokens
9. Backend sets HTTP-only cookies, redirects to /dashboard
```

### CLI Flow (PKCE)
```
1. User runs: insighta login
2. CLI generates:
   - code_verifier  (random 128-char string)
   - code_challenge (SHA256(code_verifier) base64url)
   - state          (random hex)
3. CLI → GET /auth/github/cli?state=...&code_challenge=...&redirect_uri=...
4. Backend stores state + code_challenge, returns GitHub auth URL
5. CLI opens GitHub auth URL in browser
6. CLI starts local HTTP server on port 9876
7. User authenticates on GitHub
8. GitHub → http://localhost:9876/callback?code=...&state=...
9. CLI validates returned state matches generated state
10. CLI → POST /auth/github/exchange { code, code_verifier, state }
11. Backend verifies SHA256(code_verifier) === stored code_challenge (PKCE)
12. Backend exchanges code with GitHub, upserts user
13. Backend returns { access_token, refresh_token, user } as JSON
14. CLI stores credentials at ~/.insighta/credentials.json
```

---

## Token Handling

| Token         | TTL        | Storage           | Transport        |
|---------------|------------|-------------------|------------------|
| Access token  | 3 minutes  | Memory / Cookie   | Authorization header / Cookie |
| Refresh token | 5 minutes  | MongoDB           | Cookie / JSON body |

- **Rotation**: Every refresh invalidates the old token and issues a new pair
- **Invalidation**: Logout deletes the refresh token from MongoDB immediately
- **Auto-expiry**: MongoDB TTL index auto-deletes expired refresh tokens
- **Cookie security**: `httpOnly: true`, `sameSite: lax`, `secure: true` in production

Token refresh flow:
```
Access token expired → 401 response
CLI: interceptor auto-calls POST /auth/refresh with refresh_token
Web: server-side middleware attempts refresh before rejecting request
New pair issued → retry original request
If refresh also expired → redirect to login
```

---

## Role Enforcement

### Roles
| Role     | Default | Description                          |
|----------|---------|--------------------------------------|
| analyst  | ✅ Yes  | Read-only: list, get, search         |
| admin    | ❌ No   | Full access: create, delete, export  |

### How it works
All `/api/*` routes apply middleware in this order:
```
requireApiVersion → authenticate → apiLimiter → [authorize(role)] → handler
```

The `authenticate` middleware:
1. Reads `Authorization: Bearer <token>` header (CLI) or `access_token` cookie (web)
2. Verifies JWT signature and expiry
3. Attaches `req.user = { userId, role, username }` to the request

The `authorize(...roles)` middleware:
1. Checks `req.user.role` against the allowed roles
2. Returns 403 if role is not permitted

Role-protected endpoints:
| Endpoint                        | Analyst | Admin |
|---------------------------------|---------|-------|
| GET /api/profiles               | ✅      | ✅    |
| GET /api/profiles/:id           | ✅      | ✅    |
| GET /api/profiles/search        | ✅      | ✅    |
| POST /api/profiles              | ❌      | ✅    |
| DELETE /api/profiles/:id        | ❌      | ✅    |
| GET /api/profiles/export        | ❌      | ✅    |

Inactive users (`is_active: false`) receive 403 on every request.

---

## API Reference

### Auth Endpoints

| Method | Path                   | Description                        |
|--------|------------------------|------------------------------------|
| GET    | /auth/github           | Redirect to GitHub (web)           |
| GET    | /auth/github/cli       | Get GitHub auth URL (CLI + PKCE)   |
| GET    | /auth/github/callback  | OAuth callback (web)               |
| POST   | /auth/github/exchange  | Exchange code for tokens (CLI)     |
| POST   | /auth/refresh          | Rotate refresh token               |
| POST   | /auth/logout           | Invalidate session                 |
| GET    | /auth/me               | Current user info                  |

### Profile Endpoints

All require: `X-API-Version: 1` header + valid authentication.

| Method | Path                       | Role      | Description              |
|--------|----------------------------|-----------|--------------------------|
| GET    | /api/profiles              | All       | List with filters/sort/page |
| GET    | /api/profiles/search?q=... | All       | NLP search               |
| GET    | /api/profiles/export       | Admin     | CSV export               |
| GET    | /api/profiles/:id          | All       | Single profile           |
| POST   | /api/profiles              | Admin     | Create profile           |
| DELETE | /api/profiles/:id          | Admin     | Delete profile           |

---

## Natural Language Parsing

The `/api/profiles/search` endpoint uses a **rule-based keyword parser** — no AI, no LLMs.

### How it works
1. Lowercase and tokenize the query
2. Match tokens against gender keyword sets
3. Match tokens against age group keyword sets
4. Apply "young" → `min_age=16, max_age=24` mapping
5. Apply regex patterns for age ranges (above/below/between)
6. Longest-match substring scan against 65-country name map
7. If nothing matched → return "Unable to interpret query"

### Supported keywords

**Gender:** male, males, man, men, boy, boys / female, females, woman, women, girl, girls

**Age groups:** child, children, kid / teenager, teen, youth / adult, adults / senior, elderly, elder, old

**Special:** young → ages 16–24

**Age ranges:** above/over/older than X, below/under/younger than X, between X and Y

**Countries:** All 65 dataset countries by full name + aliases (uk, usa, ivory coast, drc, etc.)

### Limitations
- No negation ("not from nigeria")
- No OR logic for multiple countries
- No typo tolerance
- No number words ("thirty year olds")
- No confidence-level queries via NLP

---

## Rate Limiting

| Scope            | Limit              |
|------------------|--------------------|
| /auth/* routes   | 10 req/min per IP  |
| /api/* routes    | 60 req/min per user|

Returns `429 Too Many Requests` when exceeded.

---

## Request Logging

Every request logs: `METHOD /path STATUS response-time [userId]`

Example:
```
GET /api/profiles 200 12ms [user-abc-123]
POST /api/profiles 201 543ms [user-abc-123]
GET /api/profiles/search 400 3ms [anonymous]
```

---

## Deployment (Vercel)

1. Push to GitHub
2. Import to Vercel
3. Set all environment variables in Vercel dashboard
4. Add `vercel.json` to project root:

```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

5. Deploy and run seed: `MONGODB_URI=... node scripts/seed.js`
