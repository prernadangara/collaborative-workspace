# Collaborative Workspace

A multi-tenant, real-time collaborative workspace (boards → lists → tasks) with
role-based access control. Built for the Full-Stack Developer take-home.

![CI](https://github.com/<your-user>/<your-repo>/actions/workflows/ci.yml/badge.svg)

| | URL |
|---|---|
| Frontend (Vercel) | `<add after deploy>` |
| Backend API + WebSocket (Render) | `<add after deploy>` — health check: `/health` |

**Demo accounts** (same workspace, "Demo Workspace"; password for all: `Password123!`)

| Role | Email |
|---|---|
| Owner | `owner@demo.test` |
| Admin | `admin@demo.test` |
| Member | `member@demo.test` |
| Viewer | `viewer@demo.test` |

Created by `npm run seed` (idempotent). Run it once against the production DB.

---

## Stack

TypeScript everywhere · React (Vite) · Node.js + Express 5 · Socket.IO ·
PostgreSQL + Prisma 7 · Redis (cache + BullMQ) · Docker · GitHub Actions.

## Architecture

```
 Browser (React, Vite, dnd-kit)
    │  REST (axios, Bearer access token; refresh token in httpOnly cookie)
    │  WebSocket (Socket.IO, JWT in handshake)
    ▼
 Express API  ──────────────►  PostgreSQL   (source of truth, Prisma)
 Socket.IO server ──────────►  Redis        (response cache)
 BullMQ worker (same process) ► Redis        (job queue)
```

One backend process hosts the REST API, the Socket.IO server and the BullMQ
worker, to keep deployment to a single Render service. The worker is started
by `startWorker()` and can be split into its own entrypoint to scale
independently.

### Data model

```
User ──< Membership >── Workspace ──< Board ──< List ──< Task >──< TaskLabel >── Label
              │  role                    │                │  assigneeId → User      │
              │                          └── ActivityLog  └── position, version     └── workspaceId
User ──< RefreshToken        Workspace ──< Invite
```

- **Tenancy**: every board, label, invite and activity row hangs off a
  `Workspace`. Lists and tasks reach it through `Board`. There is no query that
  reads a task/list without also constraining on the workspace (see below).
- **Membership** is the join table carrying the `Role` (`OWNER | ADMIN | MEMBER | VIEWER`).
- **Task.position / List.position** are ordering keys; **Task.version** is an
  optimistic-lock counter.
- **ActivityLog** is append-only, indexed on `(workspaceId, createdAt)`.
- Migrations are versioned in `backend/prisma/migrations`.

## Authentication & token strategy

- Passwords hashed with **bcrypt (cost 12)**.
- **Access token**: JWT, 15 minutes, sent as `Authorization: Bearer`, held in
  memory/`localStorage` by the SPA.
- **Refresh token**: JWT, 7 days, stored in an **httpOnly, Secure (in prod),
  path-scoped cookie** (`/api/auth/*`) so JavaScript can never read it.
  Only its **SHA-256 hash** is stored in the database.
- **Rotation**: every `/auth/refresh` revokes the presented token and issues a
  new one in a single transaction; the revoke is conditional
  (`WHERE revokedAt IS NULL`) so two concurrent refreshes can't both succeed.
- **Reuse detection**: presenting an already-rotated token revokes **all** of
  that user's refresh tokens (assumes theft).
- **Revocation**: `/auth/logout` revokes the token and clears the cookie.
  Access tokens are stateless, so a revoked session's access token stays valid
  until it expires (≤15 min) — a deliberate trade-off.
- The socket handshake uses the access token; on expiry the client refreshes
  via the cookie and reconnects.

**Known trade-off:** the access token is in `localStorage`, so an XSS bug could
read it (React escapes output and there is no `dangerouslySetInnerHTML`, but the
risk exists). The high-value credential — the refresh token — is not readable
by scripts.

## Authorization (RBAC)

Enforced **server-side** in middleware, never only in the UI:

1. `requireAuth` — verifies the access token.
2. `requireWorkspaceMember` — loads the caller's `Membership` for
   `:workspaceId` (403 if none) and attaches `req.role`.
3. `requireRole(...)` — per-route allow-list.
4. **Service layer** — every lookup is scoped by workspace
   (`where: { id, list: { board: { workspaceId } } }`), so a valid member of
   workspace B can't reach workspace A's task by ID (returns 404, tested).

| Capability | Owner | Admin | Member | Viewer |
|---|:-:|:-:|:-:|:-:|
| Read boards, tasks, activity, members | ✅ | ✅ | ✅ | ✅ |
| Create/edit/move/delete tasks, lists, boards, labels | ✅ | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ (Member/Viewer only) | ❌ | ❌ |
| Change role / remove members | ✅ (anyone but self) | ✅ (Member/Viewer only) | ❌ | ❌ |
| Grant ADMIN | ✅ | ❌ | ❌ | ❌ |
| Touch the Owner | ❌ | ❌ | ❌ | ❌ |

The hierarchy rules live in one pure, unit-tested module
(`src/utils/permissions.ts`). Removing a member also unassigns their tasks and
evicts their live sockets from the workspace's board rooms.

## Real-time (WebSocket) flow

1. Client connects to Socket.IO with `auth: { token }` — the server verifies the JWT.
2. Client emits `join-board { workspaceId, boardId }`; the server checks
   membership **and** that the board belongs to that workspace before
   `socket.join("board:<id>")`.
3. Every mutation (create / update / move / delete / assign, list create) is
   committed to Postgres, **then** broadcast to the room with
   `emitBoardEvent(boardId, event, payload)`. Events: `task-created`,
   `task-updated`, `task-moved`, `task-deleted`, `task-assigned`, `list-created`.
4. Clients update local state from the event — no polling. Measured locally at
   ~20 ms from HTTP write to another client's event.
5. Removing a member calls `evictUserFromWorkspace`, so they stop receiving
   events immediately.

### Concurrency

- **Edits**: `PATCH /tasks/:id` requires the `version` the client last saw;
  the update is `WHERE id = ? AND version = ?`. A stale write gets **409**.
- **Ordering**: creating and moving tasks runs in a transaction that takes a
  row lock on the affected list(s) (`SELECT … FOR UPDATE`, locks acquired in
  sorted ID order to avoid deadlocks), re-reads the task under the lock, then
  shifts positions. Tests fire concurrent creates/moves and assert positions
  stay unique; removing the lock makes those tests fail.

## Caching (Redis)

- `GET /workspaces/:id/boards/:boardId` — the full board tree, TTL 60 s.
- `GET /workspaces/:id/summary` — dashboard aggregates (several `COUNT`/`GROUP BY`
  queries), TTL 300 s. The response includes `cached: true|false`.
- **Invalidation**: every task/list mutation deletes both keys for that
  workspace/board (`cache.ts`). The TTL is a safety net, not the mechanism.
- **Failure mode**: Redis is an optimisation, not a dependency. Cache helpers
  swallow errors, so a Redis outage means slower reads, not 500s.
  `/health` reports `degraded` instead of failing.

## Background jobs (BullMQ)

Queue `background-jobs`, 3 attempts with exponential backoff:

- **`invite-email`** — enqueued when an invite is created; the worker sends the
  email (via `lib/mailer.ts`, which logs unless you plug in an SMTP provider),
  so the HTTP request doesn't wait on delivery. If Redis is unavailable, the
  enqueue times out after 1.5 s and the email is sent inline instead of hanging.
- **`daily-digest`** — repeatable job (08:00 daily) that summarises the last 24 h
  per workspace to each owner.

Why these two: email is the canonical slow, failure-prone side-effect that
shouldn't block a request, and the digest exercises scheduled work.

## Other behaviour worth knowing

- **Search**: case-insensitive substring match on title/description, plus
  `status`, `assigneeId`, `labelId` filters, paginated (`page`, `limit ≤ 50`).
- **Activity log**: task created/updated/moved/assigned/deleted, role changed,
  member removed, invite created/accepted, workspace created.
- **Errors**: consistent JSON `{ message }`; unknown routes 404; a final error
  handler and `unhandledRejection` hook prevent stack traces reaching clients.

---

## Local setup

### Option A — everything in Docker

```bash
git clone <repo> && cd <repo>
docker compose up --build
```

- Frontend: <http://localhost:5173> · API: <http://localhost:5000> · health: <http://localhost:5000/health>
- Migrations run automatically on backend start.
- Seed the demo accounts from your host against the compose Postgres (the slim
  production image omits `tsx`, which the seed script needs):
  ```bash
  cd backend && npm ci
  DATABASE_URL=postgresql://workspace_user:workspace_password@localhost:5432/collaborative_workspace npm run seed
  ```

### Option B — infra in Docker, apps on the host (best for development)

```bash
docker compose up -d postgres redis

cd backend
cp .env.example .env            # then edit secrets
npm ci
npx prisma migrate deploy
npm run seed
npm run dev                     # http://localhost:5000

cd ../frontend
cp .env.example .env
npm ci
npm run dev                     # http://localhost:5173
```

## Environment variables

**Backend** (`backend/.env`)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string (`rediss://…` for TLS providers such as Upstash) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Long random strings, **different from each other** |
| `CLIENT_URL` | Exact frontend origin, for CORS + Socket.IO CORS (no trailing slash) |
| `PORT` | Set by Render automatically; defaults to 5000 |
| `COOKIE_SECURE` | `true` in production |
| `COOKIE_SAMESITE` | `lax` (same site) or `none` (Vercel → Render, requires Secure) |

**Frontend** (`frontend/.env`, baked in at build time)

| Var | Purpose |
|---|---|
| `VITE_API_URL` | Backend URL **including `/api`**, e.g. `https://xyz.onrender.com/api` |
| `VITE_SOCKET_URL` | Backend origin, e.g. `https://xyz.onrender.com` |

## Testing

```bash
docker compose up -d postgres redis
cd backend
cp .env.example .env
npm ci && npx prisma migrate deploy
npm test        # 35 tests: unit (permissions) + integration (auth, isolation, RBAC, tasks, ordering, search, activity, cache)
npm run lint    # type-check
cd ../frontend && npm run lint && npm run build
```

Integration tests create their own users/workspaces through the real API (no
seed data required) against a real Postgres and Redis. CI (`.github/workflows/ci.yml`)
runs the same steps with Postgres and Redis service containers on every push.

## Deployment

### 1. Databases
- **Postgres**: Render managed Postgres, or Neon. Copy the connection string
  (use the *external* URL if the API is a separate service; add `?sslmode=require` if needed).
- **Redis**: Render Key Value or Upstash. Copy the `rediss://` URL.

### 2. Backend → Render (Web Service)
- Root directory: `backend` · Runtime: Node
- Build command: `npm ci --include=dev && npm run build` (TypeScript and `tsx` are dev dependencies; `--include=dev` keeps the build working even when `NODE_ENV=production` is set)
- Start command: `npm run start:prod` (runs `prisma migrate deploy`, then the server)
- Health check path: `/health`
- Environment: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `CLIENT_URL=https://<your-app>.vercel.app`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`,
  `NODE_ENV=production`
- Seed once via the Render shell: `npm run seed` (needs dev deps; or run it locally with the production `DATABASE_URL`).

### 3. Frontend → Vercel
- Root directory: `frontend` · Framework: Vite
- Environment: `VITE_API_URL=https://<render-app>.onrender.com/api`,
  `VITE_SOCKET_URL=https://<render-app>.onrender.com`
- **Redeploy after changing env vars** (Vite inlines them at build time).
- Then update Render's `CLIENT_URL` to the final Vercel URL.

### 4. Verify
1. `GET <render>/health` → `{"status":"ok"}`.
2. Log in on the Vercel URL; DevTools → Application → Cookies shows an httpOnly
   `refreshToken` on the Render domain; Network shows the WebSocket upgrade (101).
3. Open two browsers as two different users; edit a task in one, see it in the other.
4. Wait >15 min (or shorten the token TTL) and confirm requests transparently refresh.

Render's free tier sleeps after inactivity; the first request can take ~30–60 s.

---

## Trade-offs made & known limitations

- **Cross-site cookies**: Vercel and Render are different sites, so the refresh
  cookie is `SameSite=None`. Browsers that block third-party cookies (Safari
  ITP, Chrome Incognito) will fail to refresh and users will re-login every
  15 minutes. The proper fix is a shared parent domain (e.g. `app.example.com`
  and `api.example.com`) with `SameSite=Lax`.
- **Access token in localStorage** (see above).
- **Search** is `ILIKE`, fine for thousands of tasks; for more, add a
  `tsvector` column + GIN index (or `pg_trgm`).
- **Integer positions** shifted in a transaction: correct and simple, but every
  move rewrites neighbouring rows. Fractional indexing / LexoRank would scale
  better.
- **Optimistic-lock conflicts** on edit return 409; there is no field-level merge UI.
- **Single process** runs API + sockets + worker. Horizontal scaling of Socket.IO
  needs the Redis adapter (`@socket.io/redis-adapter`).
- **Email** is logged, not delivered; the invite token is also returned in the
  API response so invites can be accepted without an inbox.
- **No rate limiting** on auth endpoints, and no password-strength rules
  beyond length ≥ 8.
- **Frontend** is a single large component with minimal styling; there is no
  in-app UI for registration or for creating workspaces/boards/lists (use the
  API or the seeded data).
- Dockerfiles and `docker-compose.yml` were written carefully but **not
  executed in the authoring environment** — run `docker compose up --build` once
  before submitting.

## What I'd do next

Split the worker into its own service, add the Socket.IO Redis adapter,
presence indicators, rate limiting (per IP + per account) with lockout,
tsvector search, list/board rename/reorder/delete endpoints, e2e tests with
Playwright (two browser contexts), a proper UI for workspace/board/list
management, and refresh-token binding to device/IP metadata.
