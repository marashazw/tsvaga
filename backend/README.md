# Tsvaga Backend

Node.js/Express API with PostgreSQL+PostGIS for geospatial vendor matching and Socket.io for real-time alerts/offers.

## Setup

1. **Install PostgreSQL with PostGIS** (locally or use a managed provider like Supabase/Neon/Railway that supports the `postgis` extension).
2. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```
3. **Configure environment:**
   ```bash
   cp .env.example .env
   # edit .env with your real DATABASE_URL, REDIS_URL, and a strong JWT_SECRET
   ```
4. **Create the database schema + seed sample Zimbabwe vendor data:**
   ```bash
   npm run db:setup
   ```
   This creates all tables (with PostGIS geography columns) and seeds six real vendor locations across Harare (Mbare, Avondale, Borrowdale), Bulawayo, Mutare, and Gweru, plus a small product catalog.
5. **Run the server:**
   ```bash
   npm run dev   # with auto-reload
   # or
   npm start
   ```
   Server starts on `http://localhost:4000` by default.

## Quick test

```bash
# Register a requester
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Tendai","phone":"+263771234567","password":"password123","role":"requester"}'

# Create a request near Harare CBD (use the token returned above)
curl -X POST http://localhost:4000/api/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"product_text":"Mealie meal (10kg)","quantity":"2 bags","lng":31.0492,"lat":-17.8292,"address_text":"Harare CBD","radius_km":10}'
```

## Ratings & reviews

- `POST /api/orders/:id/reviews` — the requester rates (1-5) and optionally comments on an order, but only once it's `delivered`, and only once per order. This recomputes the vendor's `rating_avg` immediately (simple `AVG()` over all their reviews).
- `GET /api/vendors/:vendorId/reviews` — public, no auth required, so a requester can check a vendor's track record before accepting an offer. Also used by the vendor dashboard to show its own reviews.
- A `review:new` Socket.io event notifies the vendor's dashboard the moment a new review comes in.

## Vendor subscriptions (paywall)

Only vendors with an active (or admin-waived) subscription can see full request details (product, quantity, address) or submit offers. Unpaid vendors still get alerted that *something* is nearby (distance only) so they know to subscribe, but the specifics are withheld until they pay.

- **Default price:** $7 USD/month, paid via **EcoCash to 0772738126** — both are admin-configurable (`platform_settings` table / `PATCH /api/admin/settings`).
- **Vendor flow:** vendor sends the EcoCash payment manually, then calls `POST /api/vendors/me/payment-submissions` with the amount and (ideally) the EcoCash reference. This sits as `pending` until an admin reviews it.
- **Admin flow:** `GET /api/admin/payment-submissions` lists pending ones; `PATCH /api/admin/payment-submissions/:id/approve` activates/extends the vendor's subscription by a month (or `months` in the body). Admins can also directly activate/extend (`POST /api/admin/vendors/:vendorId/activate`) or grant a free waiver (`{ "waive": true }`) without a payment submission at all — useful for VIP vendors, promos, or fixing mistakes.
- **Enforcement is server-side**, not just hidden in the UI: `POST /api/requests/:requestId/offers` returns `402 Payment Required` (with the current price/EcoCash number in the body) for any vendor who isn't paid up, and `GET /api/requests/:id` / `GET /api/requests/nearby/list` strip out product/address details for them.

### Creating the first admin (super-user)

Admin accounts can't be created through public registration. Run:
```bash
npm run create:admin -- "Your Name" "+263771234567" "a-strong-password"
```
This creates the account (or promotes an existing phone number to `admin`) with a real bcrypt-hashed password.

## Push notifications (for vendors who are online but not looking at the app)

Socket.io alerts only reach a vendor whose dashboard tab is actually open. Web Push reaches them even if the tab/app is closed, as long as they enabled push once and their browser/OS is running.

1. Generate a VAPID key pair:
   ```bash
   npm run generate:vapid
   ```
2. Copy the printed `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` into your backend `.env`.
3. Copy the same public key into the frontend's `.env` as `VITE_VAPID_PUBLIC_KEY` (or just let the frontend fetch it from `GET /api/push/public-key`, which it does automatically).
4. In the vendor dashboard, click **"Enable notifications"** once — this registers the service worker and saves a push subscription against the signed-in vendor.

From then on, any request that matches that vendor triggers both a Socket.io event (if the tab is open) and a push notification (regardless).

## Order tracking

- `GET /api/orders/:id` — full order detail (product, price, ETA, vendor, current status). Only the requester or the fulfilling vendor can view it.
- `PATCH /api/orders/:id/status` — vendor-only; advances `confirmed → out_for_delivery → delivered` (or `cancelled`). Broadcasts `order:status` over Socket.io to the requester and vendor.
- `GET /api/vendors/me/orders` — a vendor's active orders, for the dashboard's "Orders to fulfill" list.

## Notes

- Passwords are hashed with bcrypt; never store plaintext.
- All distance/geo logic lives in Postgres (PostGIS `ST_DWithin`/`ST_Distance`) rather than application code — this is both faster and correct at any vendor count.
- Socket.io rooms: vendors join `vendor:{id}`, anyone watching a request joins `request:{id}`. See `src/config/socket.js`.
- See `../docs/ARCHITECTURE.md` for the full system design.
