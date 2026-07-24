# Local development with Docker Compose

This spins up the whole stack — Postgres+PostGIS, the backend, and the frontend — on your machine with one command, no manual Postgres/PostGIS install needed. This is for **local development only**; see `DEPLOYMENT.md` for Railway/Vercel production deploys.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (bundled with Docker Desktop).
- `docker-compose.yml` sits at the same level as your extracted `backend/` and `frontend/` folders:
  ```
  tsvaga/
  ├── docker-compose.yml
  ├── backend/
  └── frontend/
  ```

## First-time setup

```bash
docker compose up
```

This builds the backend image, pulls the official `postgis/postgis` image, and starts the Vite dev server — leave it running in this terminal. Wait until you see the backend log `Tsvaga backend listening on port 4000`.

In a **second terminal**, initialize the database (only needed once):

```bash
docker compose exec backend npm run db:setup
```

Then create your first admin/super-user account:

```bash
docker compose exec backend npm run create:admin -- "Your Name" "+263771234567" "a-strong-password"
```

## Using it

- **Requester app:** http://localhost:5173
- **Vendor dashboard:** http://localhost:5173/vendor.html
- **Admin panel:** http://localhost:5173/admin.html
- **Backend health check:** http://localhost:4000/health

Both the backend (via `nodemon`) and frontend (via Vite) auto-reload on file changes, since your local folders are mounted straight into the containers.

## Push notifications locally

Web Push needs VAPID keys. To test it locally:

```bash
docker compose exec backend npm run generate:vapid
```

Copy the printed `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` into the `backend` service's `environment:` block in `docker-compose.yml`, then:

```bash
docker compose up -d --build backend
```

Note: some browsers require HTTPS for the Push API, but both Chrome and Firefox treat `localhost` as a secure context, so this should work without extra TLS setup.

## Resetting everything

```bash
docker compose down -v   # -v also deletes the Postgres data volume
docker compose up
docker compose exec backend npm run db:setup
```

## Stopping

```bash
docker compose down
```
(Add `-v` if you also want to wipe the database.)
