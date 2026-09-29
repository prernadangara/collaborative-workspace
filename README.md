# Collaborative Workspace

A multi-tenant, real-time collaborative workspace built with React, TypeScript, Node.js, Express, PostgreSQL, Prisma, Redis, and Socket.IO.

The application provides workspace-based isolation, server-side role-based access control, persistent task ordering, real-time collaboration, activity logging, Redis caching, and background job processing.

## Live Demo

| Service | URL |
|---|---|
| Frontend | https://collaborative-workspace-ashen.vercel.app |
| Backend API | https://collaborative-workspace-o1sg.onrender.com |
| Health Check | https://collaborative-workspace-o1sg.onrender.com/health |

[![CI](https://github.com/prernadangara/collaborative-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/prernadangara/collaborative-workspace/actions/workflows/ci.yml)

## Demo Accounts

Both accounts belong to the same `Demo Workspace`.

| Role | Email | Password |
|---|---|---|
| Owner | `owner@example.com` | `Owner@123` |
| Member | `member@example.com` | `Member@123` |

> These accounts are created by `npm run seed`.

---

## Features

### Authentication

- Email/password authentication
- Password hashing with bcrypt
- Short-lived JWT access tokens
- Refresh-token rotation
- Hashed refresh tokens stored in PostgreSQL
- Refresh-token reuse detection
- Logout and token revocation
- Secure httpOnly refresh-token cookie in production

### Multi-Tenancy & RBAC

- Multiple isolated workspaces
- Owner, Admin, Member, and Viewer roles
- Server-side permission enforcement
- Workspace membership checked on protected routes
- Queries scoped to the caller's workspace
- Cross-workspace IDOR protection

### Boards, Lists & Tasks

- Boards contain ordered lists
- Lists contain ordered tasks
- Task creation, editing, deletion and movement
- Task assignment
- Status filtering
- Label filtering
- Search with pagination
- Persistent task ordering
- Optimistic locking for concurrent edits

### Real-Time Collaboration

Socket.IO is used to synchronize connected clients.

Supported events include:

- Task created
- Task updated
- Task moved
- Task deleted
- Task assigned
- List created

Database mutations are committed first and socket events are emitted afterwards, keeping PostgreSQL as the source of truth.

### Activity Logging

Meaningful workspace mutations are recorded with:

- Actor
- Action
- Entity
- Entity ID
- Workspace
- Timestamp
- Metadata

### Redis Caching

Redis is used to cache expensive workspace reads.

Cached paths include:

- Board tree
- Workspace summary

Cache entries are invalidated when relevant board/list/task mutations occur.

Redis is treated as an optimization rather than a hard dependency. If Redis is temporarily unavailable, database-backed operations continue to work.

### Background Jobs

BullMQ is backed by Redis.

Current jobs include:

- Invite email processing
- Daily workspace digest

The mailer currently logs email content instead of delivering through an external SMTP provider.

---

## Architecture

```text
                    ┌──────────────────────┐
                    │   React + Vite SPA   │
                    │   TypeScript         │
                    └──────────┬───────────┘
                               │
                    REST + Socket.IO
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Express + Socket.IO │
                    │      Backend         │
                    └──────┬───────┬───────┘
                           │       │
                 ┌─────────┘       └─────────┐
                 ▼                           ▼
        ┌─────────────────┐          ┌──────────────┐
        │   PostgreSQL    │          │    Redis     │
        │   Prisma ORM    │          │ Cache + Queue│
        └─────────────────┘          └──────┬───────┘
                                            │
                                            ▼
                                     ┌──────────────┐
                                     │    BullMQ    │
                                     │    Worker    │
                                     └──────────────┘
```

The deployed backend currently runs the REST API, Socket.IO server, and BullMQ worker in the same Render service.

This keeps deployment simple while allowing the worker to be separated into its own service later if independent scaling becomes necessary.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| Real-time | Socket.IO |
| Cache | Redis |
| Background Jobs | BullMQ |
| Authentication | JWT + bcrypt |
| Testing | Vitest + Supertest |
| Containerization | Docker + Docker Compose |
| CI | GitHub Actions |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Database Hosting | Neon PostgreSQL |
| Redis Hosting | Render Key Value |

## Data Model

```text
User
 │
 ├── Membership ─── Workspace
 │                       │
 │                       ├── Board
 │                       │    └── List
 │                       │         └── Task
 │                       │
 │                       ├── Label
 │                       ├── Invite
 │                       └── ActivityLog
 │
 └── RefreshToken

Task
 ├── assignee → User
 └── TaskLabel → Label
```

Important design decisions:

- Workspace membership is represented by a dedicated `Membership` table.
- Workspace ownership and roles are represented through membership roles.
- Workspace-related records are scoped to their workspace.
- Tasks maintain a `version` field for optimistic concurrency control.
- Tasks and lists maintain ordering positions.
- Activity logs are associated with a workspace and actor.
- Prisma migrations are version-controlled under `backend/prisma/migrations`.

---

## Multi-Tenancy & Authorization

Authorization is enforced on the server rather than relying on frontend visibility.

Protected requests pass through the following checks:

```text
Request
  │
  ▼
requireAuth
  │
  ├── Verify JWT
  │
  ▼
requireWorkspaceMember
  │
  ├── Find membership for requested workspace
  ├── Reject non-members
  └── Attach role to request
  │
  ▼
requireRole
  │
  └── Check permitted operation
  │
  ▼
Service Layer
  │
  └── Scope database queries to workspace
```

This prevents a user who belongs to Workspace A from accessing Workspace B's resources by changing an ID in the request.

The permission rules are centralized in a pure, unit-tested permissions module.

### Role Overview

| Capability | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| Read workspace data | ✓ | ✓ | ✓ | ✓ |
| Create/edit/move/delete tasks | ✓ | ✓ | ✓ | — |
| Create/edit/move/delete lists | ✓ | ✓ | ✓ | — |
| Create/manage boards | ✓ | ✓ | Limited | — |
| Invite members | ✓ | ✓ | — | — |
| Change roles | ✓ | Limited | — | — |
| Grant Admin role | ✓ | — | — | — |

All important permission checks are enforced through API middleware and the service layer.

---

## Authentication

### Access Token

- JWT
- 15-minute lifetime
- Sent using the `Authorization: Bearer <token>` header
- Used for authenticated API and Socket.IO requests

### Refresh Token

- Longer-lived session token
- Stored in an httpOnly cookie
- Secure cookie settings are enabled in production
- Only a SHA-256 hash is persisted in PostgreSQL
- Rotated whenever `/auth/refresh` is used

### Refresh Token Reuse

When an already-rotated refresh token is presented again, the user's refresh tokens are revoked. This treats reuse as a potential token-theft signal.

### Logout

Logout revokes the refresh token and clears the cookie.

Access tokens are intentionally stateless and can remain valid until their short lifetime expires.

---

## Real-Time Design

Socket.IO is used for board-level rooms.

```text
Client
  │
  │ connect with JWT
  ▼
Socket.IO Server
  │
  │ verify authentication
  │
  │ verify workspace membership
  │
  ▼
board:<boardId>
```

For mutations:

```text
REST request
     │
     ▼
Validate + authorize
     │
     ▼
PostgreSQL transaction
     │
     ▼
Commit
     │
     ▼
Emit Socket.IO event
     │
     ▼
Connected clients update
```

The database remains the source of truth.

Clients receive the resulting server state rather than treating socket events as an independent data store.

---

## Concurrency & Ordering

### Optimistic Locking

Tasks contain a `version` field.

An update requires the version that the client last received:

```sql
UPDATE task
SET ...
WHERE id = ?
  AND version = ?
```

If the version no longer matches, the API returns `409 Conflict`.

This prevents an outdated client from silently overwriting a newer change.

### Task Ordering

Task creation and movement are performed inside database transactions.

Affected list rows are locked before positions are recalculated. Concurrent create/move operations are covered by integration tests to ensure that task positions remain unique and consistent.

---

## Redis Caching

Two read paths use Redis caching:

### Board Tree

```text
GET /workspaces/:workspaceId/boards/:boardId
```

TTL: 60 seconds.

### Workspace Summary

```text
GET /workspaces/:workspaceId/summary
```

TTL: 300 seconds.

The summary aggregates workspace data using multiple database queries.

Relevant task/list mutations invalidate the affected cache entries.

Redis failures are handled gracefully. Cache failures do not turn otherwise successful database operations into server errors.

---

## Background Processing

BullMQ uses Redis as its queue backend.

### Invite Email

When an invitation is created:

```text
API request
    │
    ▼
Create invitation
    │
    ▼
Queue invite-email job
    │
    ▼
BullMQ worker
    │
    ▼
Mailer
```

The current mailer logs the email instead of connecting to an external email provider.

If Redis is unavailable, the application falls back to sending the mail operation inline rather than blocking the request indefinitely.

### Daily Digest

A repeatable BullMQ job generates a daily workspace activity digest.

---

## Search & Filtering

Tasks can be searched and filtered by:

- Title/description text
- Status
- Assignee
- Label

Results are paginated, with a maximum page size enforced by the API.

The current implementation uses case-insensitive substring matching rather than PostgreSQL full-text search.

For significantly larger datasets, PostgreSQL `tsvector` + GIN indexing or `pg_trgm` would be the next optimization.

---

## Project Structure

```text
collaborative-workspace/
│
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   │
│   └── src/
│       ├── controllers/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       ├── socket.ts
│       ├── workers/
│       ├── queues/
│       ├── lib/
│       ├── utils/
│       ├── tests/
│       └── server.ts
│
├── frontend/
│   └── src/
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── docker-compose.yml
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker
- Docker Compose
- Git

### Option 1: Run Infrastructure with Docker

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

#### Backend

```bash
cd backend
npm ci
cp .env.example .env
npx prisma migrate deploy
npm run seed
npm run dev
```

Backend: http://localhost:5000

Health check: http://localhost:5000/health

#### Frontend

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Frontend: http://localhost:5173

### Option 2: Docker Compose

The repository includes Docker Compose configuration for the local PostgreSQL, Redis, backend, and frontend environment.

```bash
docker compose up --build
```

The frontend is available at http://localhost:5173

The backend is available at http://localhost:5000

---

## Environment Variables

### Backend

Create `backend/.env` from `backend/.env.example`.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | Secret used to sign access tokens |
| `JWT_REFRESH_SECRET` | Secret used to sign refresh tokens |
| `CLIENT_URL` | Frontend origin allowed by CORS |
| `PORT` | Backend port |
| `COOKIE_SECURE` | Enables Secure cookies in production |
| `COOKIE_SAMESITE` | Cookie SameSite policy |

### Frontend

Create `frontend/.env` from `frontend/.env.example`.

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API URL including `/api` |
| `VITE_SOCKET_URL` | Backend origin used by Socket.IO |

> Never commit real secrets or `.env` files.

---

## Testing

The backend contains both unit and integration tests.

Run the backend test suite:

```bash
cd backend
npm test
```

Current suite: **35 tests**

Coverage includes:

- Permission rules
- Authentication
- Refresh-token rotation
- Logout/revocation
- Workspace isolation
- IDOR protection
- RBAC
- Task CRUD
- Validation
- Task assignment
- Ordering
- Concurrent task creation
- Concurrent task movement
- Search and filtering
- Pagination
- Label isolation
- Activity logging
- Redis summary caching
- Cache invalidation
- Invitation authorization

Tests use a dedicated test database rather than the development/production database.

---

## CI

GitHub Actions runs automatically on pushes and pull requests.

The backend CI pipeline:

```text
Install dependencies
       │
       ▼
Generate Prisma client
       │
       ▼
Type-check
       │
       ▼
Apply migrations
       │
       ▼
Run tests
       │
       ▼
Build backend
```

The frontend pipeline runs:

```text
Install dependencies
       │
       ▼
Lint
       │
       ▼
Build
```

Current CI status:

[![CI](https://github.com/prernadangara/collaborative-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/prernadangara/collaborative-workspace/actions/workflows/ci.yml)

---

## Deployment

### Frontend — Vercel

The frontend is deployed from the `frontend` directory.

Production environment variables:

```env
VITE_API_URL=https://collaborative-workspace-o1sg.onrender.com/api
VITE_SOCKET_URL=https://collaborative-workspace-o1sg.onrender.com
```

### Backend — Render

The backend is deployed from the `backend` directory using Docker.

The production service runs:

- REST API
- Socket.IO server
- BullMQ worker

Important production variables include:

```env
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
CLIENT_URL=
COOKIE_SECURE=true
COOKIE_SAMESITE=none
NODE_ENV=production
```

Database migrations are applied when the production backend starts.

### Production Verification

The deployed application has been verified for:

- Authentication
- Workspace loading
- Task creation
- Task movement
- Search
- Status filtering
- Cross-client Socket.IO updates
- Member RBAC restrictions

Health endpoint: https://collaborative-workspace-o1sg.onrender.com/health

---

## Security Considerations

The application includes:

- bcrypt password hashing
- Short-lived access tokens
- Refresh-token rotation
- Refresh-token hashing in the database
- Refresh-token reuse detection
- httpOnly refresh-token cookies
- Server-side RBAC
- Workspace-scoped database queries
- Cross-workspace IDOR protection
- Request validation
- Consistent API error responses
- Helmet security headers
- CORS configuration
- Payload size limits

The access token is currently stored client-side, which means an XSS vulnerability could expose it. The refresh token remains protected by the httpOnly cookie.

---

## Known Limitations & Trade-offs

This project was built under a fixed take-home timeline, so several areas are deliberately documented rather than hidden.

### Search

Current search uses case-insensitive substring matching.

For a larger dataset, PostgreSQL full-text search or trigram indexes would be more appropriate.

### Ordering

Task ordering uses integer positions and transactional position updates.

This is straightforward and reliable for the current scale, but fractional indexing or LexoRank would reduce the number of rows rewritten during large boards.

### Real-Time Scaling

The API, Socket.IO server, and worker currently run in one backend process.

Horizontal Socket.IO scaling would require the Socket.IO Redis adapter and separate worker deployment.

### Email

Invite emails are currently logged rather than delivered through a production SMTP provider.

The invite token is also exposed through the API so the invitation flow can be demonstrated without requiring an email provider.

### Authentication

There is currently no rate limiting or account lockout mechanism on authentication endpoints.

### UI Scope

The frontend focuses on the core collaborative workspace experience. Workspace/board/list creation and some administration operations can be performed through the API rather than dedicated UI screens.

### Conflict Resolution

Optimistic locking detects stale task edits and returns `409 Conflict`, but there is no field-level merge interface.

---

## Future Improvements

With additional development time, I would:

- Add PostgreSQL full-text search with `tsvector`/GIN indexes.
- Introduce LexoRank or fractional indexing for large boards.
- Split the BullMQ worker into an independently scalable service.
- Add the Socket.IO Redis adapter for horizontal scaling.
- Add authentication rate limiting and account lockout.
- Add Playwright end-to-end tests using multiple browser contexts.
- Add richer workspace/board/list management UI.
- Add presence indicators.
- Add field-level conflict resolution.
- Integrate a real transactional email provider.

---

## License

This project was created as a technical take-home assignment.