# Deploying Tsvaga: Railway (backend) + Vercel (frontend)

> Want to test everything on your own machine first? See `LOCAL_DEV.md` for a one-command Docker Compose setup (Postgres+PostGIS included, no manual install needed). Recommended before your first production deploy.

**Why split like this:** the backend needs to hold persistent WebSocket connections (Socket.io) and talk to a real Postgres database — Railway is built for that. Vercel is built for fast static/edge hosting, which is exactly what the React frontend is — but it can't run a long-lived Node/Socket.io server. So: **backend → Railway, frontend → Vercel.**

I can't log into your accounts and click the buttons for you (no credentials, no browser access from here), but every step below is copy-pasteable. Budget about 20-30 minutes for the first deploy.

---

## 0. Before you start

- A GitHub account, with `backend/` and `frontend/` (from the zips I gave you) pushed to a repo — one repo with both folders is fine, both Railway and Vercel let you pick a subfolder as the "root directory" for each service.
- A free [Railway](https://railway.com) account.
- A free [Vercel](https://vercel.com) account.
- Node.js installed locally (only needed to run one command to generate VAPID keys — see step 2.4).

```bash
# from wherever you unzipped both folders
git init
git add .
git commit -m "Initial Tsvaga commit"
git branch -M main
git remote add origin https://github.com/<you>/tsvaga.git
git push -u origin main
```

---

## 1. Deploy the database (PostgreSQL + PostGIS) on Railway

Railway's *default* Postgres template does **not** include the PostGIS extension — you need one of their marketplace templates that bakes it in.

1. Go to [railway.com/deploy/postgis-spatial-database](https://railway.com/deploy/postgis-spatial-database) (the "Deploy PostGIS" template).
2. Click **Deploy Now** → sign in → choose/create a project (e.g. "tsvaga").
3. Wait for it to finish provisioning (a minute or two).
4. Open the new Postgres service → **Variables** tab → copy the `DATABASE_URL` value (or `DATABASE_PUBLIC_URL` if you need to connect from outside Railway). You'll wire this into the backend service next.

If you'd rather use Railway's standard Postgres plugin instead, that also works — just deploy the **"Postgres17 + Extensions"** template from the Railway marketplace instead, then after it's up, open its **Query** tab and run `CREATE EXTENSION IF NOT EXISTS postgis;` once before continuing.

---

## 2. Deploy the backend on Railway

1. In the same Railway project, click **+ New → GitHub Repo**, pick your `tsvaga` repo.
2. Once it's added, open the new service → **Settings → Root Directory** → set it to `backend`. Railway will detect it's a Node app automatically (it reads `package.json`; `railway.json` in the folder pins the start command to `npm start`).
3. Go to the **Variables** tab and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Click "Add Reference" → select the Postgres service → `DATABASE_URL` (keeps it wired automatically if the DB URL ever changes) |
   | `JWT_SECRET` | Any long random string — generate one with `openssl rand -hex 32` locally |
   | `JWT_EXPIRES_IN` | `7d` |
   | `CORS_ORIGINS` | leave as `*` for now — you'll tighten this in step 4 once you have your Vercel URL |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CONTACT_EMAIL` | see step 2.4 below |

   `PORT` is set automatically by Railway — don't override it.

4. **Generate VAPID keys** (needed for vendor push notifications) — run this on your own machine once:
   ```bash
   cd backend
   npm install
   npm run generate:vapid
   ```
   Copy the two printed keys into the Railway variables above.

5. Click **Deploy** (or it may auto-deploy after you add the repo). Once it's live, go to **Settings → Networking → Generate Domain** to get a public URL like `https://tsvaga-backend-production.up.railway.app`. Note it down — the frontend needs it.

6. **Initialize the database** (creates tables + seeds sample Zimbabwe vendors). Easiest way: install the [Railway CLI](https://docs.railway.com/guides/cli) locally, then:
   ```bash
   railway login
   railway link          # pick your tsvaga project
   railway run --service backend npm run db:setup
   ```
   This runs the command *with Railway's production environment variables injected*, against your real production database.

7. **Create your admin account** the same way:
   ```bash
   railway run --service backend npm run create:admin -- "Your Name" "+263771234567" "a-strong-password"
   ```

8. Sanity check: visit `https://<your-backend-domain>/health` in a browser — you should see `{"status":"ok","service":"tsvaga-backend"}`.

---

## 3. Deploy the frontend on Vercel

1. Go to [vercel.com/new](https://vercel.com/new), import the same GitHub repo.
2. When configuring the project: **Root Directory** → `frontend`. Vercel should auto-detect Vite (the `vercel.json` in that folder also pins `npm run build` → `dist`).
3. Add environment variables (**Settings → Environment Variables**, or during initial setup):

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE` | `https://<your-railway-backend-domain>/api` |
   | `VITE_SOCKET_BASE` | `https://<your-railway-backend-domain>` (no `/api`) |

4. Click **Deploy**. Once done you'll get a URL like `https://tsvaga.vercel.app`, serving:
   - `/index.html` — the requester app
   - `/vendor.html` — the vendor dashboard
   - `/admin.html` — the admin panel

---

## 4. Connect them: lock down CORS

Back in Railway, open the backend service → **Variables** → set:

```
CORS_ORIGINS=https://tsvaga.vercel.app
```

(comma-separate multiple origins if you also want to allow a custom domain or Vercel preview URLs). Redeploy the backend for it to take effect (Railway usually redeploys automatically when a variable changes).

---

## 5. Test it end-to-end

1. Open `https://tsvaga.vercel.app/vendor.html` → register a vendor → its default subscription is `inactive`.
2. Open `https://tsvaga.vercel.app/admin.html` → sign in with the admin account from step 2.7 → find that vendor in the list → click **Activate** (or **Waive**) so you can test the full flow without setting up real EcoCash payments yet.
3. Open `https://tsvaga.vercel.app/` (requester) → drop a pin near one of the seeded Zimbabwe vendor locations (Harare/Bulawayo/Mutare/Gweru — see `backend/src/db/seed.sql`) → submit a request.
4. Flip back to the vendor tab → you should see the request come in live and be able to respond with an offer.

If step 3/4 doesn't show anything, double check `VITE_API_BASE`/`VITE_SOCKET_BASE` on Vercel and `CORS_ORIGINS` on Railway both point at the right domains, and that you ran `db:setup` in step 2.6 (otherwise there are no seeded vendors to match against).

---

## 6. Custom domains (optional)

Both platforms support custom domains for free:
- **Railway:** Service → Settings → Networking → Custom Domain → add a CNAME at your DNS provider.
- **Vercel:** Project → Settings → Domains → add your domain → follow the DNS instructions shown.

If you add a custom domain to the frontend, remember to update `CORS_ORIGINS` on the backend to match.

---

## 7. Ongoing deploys

Both platforms auto-deploy on every `git push` to your connected branch by default — no extra steps needed after this initial setup.

One honest caveat: `npm run db:setup` (step 2.6) is meant to run **once, against a fresh/empty database** — `schema.sql` uses plain `CREATE TABLE`/`CREATE TYPE` (not `IF NOT EXISTS` for types), so running it a second time against a database that already has these tables will error out rather than update anything. If you need to change the schema later, add a proper migration tool (e.g. `node-pg-migrate` or Prisma Migrate) rather than re-running `db:setup` — that's a reasonable next step once you're past the initial deploy, not something to build out before you've shipped anything.
