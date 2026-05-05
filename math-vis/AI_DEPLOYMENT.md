# AI Deployment

The browser never calls the Google Gemini API directly. It calls `/ask`, and the
Cloudflare Worker uses `GEMINI_API_KEY` privately on the server side.

## Getting a free Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account and click **Create API key**
3. Copy the key — it starts with `AIza`

Free tier limits: **15 req/min · 1,500 req/day · 1M tokens/min**
No credit card required.

---

## Production — Cloudflare Pages (recommended)

Deploy the repo to Cloudflare Pages. The `functions/ask.js` file is
automatically picked up as a Pages Function, served at the same origin:

```
https://your-site.pages.dev/ask
```

No frontend configuration is needed because the app defaults to:

```env
VITE_AI_ENDPOINT=/ask
```

In your Cloudflare Pages dashboard, add one **secret** (not a plain var):

```
GEMINI_API_KEY=AIza...
```

## Production — Standalone Worker

If the frontend is hosted elsewhere, deploy `worker/ask.js` as a Cloudflare
Worker and build the frontend with:

```env
VITE_AI_ENDPOINT=https://your-worker.your-subdomain.workers.dev/ask
```

The Worker sends CORS headers, so it works from any hosted frontend.

Set the secret in wrangler:

```sh
npx wrangler secret put GEMINI_API_KEY
```

## Local Development

Create `.dev.vars` in the project root:

```
GEMINI_API_KEY=AIza...
```

Run the Worker on port 8787, then run Vite. The Vite proxy forwards `/ask`
to the local Worker automatically.

```sh
npm run dev:ai            # terminal 1 — Worker on :8787
npm run dev               # terminal 2 — Vite on :5173
```

If the Worker is offline or the key is missing, the frontend falls back to
local demo responses so the visual studio still runs without AI.

## Model

The Worker uses `gemini-2.5-flash`. To switch models, change
the `GEMINI_MODEL` constant in `worker/ask.js`.
