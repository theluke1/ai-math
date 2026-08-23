# AI Deployment

The browser never calls the Google Gemini API directly. It posts to `/ask`, and the
server-side edge function reads `GEMINI_API_KEY` from the environment and proxies
the streaming response back to the client. The key never touches the browser.

---

## Getting a free Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account and click **Create API key**
3. Copy the key — it starts with `AIza`

Free tier limits: **15 req/min · 1,500 req/day · 1M tokens/min**
No credit card required.

---

## Production — Netlify (recommended)

The repo includes a Netlify Edge Function at `netlify/edge-functions/ask.js` and a
`netlify.toml` at the repo root that routes `/ask` to it automatically.

**Setup:**

1. Connect the repo to Netlify (Add new site → Import from Git)
2. Netlify auto-detects `netlify.toml` — build settings are pre-filled
3. Go to **Site configuration → Environment variables** and add:
   ```
   GEMINI_API_KEY = AIza...
   ```
4. Go to **Deploys → Trigger deploy → Deploy site** (env var changes require a manual redeploy)

Every subsequent `git push` to `main` deploys automatically.

The edge function runs on Deno at Netlify's network edge. It uses the same Web APIs
as the Cloudflare Worker version (fetch, ReadableStream, TextEncoder) so the logic
is identical — only the export signature and env var access differ.

---

## Local development

Create `math-vis/.dev.vars` (already in `.gitignore`):

```
GEMINI_API_KEY=AIza...
```

Run the local Cloudflare Worker (Wrangler) in one terminal and Vite in another:

```sh
# Terminal 1 — Worker on :8787
cd math-vis && npx wrangler dev

# Terminal 2 — Vite on :5173
cd math-vis && npm run dev
```

Vite proxies `/ask` → `http://127.0.0.1:8787` automatically (configured in `vite.config.js`).
Open http://localhost:5173.

---

## Cloudflare alternative

`worker/ask.js` is the original Cloudflare Worker version. If you prefer Cloudflare Pages:

1. Remove or ignore `netlify.toml`
2. The `functions/ask.js` file at the project root is a thin Pages Function wrapper
   that delegates to `worker/ask.js` — it's picked up automatically by Cloudflare Pages
3. Add `GEMINI_API_KEY` as a secret in the Cloudflare Pages dashboard

---

## Model

Both the Netlify edge function and the Cloudflare Worker use `gemini-2.5-flash`.
To switch models, change the `GEMINI_MODEL` constant at the top of either file.

Deep explain questions use Gemini's thinking mode (`thinkingBudget: 512`).
Quick slider/equation lookups disable thinking (`thinkingBudget: 0`) to reduce latency.
