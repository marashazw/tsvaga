# Tsvaga Frontend

React + Vite app with a live Leaflet map centered on Zimbabwe.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_BASE / VITE_SOCKET_BASE if not using localhost:4000
npm run dev
```

Opens on `http://localhost:5173`.

## How it works

1. Tap the map to drop your location pin anywhere in Zimbabwe (defaults to a whole-country view, zooms in once you've picked a spot).
2. Fill in what you want and how far you're willing to search.
3. Submit — this calls `POST /api/requests` on the backend, which geospatially matches nearby vendors and alerts them over Socket.io.
4. Offers appear live in the panel as vendors respond (`offer:new` socket event) — no refresh needed.
5. Accept an offer to create an order; other vendors are notified the request is closed.
6. Your screen switches to a live order tracker (**Confirmed → Out for delivery → Delivered**) that updates the moment the vendor advances it.
7. Once delivered, you're prompted to leave a star rating and optional comment — this feeds directly into the vendor's public rating average and shows up on their dashboard.

## Vendor dashboard

A second, separate app lives at `vendor.html` (e.g. `http://localhost:5173/vendor.html` in dev). It lets a store:

- Register/sign in as a vendor (phone + password).
- Go **online/offline** — offline vendors never receive alerts or show up in matching.
- Set their store's map pin (tap the map, same as the requester flow).
- Manage **inventory**: add products from the shared catalog, set a price, toggle in-stock/out-of-stock.
- See **incoming requests** appear live the moment a nearby requester posts one (Socket.io `request:new`), and respond with a price + delivery ETA, which streams straight to the requester's screen.
- **Enable push notifications** (button in the header) so new requests reach them even when the dashboard tab isn't open.
- See **orders to fulfill**, with a button to advance each one from confirmed → out for delivery → delivered.
- See **reviews and their overall star rating**, updating live the moment a requester submits one.

This is built as a Vite multi-page app (`index.html` = requester, `vendor.html` = vendor), sharing `api.js`, `MapView`, and styles, so both stay in sync with one backend.

## Admin app

A third page lives at `admin.html` (e.g. `http://localhost:5173/admin.html`). Admin accounts are created via the backend CLI (`npm run create:admin`), not public registration. From here an admin can:

- Set the monthly subscription price (default $7 USD) and the EcoCash number payments go to.
- Review vendors' self-reported EcoCash payments and approve (activates/extends a month) or reject them.
- See every vendor's subscription status and manually activate, extend, waive (free access), or deactivate any of them.

## Vendor subscriptions (paywall)

Only vendors with an active or waived subscription see full request details and can submit offers — this is enforced on the backend, not just hidden in the UI. Unpaid vendors still see a locked teaser ("a request came in nearby") so they know to subscribe. The vendor dashboard shows a subscription status banner with instructions to pay via EcoCash and a form to confirm the payment, which then awaits admin approval.

## Push notifications (vendor side)

Click **"Enable notifications"** in the vendor dashboard header once. This registers `public/service-worker.js`, asks browser permission, and saves a push subscription to the backend. From then on, a matching nearby request reaches that vendor even if the dashboard tab is closed — not just while it's open and connected via Socket.io. Requires the backend to have VAPID keys configured (see `backend/README.md`).

## Order tracking

Once a requester accepts an offer, their screen switches to a live tracker showing **Confirmed → Out for delivery → Delivered**, updating in real time as the vendor advances it. The vendor dashboard has an "Orders to fulfill" section with a button to advance each order's status one step at a time; every update pushes instantly to the requester over Socket.io.

See `../docs/ARCHITECTURE.md` for the full system design.
