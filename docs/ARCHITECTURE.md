# Tsvaga — Architecture

*"Tsvaga"* is Shona for "seek / search." The product: a person says **"I want product X,"** and nearby stores/vendors carrying X get alerted instantly and respond with a price + delivery-time offer — the same request→bid→accept loop that ride-hailing apps use for rides, applied to buying things.

---

## 1. Core concept & actors

| Actor | Role |
|---|---|
| **Requester** | Anyone who wants a product. Posts a request with product, quantity, and location. |
| **Vendor** | A store/individual seller with a registered location and product catalog/inventory. Gets alerted when a nearby request matches something they sell. |
| **System** | Matches requests to vendors geospatially, fans out real-time alerts, collects offers, and manages the resulting order once a requester accepts one. |

### The core loop (Uber-for-goods)
```
Requester posts request  →  System finds nearby matching vendors (radius search)
        ↓                                          ↓
   Waits & watches                    Vendors alerted in real time (push/socket)
        ↓                                          ↓
   Offers stream in live  ←───────────  Vendor sends offer (price + ETA)
        ↓
   Requester compares offers, picks one
        ↓
   Order created → vendor prepares/delivers → requester confirms receipt → rating
```

Key design decision: this is a **reverse marketplace** (demand-first, like Priceline/Uber), not a catalog-browse marketplace. The request is the primary object; offers are bids against it.

---

## 2. High-level architecture

```
┌────────────────────┐        ┌────────────────────┐
│   Requester App    │        │    Vendor App       │
│ (React + Leaflet)  │        │ (React + Leaflet)   │
└─────────┬──────────┘        └─────────┬────────────┘
          │  REST (create request,      │  REST (register, manage
          │  accept offer)              │  inventory) + Socket.io
          │  + Socket.io (live offers)  │  (receive alerts, send offers)
          └───────────────┬─────────────┘
                           │
                  ┌────────▼─────────┐
                  │   API Gateway /   │
                  │  Express server   │
                  └────────┬──────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
      ┌───────▼───────┐         ┌───────▼────────┐
      │  PostgreSQL +  │         │  Socket.io       │
      │  PostGIS       │         │  real-time layer │
      │  (source of    │         │  (alerts, offer  │
      │  truth, geo    │         │  streaming,      │
      │  queries)      │         │  order/review    │
      │                │         │  updates)        │
      └────────────────┘         └──────────────────┘
```

**Why this stack:**
- **PostGIS** gives native `ST_DWithin` / `ST_Distance` geospatial queries — critical for "who is near this request" at any scale, far better than looping through lat/lng in application code.
- **Socket.io** pushes requests to vendors and offers back to requesters in real time — this *is* the product; without live push it's just a slow form.
- **Express/Node** because the whole stack (API + realtime) shares one runtime and one deploy story, which matters most for a small team shipping fast.
- **No Redis in the current build.** A single Node instance handles Socket.io's in-memory rooms fine at this scale. Redis (as a Socket.io adapter) only becomes necessary once you're running more than one backend instance behind a load balancer — see the scaling note in section 8. Adding it later is a config change, not a rearchitecture.

---

## 3. Data model

```
users
├── id (uuid, pk)
├── name
├── phone            -- primary identifier in Zimbabwe (USSD/WhatsApp-friendly)
├── role              enum('requester','vendor','both')
├── password_hash
└── created_at

vendors
├── id (uuid, pk, fk → users.id)
├── business_name
├── location           geography(Point, 4326)   -- PostGIS point
├── address_text        -- human readable, e.g. "First Street, Harare CBD"
├── is_online           boolean                  -- accepting requests right now
├── rating_avg
└── created_at

products                -- normalized catalog so requests can be matched to inventory
├── id (uuid, pk)
├── name
├── category
└── synonyms[]           -- "mealie meal" = "maize meal" etc.

vendor_inventory
├── id (uuid, pk)
├── vendor_id (fk)
├── product_id (fk)
├── in_stock            boolean
├── typical_price
└── updated_at

requests
├── id (uuid, pk)
├── requester_id (fk)
├── product_id (fk, nullable)     -- nullable: free-text product allowed
├── product_text                  -- raw text if not matched to catalog
├── quantity
├── location            geography(Point, 4326)
├── address_text
├── radius_km            default 5
├── status              enum('open','matched','completed','cancelled','expired')
├── expires_at
└── created_at

offers
├── id (uuid, pk)
├── request_id (fk)
├── vendor_id (fk)
├── price
├── delivery_eta_minutes
├── message
├── status              enum('pending','accepted','declined','withdrawn')
└── created_at

orders
├── id (uuid, pk)
├── request_id (fk)
├── offer_id (fk)
├── status              enum('confirmed','out_for_delivery','delivered','cancelled')
├── created_at
└── delivered_at

reviews
├── id (uuid, pk)
├── order_id (fk)
├── rating (1-5)
├── comment
└── created_at
```

Geo columns use `geography(Point, 4326)` (WGS 84 — standard GPS lat/lng) so distance functions return metres directly.

---

## 4. Matching algorithm

When a request is created:

1. Resolve `product_id` (fuzzy-match `product_text` against `products.name`/`synonyms`, else leave as free text so vendors can still respond manually).
2. Run a PostGIS query:
   ```sql
   SELECT v.id, v.business_name, v.location,
          ST_Distance(v.location, :request_point) AS distance_m
   FROM vendors v
   JOIN vendor_inventory vi ON vi.vendor_id = v.id
   WHERE vi.product_id = :product_id
     AND vi.in_stock = true
     AND v.is_online = true
     AND ST_DWithin(v.location, :request_point, :radius_km * 1000)
   ORDER BY distance_m ASC
   LIMIT 25;
   ```
3. Emit a `request:new` Socket.io event to each matched vendor's room (`vendor:{id}`).
4. If no product match (free text), broadcast to all online vendors within radius regardless of inventory, flagged as "unconfirmed stock" so they can still choose to respond.
5. Vendors respond with `offer:create` → stored, then pushed to the requester via `offer:new` on room `request:{id}`.
6. Requester calls `PATCH /offers/:id/accept` → request status → `matched`, all other pending offers → `declined`, an `order` row is created, and a `request:matched` event closes the loop for other vendors ("this request has been fulfilled").

---

## 5. API surface (REST)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create user (requester/vendor/both) |
| POST | `/api/auth/login` | Returns JWT |
| POST | `/api/vendors/me/location` | Update vendor's live location |
| PATCH | `/api/vendors/me/status` | Toggle online/offline |
| POST | `/api/vendors/me/inventory` | Add/update a product + price + stock |
| POST | `/api/requests` | Create a product request (triggers matching) |
| GET | `/api/requests/:id` | Request detail + current offers |
| GET | `/api/requests/nearby` | (vendor view) requests currently open near vendor |
| POST | `/api/requests/:id/offers` | Vendor submits an offer |
| PATCH | `/api/offers/:id/accept` | Requester accepts an offer → creates order |
| GET | `/api/orders/:id` | Order status/tracking |
| POST | `/api/orders/:id/reviews` | Leave a rating |

## 6. Real-time events (Socket.io)

| Event | Direction | Payload |
|---|---|---|
| `request:new` | server → vendor | request summary + distance |
| `offer:new` | server → requester | offer detail |
| `offer:withdrawn` | server → requester | offer id |
| `request:matched` | server → other vendors | request id (stop bidding) |
| `order:status` | server → both parties | order id + new status |

---

## 7. Zimbabwe-specific map layer

- **Map tiles:** OpenStreetMap via Leaflet (no API key, works well for ZW where detailed OSM coverage of Harare/Bulawayo CBDs is solid).
- **Bounding box for initial view:** roughly `lat -22.4 to -15.6, lng 25.2 to 33.1` (all of Zimbabwe), defaulting to whichever city the user's device location falls nearest to.
- **Seeded vendor coverage** (used in the demo data below): Harare (CBD, Avondale, Borrowdale, Mbare), Bulawayo, Mutare, Gweru, Masvingo, Victoria Falls — real coordinates, so the map looks and feels like Zimbabwe rather than generic pins.
- **Geolocation input:** browser `navigator.geolocation` first; falls back to a searchable address/suburb picker (since GPS accuracy varies on lower-end Android devices common in the market) backed by a small static list of ZW suburbs rather than a paid geocoding API, to keep running costs at zero.

---

## 8. Non-functional notes

- **Offline-first vendors:** connectivity isn't always reliable — vendor app should queue offers locally and resend on reconnect (service worker + IndexedDB queue).
- **Phone-number identity:** phone, not email, is the primary login credential — matches how most local commerce apps and mobile money (EcoCash) work here; opens the door to a later WhatsApp/USSD channel without redesigning the data model.
- **Abuse/no-shows:** a lightweight reputation score (rolling average of ratings + completion rate) is enough at MVP stage; don't over-engineer trust/safety before there's real usage data.
- **Scaling path:** the current build runs Socket.io in-memory on a single Node instance, which is the right amount of complexity for launch. If you outgrow one instance, add the `@socket.io/redis-adapter` package and a Redis instance so multiple Node processes share room state — a config change, not a rewrite. PostGIS indexes (`GIST` on the geography columns) already keep matching fast as vendor count grows, independent of that.

---

## 9. What's included in this delivery

- `backend/` — deployable Node.js/Express API: schema, seed data (real ZW vendor locations), matching logic, Socket.io realtime layer, Web Push (VAPID) for offline-vendor alerts, and order-status tracking endpoints.
- `frontend/` — deployable React app: request form, live map (Leaflet, centered on Zimbabwe), live offer list, order tracker, and a separate vendor dashboard (inventory, online toggle, push opt-in, order fulfillment).
- `demo.html` / `vendor-demo.html` — single-file, no-build interactive mockups you can open right now to see each flow and the map, using mock data (no backend required).

## 10. Push notifications & order tracking (added)

**Push notifications** solve a real gap in the original design: Socket.io alerts only reach a vendor whose dashboard tab is open. A vendor who's toggled "online" but has closed the tab (gone to serve a customer in person, phone locked, etc.) would otherwise miss requests entirely. Web Push (via VAPID keys + a service worker) delivers a native OS/browser notification regardless of whether the tab is open, as long as the vendor opted in once. Both channels fire on every match — Socket.io for anyone with the tab open right now, push for everyone else — rather than trying to detect which one is "needed," which keeps the logic simple and the alert reliable either way.

**Order tracking** closes the loop after acceptance: an `orders` row already existed in the schema, but there was no way to see or advance its status. Now:
- The vendor dashboard shows "Orders to fulfill" with a one-tap button to advance `confirmed → out_for_delivery → delivered`.
- The requester's screen automatically shows a live tracker for the accepted order, updating the instant the vendor advances it (`order:status` over Socket.io) — no polling needed while the tab is open.
- Only the requester who placed the order or the vendor fulfilling it can view or update it (checked server-side, not just hidden in the UI).

## 11. Vendor subscriptions & admin (added)

A vendor can register and appear on the map for free, but **seeing full request details and responding with offers requires an active subscription** — this was added as a monetization/gatekeeping layer on top of the original design.

- **Pricing:** defaults to **$7 USD/month**, paid manually via **EcoCash to 0772738126**. Both figures live in a single-row `platform_settings` table and are editable by an admin — not hardcoded.
- **Manual payment, admin-confirmed:** there's no EcoCash API integration (Zimbabwean mobile money doesn't have an easy self-serve payment API for this), so the flow is: vendor pays via EcoCash → tells the app they paid (amount + optional reference) → it sits as a `pending` submission → an admin approves it, which activates or extends their subscription by a month. Admins can also activate/extend/waive a vendor directly without waiting for a submission (useful for phone-based confirmations, promos, or fixing mistakes).
- **Waivers:** an admin can grant a vendor free, indefinite access (`status = 'waived'`) — useful for pilot partners or goodwill.
- **Enforcement is server-side:** `POST /api/requests/:id/offers` returns `402 Payment Required` for any non-paid-up vendor attempting to respond; `GET /api/requests/:id` and the nearby-requests list strip out the product/quantity/address fields for them, replacing them with a locked teaser (distance only) so they know a request exists without seeing what it is. This applies uniformly whether the request reaches them via Socket.io, push notification, or a direct API call — there's no client-only gate to bypass.
- **Admin role:** a fourth `user_role` (`admin`), created only via a backend CLI script (`npm run create:admin`) — never through public self-registration, to avoid privilege escalation via the signup form.

See `10.` above for how this interacts with push notifications: unpaid vendors still get alerted that *something* is nearby (to nudge them to subscribe), just without the specifics.

## 12. Ratings & reviews (added)

The `reviews` table existed in the original schema but nothing wrote to or read from it. Now:
- Once an order is `delivered`, the requester's tracker screen prompts for a 1-5 star rating and optional comment — enforced to happen exactly once per order, and only by the requester who placed it (checked server-side).
- Submitting a review immediately recomputes that vendor's `rating_avg` (a straightforward average across all their reviews), which is what already shows up next to their name in the offer list and vendor profile.
- Reviews are public (`GET /api/vendors/:vendorId/reviews`, no auth) so a requester comparing offers can check a vendor's track record before accepting one — and the vendor dashboard shows the same list plus a live `review:new` Socket.io update the moment feedback comes in.
