# Prism · AI Math Visualization Studio

**Live demo → [ai-math-ald.pages.dev](https://ai-math-ald.pages.dev)**

An interactive 3D mathematics visualization studio where every exhibit is a live mathematical instrument. Seven classical systems — parametric curves, Fourier epicycles, chaos attractors, sculptural surfaces, knots, and complex analysis — rendered in real-time WebGL with a built-in AI professor that explains the math behind what you're watching, grounded in the current visual state and your exact parameter values.

Built as a portfolio project to demonstrate full-stack AI application design, real-time graphics programming, and system architecture decision-making.

---

## The Seven Exhibits

| Exhibit | Mathematics | What you see |
|---|---|---|
| **Lissajous** | Parametric curves: $x = A\sin(at + \delta),\ y = B\sin(bt)$ | A luminous orbit that closes into geometric figures when the frequency ratio $a:b$ is rational |
| **Fourier** | Phasor decomposition: $z(t) = \sum A_n e^{i\omega_n t}$ | Rotating epicycles that reconstruct any periodic signal — watch Gibbs phenomenon at sharp discontinuities |
| **Rose Curves** | Polar: $r = \cos(k\theta)$, lifted to $z = \cos(m\theta)$ | Petal symmetries that shift from $k$ to $2k$ petals based on parity, extended into spherical-harmonic shapes |
| **Attractors** | Lorenz, Rössler, Aizawa, and Thomas chaotic systems | Strange attractors traced by a deterministic trajectory — two near-identical starts diverge exponentially |
| **Surfaces** | Gaussian curvature $K$, Hopf fibration, Morse theory | 16 mathematical surfaces with live distortion (twist, inflate, noise, pinch) and domain-colour curvature mapping |
| **Knots** | Torus knots $T(p,q)$, parallel transport framing | Smooth tube meshes for the trefoil, figure-eight, and Borromean rings with a writhe perturbation slider |
| **Complex Analysis** | Domain colouring: hue = $\arg f(z)$, height = $|f(z)|$ | Poles spike upward, zeros dip, branch cuts appear as colour discontinuities — Riemann sphere projection included |

---

## Features

### AI Professor
- **Four response modes** — Ask (free-form), Lesson (full textbook-style notes), Variables (symbol guide), Examples (real-world connections)
- **Context-aware** — every query includes the current mode, equation, and live parameter values so answers are grounded in exactly what you're looking at
- **Conversation memory** — the Ask tab maintains a multi-turn thread; prior exchanges are sent to Gemini so follow-up questions work naturally
- **Thinking mode** — deep explain questions use `thinkingBudget: 512` in Gemini 3.6 Flash for more considered mathematical reasoning
- **Session cache** — responses are cached in `sessionStorage` (max 60 entries) to avoid redundant API calls and stay within free-tier rate limits
- **Token budgeting** — each intent sends a `responseLimit` so quick slider lookups use ~320 tokens and full lessons use ~2,400

### Visualization Engine
- **Real-time WebGL** via Three.js with a custom post-FX pipeline — bloom, chromatic aberration, and vignette
- **GSAP-choreographed transitions** — mode switches are staged timelines (fade → bloom spike → scene swap → settle), not simple crossfades
- **Live equation panel** — KaTeX-rendered equation updates as you drag sliders, keeping math and motion in sync
- **GPU analytics HUD** — draw call count, triangle count, and per-frame render time measured against the WebGL info API
- **Audio-reactive bloom** — optional microphone input modulates the bloom strength in real time

### UX
- **URL hash state** — parameters are serialized to `#mode=chaos&p=BASE64(JSON)` so any configuration is shareable as a link
- **First-visit onboarding** — a 4-step GSAP spotlight coach mark tour, localStorage-gated so it appears once and never again
- **Gallery with animated previews** — each exhibit card shows a CSS-animated mathematical SVG (Lissajous butterfly, Lorenz wings, torus wireframe, trefoil, domain-colour wheel)
- **PNG capture** — one-click screenshot of the current canvas frame

---

## Architecture

### Why a server-side AI proxy?

The Gemini API key must never reach the browser — anyone who can read browser network traffic could extract it and make requests on your behalf. Prism routes all AI calls through a **Netlify Edge Function** (`math-vis/netlify/edge-functions/ask.js`) that runs on Deno at the network edge.

```
Browser → POST /ask (question + context JSON)
       → Netlify Edge Function (reads GEMINI_API_KEY from env)
       → Gemini 3.6 Flash (streamGenerateContent?alt=sse)
       → SSE stream back to browser (event: delta / data: [DONE])
```

The edge function and the frontend share the same Netlify origin so no CORS configuration is needed for the deployed site. The proxy is ~250 lines of vanilla JS with no dependencies — no framework overhead at the network edge.

### Streaming SSE pipeline

Gemini's `alt=sse` endpoint streams `data: {...}` lines as the model generates text. The edge function reads these chunks via `ReadableStream`, extracts `candidates[0].content.parts[0].text`, and re-emits them as `event: delta` SSE events. The browser's `EventSource`-style fetch listener appends each delta to the UI in real time, giving the typewriter effect without buffering the full response.

### Multi-turn conversation

Conversation history is stored client-side as `{ role: 'user' | 'model', text }` pairs. On each Ask-tab submission, the last four exchanges are mapped to Gemini's `contents` array format and prepended before the current message. A guard loop enforces strictly alternating `user/model` roles (Gemini rejects malformed sequences).

### Context compaction

The full visualization context (mode, equation, params, lesson notes) can get large. For quick slider or equation queries, `compactContext()` strips lesson notes and returns only the essential fields, keeping token usage low. For full explain/lesson requests, the complete context is included, trimmed only if it exceeds 22,000 characters.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| 3D rendering | [Three.js](https://threejs.org) | WebGL abstraction with post-FX pipeline support |
| Bundler | [Vite](https://vitejs.dev) | Fast HMR, GLSL plugin, tree-shaking |
| Animation | [GSAP](https://gsap.com) | Timeline-based choreography for mode transitions and UI |
| Controls | [Tweakpane](https://tweakpane.info) | Clean parametric sliders with binding API |
| Math rendering | [KaTeX](https://katex.org) | Fast, accurate LaTeX rendering in the browser |
| AI model | [Gemini 3.6 Flash](https://aistudio.google.com) | Free tier, fast, streaming SSE, thinking mode |
| Edge runtime | [Netlify Edge Functions](https://docs.netlify.com/edge-functions/overview/) | Deno-based, same Web APIs as Cloudflare Workers, co-deployed with frontend |
| Hosting | [Netlify](https://netlify.com) | GitHub-connected auto-deploy, free tier |

---

## Running Locally

You need two terminals — one for the frontend (Vite) and one for the AI backend (Wrangler local Worker).

### 1. Install dependencies

```sh
cd math-vis
npm install
```

### 2. Add your Gemini API key

Create `math-vis/.dev.vars` (already gitignored):

```
GEMINI_API_KEY=AIza...
```

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
Alternatively, create one via the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with the **Gemini API** enabled and linked to a billing account (no charge on free tier).

### 3. Start both servers

```sh
# Terminal 1 — AI Worker on :8787
cd math-vis && npx wrangler dev

# Terminal 2 — Vite frontend on :5173
cd math-vis && npm run dev
```

Vite proxies `/ask` → `http://127.0.0.1:8787` automatically. Open **http://localhost:5173**.

---

## Deploying to Netlify

Netlify auto-deploys on every push to `main` — both the frontend and the edge function.

### First-time setup

1. Push the repo to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**
3. Select the repo — `netlify.toml` is detected automatically (base: `math-vis`, build: `npm run build`, publish: `dist`)
4. Go to **Site configuration → Environment variables** and add:
   ```
   GEMINI_API_KEY = AIza...
   ```
5. Go to **Deploys → Trigger deploy → Deploy site** (env var changes require a manual redeploy)

After that, every `git push origin main` deploys automatically.

---

## Project Structure

```
prism/
├── math-vis/                          # The full application
│   ├── src/
│   │   ├── core/
│   │   │   ├── renderer.js            # Three.js scene, post-FX pipeline
│   │   │   ├── ai-panel.js            # AI professor UI — tabs, streaming, cache
│   │   │   ├── onboarding.js          # First-visit GSAP coach mark tour
│   │   │   ├── audio.js              # Web Audio API analyser
│   │   │   ├── particles.js          # Background curl-noise particle field
│   │   │   ├── math-render.js        # KaTeX equation rendering
│   │   │   └── ui.js                 # Tweakpane annotation utilities
│   │   ├── modes/
│   │   │   ├── lissajous.js          # Parametric orbit
│   │   │   ├── fourier.js            # Epicycle Fourier synthesis
│   │   │   ├── rose.js               # Polar rose curves
│   │   │   ├── chaos.js              # Lorenz / Rössler / Aizawa / Thomas
│   │   │   ├── surfaces.js           # 16 mathematical surfaces
│   │   │   ├── knots.js              # Torus knots as tube meshes
│   │   │   └── complex.js            # Domain-coloured complex functions
│   │   ├── shaders/                  # GLSL fragment shaders
│   │   ├── main.js                   # Entry point — mode switching, URL state, HUD
│   │   └── style.css                 # All UI styles
│   ├── netlify/
│   │   └── edge-functions/
│   │       └── ask.js                # Netlify Edge Function — Gemini SSE proxy
│   ├── worker/
│   │   └── ask.js                    # Cloudflare Worker version (local dev)
│   ├── vite.config.js
│   └── index.html
├── netlify.toml                       # Build config and edge function routing
└── README.md
```
