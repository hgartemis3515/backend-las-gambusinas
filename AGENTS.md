# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Las Gambusinas is a restaurant POS (Point-of-Sale) backend built with Node.js/Express, MongoDB, and Socket.io. It manages tables, waiters, menu items, orders, receipts, customers, and reporting.

### Services

| Service | Required | How to start |
|---------|----------|-------------|
| MongoDB | Yes | `sudo mongod --dbpath /data/db --logpath /var/log/mongodb/mongod.log --fork` |
| Node.js Backend | Yes | `node index.js` or `npm run dev` (see caveat below) |
| Redis | No | App gracefully degrades to in-memory cache (`REDIS_ENABLED=false`) |

### Development commands

- **Dev server**: `npm run dev` (nodemon) or `node index.js`
- **Tests**: `npm test` (Jest, 4 test suites, all mocked — no DB needed)
- **No linter configured** in the project

### Important caveats

- **Nodemon restart loop**: Running `npm run dev` causes a restart loop because the data import on startup rewrites `data/platos.json`, which nodemon detects as a change. Use `node index.js` for a stable server, or add a `nodemon.json` with `{"ignore": ["data/", "logs/"]}` to fix this if needed.
- **`.env` file required**: The app needs a `.env` with at least `DBLOCAL=mongodb://localhost:27017/lasgambusinas`. Other useful vars: `PORT=3000`, `REDIS_ENABLED=false`, `JWT_SECRET=<any-string>`, `NODE_ENV=development`.
- **Seed data auto-imports**: On startup, the app imports data from `data/*.json` files into MongoDB. This is idempotent — existing records are skipped.
- **Admin credentials**: username `admin`, password `12345678` (DNI). Created automatically on first startup via `inicializarUsuarioAdmin()`.
- **Auth endpoints**: `POST /api/admin/auth` for dashboard login, `POST /api/admin/mozos/auth` for waiter app, `POST /api/admin/cocina/auth` for kitchen app.
- **Health check**: `GET /health` returns deep health status including MongoDB, Redis, WebSocket, and system stats.
