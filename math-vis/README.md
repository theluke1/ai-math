# Manifold

An interactive 3D mathematics visualisation studio with an AI professor that explains what you're looking at — live equations, rendered with KaTeX, grounded in the current visual state.

Built with Three.js, Vite, and Gemini 2.5 Flash running on a Cloudflare Worker.

---

## Modes

| Mode | What it shows |
|---|---|
| **Lissajous** | Parametric orbits driven by two independent frequencies |
| **Fourier** | Rotating epicycles that reconstruct any periodic signal |
| **Rose Curves** | Polar petal symmetries lifted into 3D |
| **Attractors** | Lorenz, Rössler, and other chaotic dynamical systems |
| **Surfaces** | 16 mathematical surfaces — tori, minimal surfaces, algebraic forms — with live distortion, Hopf fibration, and Morse theory exhibits |
| **Knots** | Torus knots, figure-eight knot, and Borromean rings rendered as smooth tubes |
| **Complex Analysis** | Domain-coloured complex functions, Riemann sphere, and multi-sheeted branch surfaces |

---

## AI Professor

Click **AI** to open the side panel. Four tabs:

- **Ask** — free-form questions about the current visualisation
- **Lesson** — full textbook-style lesson with rendered equations
- **Variables** — symbol-by-symbol reference guide
- **Examples** — real-world connections to the current mathematics

Powered by Gemini 2.5 Flash via a Cloudflare Worker. The API key never reaches the browser.

---

## Stack

- **Three.js** — 3D rendering and WebGL
- **Vite** — dev server and bundler
- **GSAP** — mode transitions and UI animation
- **Tweakpane** — parameter controls
- **KaTeX** — equation rendering
- **Cloudflare Workers / Pages Functions** — AI backend proxy
- **Google Gemini 2.5 Flash** — free-tier AI (get a key at [aistudio.google.com](https://aistudio.google.com/apikey))

---

## Running locally

### 1. Install dependencies

```sh
npm install
```

### 2. Add your Gemini API key

Create `.dev.vars` in the project root (gitignored):

```
GEMINI_API_KEY=AIza...
```

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no credit card required.

### 3. Start the AI worker and dev server

```sh
npx wrangler dev    # terminal 1 — Worker on :8787
npm run dev         # terminal 2 — Vite on :5173
```

The Vite proxy forwards `/ask` to the local Worker automatically. If the Worker is offline, the app falls back to local demo responses.

---

## Deploying to Cloudflare Pages

1. Push the repo to GitHub
2. Connect it to [Cloudflare Pages](https://pages.cloudflare.com)
3. Set build command: `npm run build`, output directory: `dist`
4. Add a **secret** in the Pages dashboard: `GEMINI_API_KEY=AIza...`

The `functions/ask.js` file is picked up automatically as a Pages Function at `/ask`.

---

## Project structure

```
src/
  core/         renderer, particles, audio, AI panel, math renderer
  modes/        one file per visualisation mode
  shaders/      GLSL fragment shaders
worker/
  ask.js        Cloudflare Worker — Gemini SSE proxy
functions/
  ask.js        Pages Function wrapper
```
