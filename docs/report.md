# Prism — AI Math Visualization Studio
### Portfolio Technical Report

---

## What It Is

Prism is an interactive 3D mathematics visualization studio with a built-in AI professor. Seven classical mathematical systems — parametric curves, Fourier synthesis, polar rose curves, chaotic attractors, sculptural surfaces, topological knots, and complex analysis — are rendered in real-time directly on the GPU, and a context-aware AI assistant explains the math behind exactly what the user is looking at, grounded in their live parameter values.

**Live demo:** [ai-math-ald.pages.dev](https://ai-math-ald.pages.dev)

---

## The Problem

Most people encounter beautiful mathematical objects — Lorenz attractors, torus knots, Riemann surfaces — as static images in a textbook. They can see the shape but not interact with it, can't ask questions about it, and have no way to build intuition about how the parameters affect the behavior.

The standard alternative — a mathematics software tool like Desmos or Wolfram — puts the burden on the user. You have to already know what you're asking for.

Prism inverts this: the visualization is live and parameter-driven, the user can drag sliders and watch the math respond in real time, and the AI professor is always aware of the current state of the visualization — which exhibit is active, what the equations are, and what specific values the parameters are set to. You don't have to describe what you're looking at. It already knows.

---

## The Seven Exhibits

| Exhibit | Mathematics | What It Shows |
|---|---|---|
| **Lissajous** | $x = A\sin(at+\delta),\ y = B\sin(bt)$ | Parametric curves that close into figures when the frequency ratio $a:b$ is rational |
| **Fourier** | $z(t) = \sum A_n e^{i\omega_n t}$ | Rotating epicycles that reconstruct any periodic signal; includes a draw-your-own waveform mode |
| **Rose Curves** | $r = \cos(k\theta)$ | Polar petal patterns that shift from $k$ to $2k$ petals based on parity, with a 3D lift |
| **Attractors** | Lorenz, Rössler, Halvorsen, Aizawa, Thomas | Chaotic trajectories that never repeat yet stay confined to a strange attractor |
| **Surfaces** | Gaussian curvature $K$, Hopf fibration | 16 sculptural surfaces with live distortion — twist, inflate, noise, pinch — and curvature color mapping |
| **Knots** | Torus knots $T(p,q)$ | Smooth tube meshes with parallel transport framing and a writhe perturbation slider |
| **Complex Analysis** | Domain coloring: hue = $\arg f(z)$, height = $|f(z)|$ | Poles spike upward, zeros dip, branch cuts appear as color discontinuities |

---

## Architecture: How the Pieces Connect

Understanding the architecture requires understanding where computation happens and why. There are three distinct environments: the browser, a server-side function, and the Groq AI service.

### The Visualization Layer (Browser + GPU)

The mathematical objects are not drawn by the CPU calculating each pixel individually. Instead, **Three.js** — a JavaScript library that wraps the browser's low-level GPU API (WebGL) — is used to describe geometry, materials, and lights, and the GPU renders thousands of points simultaneously each frame.

This matters because a chaotic attractor trace involves integrating a system of differential equations hundreds of times per frame, updating a trail of thousands of points, and rendering the result — all in under 16 milliseconds to maintain 60 fps. The CPU alone couldn't do this in time; offloading the geometry update to the GPU is what makes it smooth.

On top of the base render, a **post-processing pipeline** adds visual effects: bloom (a soft glow around bright elements), chromatic aberration (a slight color-channel split that mimics lens optics), and vignette (darkening at screen edges). These are implemented as extra render passes — after the main scene is drawn to a texture, fragment shaders apply these effects before the result reaches the screen. This is the same technique used in games and film visual effects.

**GSAP** (a JavaScript animation library) handles all UI transitions. Mode switches are not simple cross-fades; they're choreographed timelines — the scene fades, the bloom spikes, the old geometry is swapped, the new one fades in, and the bloom settles. The timing is manually sequenced so visual elements don't change all at once.

### The AI Proxy Layer (Cloudflare Edge Function)

This is the most architecturally significant decision in the project, and it solves a real security problem.

When a browser calls an AI service, it needs an API key — a secret credential that identifies who is paying for the usage. If that key is embedded in browser code, any user can open their browser's network inspector and read it. Someone else could then use your key, run up usage, or exceed rate limits on your behalf.

The solution is a **server-side proxy**: a small function that lives on a server, holds the API key securely in an environment variable (not in code), receives the user's question from the browser, adds the key, forwards the request to Groq, and streams the response back.

```
Browser → POST /ask { question, mode, params }
       → Cloudflare Edge Function (holds GROQ_API_KEY in env)
       → Groq API (llm inference)
       → SSE stream → Browser
```

The function deployed here is a **Cloudflare Edge Function** — a serverless function that runs on Cloudflare's global network rather than a fixed server location. "Serverless" means there's no machine to manage; Cloudflare spins up the function on demand and shuts it down after. "Edge" means the function runs close to the user geographically, reducing latency.

### The Streaming Pipeline (SSE)

AI responses can take several seconds to generate. Buffering the full response and delivering it at the end would feel slow and unresponsive.

**Server-Sent Events (SSE)** solve this. The Groq API streams the response as tokens are generated, sending small chunks over an open HTTP connection. The edge function reads these chunks from Groq and re-emits them to the browser as they arrive. The browser appends each chunk to the UI, creating the real-time "typewriter" effect.

Implementing this required building a streaming reader inside the edge function:

```
while (stream has data) {
  read a chunk → decode bytes → split on newlines
  for each line: parse SSE format → extract delta text → re-emit to browser
}
```

Each piece of this pipeline had to handle partial lines (a chunk might cut mid-event), malformed JSON (Groq occasionally sends keep-alive lines), and the terminal `[DONE]` signal. This is lower-level than most web development — it's closer to writing a protocol parser.

### Context Injection

Every AI request includes the current visualization state as a JSON object:

```json
{
  "mode": "chaos",
  "equation": "dx/dt = σ(y − x), ...",
  "params": { "σ": 10, "ρ": 28, "β": 2.667 },
  "extra": { "attractor": "Lorenz", "axes": { "x": "convection", "y": "temperature" } }
}
```

This context is assembled on the client, compacted if it exceeds the token limit, and appended to every message. The AI professor doesn't answer from general knowledge — it answers about the specific configuration currently on screen. This is what allows responses like *"Right now with σ=10, the system is in the chaotic regime — try reducing it below 8 and you'll see the attractor collapse."*

### Multi-Turn Conversation

The Ask tab maintains a conversation thread. Each user message and AI response is stored client-side. On every new submission, the last four exchanges are sent along as conversation history, mapped from the internal `user/model` format to the `user/assistant` format the Groq API expects. A guard loop enforces alternating roles — Groq rejects sequences where two user messages appear in a row. This multi-turn memory is what allows natural follow-up questions to work.

### Session Caching

AI responses are cached in `sessionStorage` (browser memory that clears when the tab closes) keyed by a hash of the question + visualization context. If the same question is asked with the same parameters, the cached response is shown instantly rather than making a new API call. The cache holds a maximum of 60 entries; when full, the oldest entry is evicted. This keeps the app within free-tier rate limits during a session.

---

## Key Engineering Problems Solved

### 1. AI API Key Security

The first and most fundamental architectural decision: never expose the API key to the browser. The solution (the edge function proxy described above) took significant debugging. Errors encountered along the way included:

- API keys accidentally set to OAuth tokens (a completely different credential format)
- Wrong API restriction settings in the Google Cloud Console
- Model names that had been decommissioned between testing and deployment
- Groq free-tier models that changed availability on short notice

The final resolution was making the model configurable via an environment variable (`GROQ_MODEL`) rather than hardcoding it, so future model deprecations can be handled by updating a single config value without a code deploy.

### 2. Real-Time Differential Equation Integration

Chaotic attractors are defined by differential equations — systems like the Lorenz equations define not *where* a point is, but *what direction it moves*. Computing the actual path requires integrating these equations numerically step by step.

Prism uses the **Runge-Kutta 4 (RK4)** method, which approximates the solution by taking a weighted average of four slope estimates per step. This produces much more accurate paths than simpler Euler integration, which would make the attractor appear to drift or diverge incorrectly at normal step sizes.

Each frame, hundreds of RK4 steps are computed in JavaScript, updating the 3D trail geometry and uploading the new points to the GPU. The frame budget for this operation is around 8ms.

### 3. Onboarding Without Interrupting the Experience

A four-step coach mark tour introduces new users to the interface. The technical challenge: creating a "spotlight" effect that darkens the whole screen except for a specific highlighted element, without obscuring the 3D visualization itself.

The solution uses a CSS `box-shadow` trick: the spotlight element is sized to exactly cover the target UI button, and its box-shadow spreads outward to fill the entire screen. The shadow *is* the overlay; the element itself is the transparent "hole." This avoids needing any DOM element layered over the WebGL canvas, which would block pointer events to the visualization.

### 4. Equation Rendering in Real Time

As the user drags sliders, the equation display at the bottom of the screen re-renders the mathematical notation with the current parameter values. This uses **KaTeX**, a fast LaTeX-to-HTML renderer. Each mode defines its own equation template string; when parameters change, the template is filled and passed to KaTeX for re-render on the next animation frame. The challenge was keeping the rendered equation from causing layout shifts or triggering horizontal scroll when long equations exceeded the panel width — fixed by using CSS overflow clipping on the container.

---

## Design Decisions and Tradeoffs

### Why Cloudflare Pages over Netlify

Initial deployment used Netlify, which runs 300 free build minutes per month. Active development consumed this budget quickly. Cloudflare Pages offers 500 **builds** per month (not minutes), which is a much more sustainable limit for a project still being actively developed.

The edge function APIs are nearly identical (both implement the standard Web APIs — `fetch`, `Request`, `Response`, `ReadableStream`), so porting the Netlify Edge Function to a Cloudflare Pages Function required only minor syntax changes to environment variable access.

### Why Groq over Gemini

The original plan used Google's Gemini API. After extended debugging — credentials in wrong formats, wrong API restriction settings, billing account misconfigurations — the decision was made to switch to **Groq**, which uses a straightforward API key (`gsk_...`), an OpenAI-compatible endpoint, and a generous free tier. This also aligned the codebase with the OpenAI API format, which is the dominant standard in production AI tooling.

### Why Context Is Compacted, Not Truncated

Long visualizations (particularly the Surfaces mode with Morse theory lesson context) produce large context objects. Simply truncating the context would silently degrade response quality — the AI would answer without knowing what surface was on screen.

Instead, the `compactContext()` function applies a hierarchical reduction: for simple parameter-lookup queries, it strips lesson notes and returns only the essential fields (mode, equation, params). For full explain/lesson queries, it includes everything, trimming only if the encoded length exceeds 22,000 characters. This keeps token costs low for quick interactions without compromising quality for deep questions.

---

## What This Project Demonstrates

### Full-Stack AI Application Design

Prism is a complete AI application: frontend UI, secure backend proxy, real-time streaming, conversation memory, caching, and context injection. Each of these components had to be designed, debugged, and integrated. The architecture separates concerns clearly — the browser handles rendering and UI, the edge function handles credentials and streaming, the client handles conversation state.

### Real-Time Systems Programming

The visualization engine processes differential equations, updates GPU geometry, and renders post-processed frames inside a fixed budget every 16 milliseconds. This requires thinking about computation time budgets, data flow between CPU and GPU, and the cost of JavaScript object allocation in a tight loop — constraints more typical of game development or real-time data systems than standard web development.

### Security-Conscious Architecture by Default

The first design constraint was "the API key never reaches the browser." This drove the entire backend architecture. Understanding why this matters — and being able to implement the solution — is a foundational skill in AI application development, where nearly every production system routes AI calls through a server-side component for exactly this reason.

### Debugging Under Constraint

A significant portion of this project was diagnosing failures across unfamiliar systems: cloud platform dashboards, API authentication formats, model availability on free tiers, streaming protocol edge cases. Each failure required reading documentation, isolating the variable, and testing a hypothesis — the same systematic approach used in any scientific debugging process, just applied to software infrastructure instead of physical systems.

---

## Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| 3D Rendering | Three.js + WebGL | GPU-accelerated geometry and post-processing |
| Animation | GSAP | Choreographed mode transitions and UI timelines |
| Math Rendering | KaTeX | LaTeX equation rendering in real time |
| Controls | Tweakpane | Parameter sliders with live binding |
| Bundler | Vite | Fast development server, GLSL plugin, tree-shaking |
| AI Model | Groq (qwen/qwen3.6-27b) | Fast inference, OpenAI-compatible streaming API |
| Backend | Cloudflare Pages Functions | Serverless edge proxy for AI calls |
| Hosting | Cloudflare Pages | Auto-deploy from GitHub, global CDN |

---

*Generated August 2026. Live demo: [ai-math-ald.pages.dev](https://ai-math-ald.pages.dev)*
