# Catalyst

Next.js (App Router, TypeScript) web app configured to run on Cloudflare Workers via [vinext](https://vinext.dev/).

Requires **Node.js 22+**.

## Scripts

- `npm run dev` starts the local vinext development server
- `npm run build` builds Worker-ready production output
- `npm run start` runs the built Worker locally with Wrangler
- `npm run deploy` deploys to Cloudflare Workers
- `npm run cf-typegen` generates Cloudflare binding types

## Deploy

Sign in with Wrangler, then deploy:

```sh
npx wrangler login
npm run deploy
```
