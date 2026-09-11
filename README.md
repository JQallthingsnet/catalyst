# ATN Catalyst

All Things Network Catalyst is the reseller MVNE portal on Cisco IoT Control Center. Next.js (App Router, TypeScript) on Cloudflare Workers via [vinext](https://vinext.dev/).

Requires **Node.js 22+**.

Visual theme follows allthingsnet.io. Interaction follows Atomic-style 3-step wizards. Control Center is the source of radio/SIM state; Catalyst D1 is the source of tenants, customers, retail plans, orders, and commercial pools.

## Auth

Passwordless login: enter an email, receive an 8-digit passcode, then open the dashboard. The first successful sign-in registers that email to a tenant.

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
npm run deploy
```
