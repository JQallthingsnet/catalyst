# ATN Catalyst

All Things Network Catalyst is the reseller MVNE portal on Cisco IoT Control Center. Next.js (App Router, TypeScript) on Cloudflare Workers via [vinext](https://vinext.dev/).

Requires **Node.js 22+**.

Visual theme follows allthingsnet.io. Interaction follows Atomic-style 3-step wizards. Control Center is the source of radio/SIM state; Catalyst D1 is the source of tenants, customers, plans, orders, and commercial pools.

## Plans (three layers)

Every SIM can carry three plan records. They are different commercial relationships, not three SKUs of the same product.

| Layer | Who it is between | What it is |
| --- | --- | --- |
| Control Center rate plan | ATN ↔ Cisco IoT Control Center | Network / radio mapping. Super admin only. |
| ATN plan (Plan 1) | ATN ↔ reseller | The contracted wholesale plan. Same T&Cs for every reseller who is assigned it. Assigning Plan 1 to Acme vs Beta does **not** create Plan 1A / 1B as new SKUs. |
| Retail plan | Reseller ↔ end customer | A copy of an ATN plan with a customer-facing name, MB per SIM, and price per SIM. |

**Who sees which layer**

- Super admin: all three (CC rate plan, ATN plan, retail).
- Reseller admin: ATN plan + retail. Not the CC mapping.
- Operator: retail only. They pick a customer name and a retail plan.

**How stock gets onto a plan**

1. Super admin **creates** an ATN plan and maps it to a Control Center rate plan.
2. Super admin **assigns the contract** (same Plan 1, same T&Cs) to a reseller. No SIMs move. The reseller is allowed to buy that plan.
3. Super admin **sells stock** into that reseller’s warehouse. Each SIM is tagged with that ATN plan when it lands. Sell stock is refused until the contract exists.
4. **Bought** means SIMs on that plan exist in the warehouse. A signed contract with an empty warehouse is contracted, not buying.
5. Reseller admin **copies** a contracted ATN plan into a retail plan (name, data allowance, price) for operators to sell.
6. Operator **assigns** a warehouse SIM to a customer and a retail plan. At that moment the SIM has no retail plan yet; it already has the ATN plan from step 3.

**Assign matching**

The retail plan must be a copy of the ATN plan already on that SIM. If the reseller is contracted for three ATN plans, they may copy all three into retail catalogues. A SIM sold into the warehouse on Plan 1 can only take a retail copy of Plan 1, not Plan 2 or Plan 3. Changing ATN plan after sale is not part of assign.

**Plan 1 metrics (super admin)**

On an ATN plan page: which resellers are contracted, which are buying (have SIMs), current volume snapshot, SIMs sold per reseller, and top SIMs by current volume. Catalyst stores a snapshot (ICCID, CC status, rate plan, communication plan; IMSI / MSISDN / volume when those APIs are wired), not CDR history.

**Control Center copy**

CC is the radio source. Pages read D1, not Jasper. Super admin Dashboard and **CC snapshot** (`/dashboard/estate/cc`) show the same columns as Control Center (ICCID, IMSI, MSISDN, SIM status, rate plan, cycle-to-date MB, in session, activated, date added). Sync runs, in order:

1. `GET /rws/api/v1/devices` — each CC device is a SIM we sell. Results are paged (`pageSize` 50). Repeat the **same** call with `pageNumber` 1, 2, … until `lastPage` is true, then write every ICCID into D1.
2. `GET /rws/api/v1/devices/{iccid}` — IMSI, MSISDN, dates, status, plans
3. `GET /rws/api/v1/devices/{iccid}/ctdUsages` — cycle-to-date data bytes
4. `GET /rws/api/v1/devices/{iccid}/sessionInfo` — in session

One HTTP call at a time, at most 5/s. Super admin **Auto poll** on the CC snapshot page turns the Worker cron on or off. While ON, each minute continues until every page is stored and every SIM has details, staying under the Worker subrequest cap. **Sync** is a one-off batch. Locally you can also set `CC_AUTO_POLL=false` to force cron off. Auth is HTTP Basic: Base64 of `JASPER_ACCOUNT_NAME:JASPER_API_KEY` (colon, no space). Optional `JASPER_ACCOUNT_ID` scopes the device search; if omitted, Control Center uses the account on that user name. Do not put these in `wrangler.jsonc`. No CDR history — snapshots overwrite in place.

## Auth

Passwordless login: enter an email, receive an 8-digit passcode, then open the dashboard. The first successful sign-in registers that email to a tenant.

Set `SUPER_ADMIN_EMAIL` (your login email, comma-separated for more than one) in `.dev.vars` locally and as a Worker variable in production. That email is a super admin on every request (synced into `super_admins` with `added by env`). Their home tenant is **ATN Platform**, not a reseller — if an earlier sign-in created “My organisation”, it is renamed on the next load. After sign-in, **Admin** can invite super admins, reseller admins, and operators by email (same Gmail SMTP as login codes). Reseller admins invite operators from **Settings**. Super admins use **Estate** as the ACMA view across organisations and **Open** to scope day-to-day edits to one tenant. Invite a reseller admin with a new organisation name to create a separate reseller. **View as** only previews privileges. Plan create / contract / sell stock / retail copy / assign is described under **Plans (three layers)**.

Local testing can show the code on the page (`AUTH_DEV_RETURN_CODE=true` in `.dev.vars`). Production should send the code by email (`gmail-smtp-keys` Worker secret) and set `AUTH_SECRET`.

Gmail SMTP uses the same Worker JSON secret as Auking (`gmail-smtp-keys`):

```json
{
  "gmail-smtp-email": "you@gmail.com",
  "gmail-smtp-password": "your-app-password",
  "gmail-smtp-host": "smtp.gmail.com",
  "gmail-smtp-port": "465"
}
```

## Scripts

- `npm run dev` starts the local vinext development server
- `npm run build` builds Worker-ready production output
- `npm run start` runs the built Worker locally with Wrangler
- `npm run deploy` deploys to Cloudflare Workers
- `npm run db:migrate:local` applies D1 migrations locally
- `npm run db:migrate:remote` applies D1 migrations on Cloudflare
- `npm run cf-typegen` generates Cloudflare binding types

## Deploy

```sh
npx wrangler login
npm run db:create
# Put the printed database_id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put AUTH_SECRET
npx wrangler secret put gmail-smtp-keys
npx wrangler secret put JASPER_ACCOUNT_NAME
npx wrangler secret put JASPER_API_KEY
# optional: npx wrangler secret put JASPER_ACCOUNT_ID
npm run deploy
```

Git-connected **Workers Builds** is separate from `npm run deploy`. The builder already has Node 24; this repo pins that in `.nvmrc`. If a Git build fails on `Installing nodejs …`, turn off **Build cache** in the Worker **Settings → Build**, remove any dashboard `NODE_VERSION` override, and retry.
