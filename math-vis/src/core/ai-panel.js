/**
 * ai-panel.js — AI assistant panel
 *
 * Tabs: Ask (free-form chat), Lesson, Variables, Examples.
 * All tabs stream from the Cloudflare Worker / Gemini backend.
 * Falls back to local demo responses when the worker is unavailable.
 *
 * KaTeX math rendering is applied after each stream completes.
 */

import { renderStudyText } from './math-render.js'

// ---------------------------------------------------------------------------
// Per-mode quick chips
// ---------------------------------------------------------------------------

const MODE_CHIPS = {
  lissajous: [
    'What do the frequency ratios do?',
    'Why does it close into a loop?',
    'What does δ control?',
  ],
  fourier: [
    'How do the circles build a wave?',
    'How does drawing mode work?',
    'What does adding more harmonics do?',
  ],
  signal: [
    'What does the waterfall show?',
    'Why is the frequency axis logarithmic?',
    'What does spectral centroid mean?',
  ],
  rose: [
    'Why does changing frequency change the shape?',
    'What does height do?',
    'Why does k control petal count?',
    'What is r = cos(kθ) describing?',
  ],
  surfaces: [
    'What does curvature mean here?',
    'Why does this surface fit inside the grid?',
    'What do the colors represent?',
  ],
  knots: [
    'What do p and q control?',
    'When is this a knot versus a link?',
    'What does curvature show?',
  ],
  complex: [
    'What does color mean in complex analysis?',
    'Why do poles make spikes?',
    'What is a branch cut?',
  ],
  mandelbrot: [
    'What is the boundary showing?',
    'Why is it infinitely detailed?',
    'What does iteration count mean?',
  ],
  julia: [
    'How does the constant c change the shape?',
    'What connects Julia to Mandelbrot?',
    'Why do some c values give dust?',
  ],
  newton: [
    'Why do the basins look fractal?',
    'What changes at a double root?',
    "What does z − f(z)/f′(z) mean?",
  ],
  chaos: [
    'What do the axes represent?',
    'What are the equations measuring?',
    'What does chaos mean here?',
    'What is σ controlling?',
    'Why does the orbit never repeat?',
  ],
  logistic: [
    'Why does doubling happen at r = 3?',
    'What causes the chaotic region?',
    'What is the Feigenbaum constant?',
  ],
  pointcloud: [
    'What are the clusters showing?',
    'Why do the points breathe?',
    'What math governs the motion?',
  ],
}

// ---------------------------------------------------------------------------
// Mock response content
// ---------------------------------------------------------------------------

const EXPLAIN_KEYWORD = {
  'sigma controlling': `σ (sigma) sets how strongly the X oscillator is pulled toward Y — it's the coupling strength. Low σ means weak interaction; above σ ≈ 10 the trajectory locks into the butterfly shape. The Lorenz attractor only becomes chaotic when σ, ρ, and β sit in a specific range. Lorenz originally used σ=10, ρ=28, β=8/3.`,

  'never repeat': `Even though the Lorenz equations are fully deterministic — no randomness — the trajectory never exactly revisits a point. This is deterministic chaos. The attractor has fractal dimension ≈ 2.06, somewhere between a surface and a solid. Nearby trajectories diverge exponentially, measured by the Lyapunov exponent. Positive Lyapunov exponent = sensitive dependence on initial conditions.`,

  'butterfly effect': `The butterfly effect is the sensitive dependence on initial conditions Lorenz discovered in 1963. He re-ran a weather simulation from mid-point, rounding a value from 0.506127 to 0.506, and got a completely different result. The term came from his 1972 talk: "Does the flap of a butterfly's wings in Brazil set off a tornado in Texas?" The formal measure is the Lyapunov exponent — positive means exponential divergence.`,

  'basins look fractal': `Newton's method converges to whichever root it starts nearest to — but near basin boundaries, tiny shifts in starting point flip which root wins. These boundary regions have self-similar structure at every scale: zooming in always reveals all colors interleaved. This fractal basin boundary is a direct consequence of nonlinearity in Newton iteration on the complex plane.`,

  'double root': `At a double root, the derivative f′(z) is also zero, so the Newton step f(z)/f′(z) blows up. Convergence slows from quadratic to linear near that root. Visually the corresponding basin shrinks and becomes more distorted, because the iteration has no strong gradient to follow.`,

  'feigenbaum': `Feigenbaum's constant δ ≈ 4.669 is the limiting ratio between successive bifurcation points in the period-doubling cascade. What's remarkable: it's universal — it appears in every one-dimensional map with a quadratic maximum, not just the logistic map. Discovered by Mitchell Feigenbaum in 1975, it was the first sign that chaos has quantitative universal structure.`,

  'doubling happen': `At r = 3 the single stable fixed point loses stability through a period-doubling bifurcation. The fixed point becomes unstable and two new stable points appear — the orbit bounces between them. The cascade continues: each pair bifurcates again at a slightly higher r. The ratio between successive bifurcation points converges to Feigenbaum's constant δ ≈ 4.669.`,

  'reaction-diffusion': `Gray-Scott models two chemicals: U (reactant) and V (activator). V consumes U to reproduce (the uv² autocatalytic term), while a feed rate replenishes U and a kill rate removes V. At certain feed/kill combinations, diffusion and reaction balance to produce stable patterns — spots, stripes, spirals. This is Turing instability: a uniform state becomes unstable to spatially varying perturbations.`,

  'gibbs': `The Gibbs phenomenon is the overshoot that appears at discontinuities when a signal is reconstructed from a finite Fourier series. No matter how many harmonics you add, the overshoot near a jump stays at about 9% of the jump height. It only narrows — it doesn't disappear. This is because the partial sums converge in the L² sense (energy), not pointwise, at discontinuities.`,
}

const EXPLAIN_DEFAULT = {
  lissajous: `Lissajous figures trace the path of a point driven by two independent sinusoidal frequencies — one on X, one on Y. When the ratio a/b is rational (like 3/2 or 5/4), the path closes into a loop. Irrational ratios produce open curves that fill the bounding box over time. The phase δ rotates the figure in parameter space, shifting the geometry from figures-of-eight to complex crossed knots.`,
  fourier: `Fourier's insight: any periodic signal decomposes into sine waves at integer multiples of a base frequency. Each rotating circle represents one harmonic. The first circle sets the fundamental; each subsequent one adds a smaller correction. The tip traces the reconstructed signal. More harmonics sharpens discontinuities — but the Gibbs overshoot near jumps never fully disappears.`,
  signal: `Signal mode turns sound into geometry. The waterfall view stores recent FFT amplitude curves: frequency runs left to right, loudness rises upward, and time recedes into depth. Ribbon view shows the waveform while spectral centroid pushes it forward when the sound gets brighter. Polar view wraps the waveform around a circle, making periodic tones look stable and noise look jagged.`,
  rose: `Polar rose r = cos(kθ) produces k petals when k is odd, 2k petals when k is even. The petal count emerges from how many times the radius completes a full oscillation as θ sweeps 0 to 2π. Each petal is traced when cos(kθ) reaches its maximum. Higher k means more petals compressed into the same circle — each becomes narrower.`,
  mandelbrot: `The Mandelbrot set boundary marks where z → z² + c transitions from bounded to unbounded. Points inside: z stays bounded forever. Points outside: z escapes to infinity. The coloring shows how quickly each point escapes. The boundary is infinitely detailed because it separates two fundamentally different behaviors — no amount of zooming fully resolves which side a boundary point is on.`,
  julia: `Julia sets are the filled boundaries of z → z² + c for a fixed c. The Mandelbrot set maps which c values give connected Julia sets — points inside Mandelbrot correspond to connected Julia sets; outside gives Cantor dust. Changing c moves through a continuous family of shapes: simple ovals (c near origin) → spirals → disconnected dust (c far from origin).`,
  newton: `Newton's fractal shows, for each starting point z, which root the Newton iteration converges to. The colored basins are the regions of attraction. Near boundaries, iteration bounces chaotically before settling — that indeterminate region is the source of the fractal structure. Adding roots increases polynomial degree and creates new basins with more intricate boundaries.`,
  chaos: `The Lorenz system models atmospheric convection. Three coupled equations describe temperature difference (X), gradient (Y), and convection (Z). For σ=10, ρ=28, β=8/3 the system is chaotic: trajectories spiral around two unstable fixed points (the "wings") and switch unpredictably. The attractor has fractal dimension ≈ 2.06 — neither a surface nor a volume, something in between.`,
  logistic: `xₙ₊₁ = r·xₙ·(1−xₙ) models population dynamics with a carrying capacity. The (1−x) term prevents unbounded growth. For r < 1: population dies. For 1 < r < 3: stable fixed point. At r = 3: period-doubling begins. By r ≈ 3.57: fully chaotic. The bifurcation diagram maps all long-term behaviors simultaneously — each vertical slice shows the attractor for that r.`,
  pointcloud: `2200 points distributed across four Gaussian clusters in 3D space. Each cluster has a center, per-axis scale (variance), and color. Points breathe (oscillate in size) with individual phases and rotate as a group. Instanced rendering draws all 2200 in a single GPU draw call. This is the foundation for real point cloud datasets from LiDAR, photogrammetry, or molecular simulation.`,
}

function formatParams(params = {}) {
  const entries = Object.entries(params)
  if (!entries.length) return 'no exposed parameters'
  return entries.map(([key, value]) => {
    if (typeof value === 'number') return `${key}=${Number.isInteger(value) ? value : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
    return `${key}=${value}`
  }).join(', ')
}

function explainChaos(question, ctx) {
  const q = question.toLowerCase()
  const extra = ctx.extra ?? {}
  const name = extra.attractor ?? 'current attractor'
  const equations = extra.equations?.filter(line => !/^[a-zαβγσρ=0-9.\s-]+$/i.test(line)).join('\n') ?? ctx.equation
  const axes = extra.axes ?? {}
  const params = formatParams(extra.attractorParams)
  const shadow = extra.chaos?.shadowDistance
  const shadowText = typeof shadow === 'number'
    ? `Right now the shadow trajectory started only 0.001 units away, and its separation is about ${shadow.toFixed(3)} in simulation space.`
    : 'The shadow trajectory starts only 0.001 units away from the main one.'

  if (/(axis|axes|x.*y.*z|represent|coordinate)/i.test(q)) {
    return `In ${name}, the X, Y, and Z axes are not physical distance like a room. They are the three state variables of the differential equation. For Lorenz specifically, X tracks convective circulation, Y tracks temperature difference between rising and falling flow, and Z tracks vertical temperature-profile distortion. The curve is the system's state moving through this abstract phase space: one point means "the whole system is currently at this X/Y/Z state."`
  }

  if (/(equation|measure|measuring|ẋ|dx|sigma|rho|beta|parameter)/i.test(q)) {
    return `The ${name} equations measure rates of change. They do not directly draw the curve; they answer "if the system is currently at (x, y, z), which direction should it move next?"\n\n${equations}\n\nThe renderer integrates those rates with RK4, so each frame advances the state a little. Parameters set the personality of the flow. For the current attractor: ${params}. In Lorenz, σ controls how fast X is pulled toward Y, ρ is the heating/forcing that makes the fixed points unstable, and β damps Z.`
  }

  if (/(chaos|chaotic|butterfly|initial|diverge|unpredict)/i.test(q)) {
    return `Chaos here means deterministic unpredictability. The equations contain no randomness, but nearby starting points separate exponentially. ${shadowText} That is why long-term prediction fails: two states that look identical at first can end up on different wings of the attractor. The motion is not random, though. It stays confined to the same folded shape, which is why chaos has structure instead of becoming noise.`
  }

  return EXPLAIN_DEFAULT.chaos
}

function explainRose(question, ctx) {
  const q = question.toLowerCase()
  const p = ctx.extra?.params ?? ctx.params ?? {}
  const k = Number(p.k ?? 3)
  const n = Number(p.n ?? 0)
  const h = Number(p.h ?? 0)
  const nearInteger = Math.abs(k - Math.round(k)) < 0.001
  const petalHint = nearInteger
    ? (Math.round(k) % 2 === 0 ? `${2 * Math.round(k)} petals because k is even` : `${Math.round(k)} petals because k is odd`)
    : 'a longer, non-integer pattern because k does not line up cleanly with one full turn'

  if (/(frequency|freq|k|petal|shape|change)/i.test(q)) {
    return `The frequency k changes the shape because r = cos(kθ) decides how quickly the radius pulses while θ rotates around the circle. θ is the angle around the origin; r is how far the point is from the center. When k is larger, the radius completes more in-out cycles during one revolution, so more petals are squeezed into the same circle.\n\nRight now k=${k.toFixed(2)}, so you get ${petalHint}. Integer k values close cleanly. Non-integer k values drift against the rotation, so the curve takes more turns to close or can feel like it keeps weaving.`
  }

  if (/(height|h|z|3d|depth|lift)/i.test(q)) {
    return `Height h does not change the polar rose formula in the XY plane. It lifts the curve into 3D with z = sin(nθ)h. The n value controls how often the curve moves up and down as it travels around the rose, and h controls how tall that lift is.\n\nRight now n=${n.toFixed(2)} and h=${h.toFixed(2)}. If h is 0, the rose is flat. As h increases, the same petals become a ribbon-like spatial path, which is why the curve starts to feel like it has topology and depth.`
  }

  if (/(equation|describe|describing|cos|polar|radius)/i.test(q)) {
    return `r = cos(kθ) is a polar equation. Instead of plotting y against x, it rotates an angle θ around the origin and computes a radius r. Positive r places the point in the current direction; negative r reflects it through the origin, which is one reason rose curves create symmetrical petals.\n\nThe Cartesian position is x = r cos(θ), y = r sin(θ). This app optionally adds z = sin(nθ)h so the rose can lift out of the plane.`
  }

  return EXPLAIN_DEFAULT.rose
}

function explainWithContext(question, ctx) {
  if (ctx.mode === 'chaos') return explainChaos(question, ctx)
  if (ctx.mode === 'rose') return explainRose(question, ctx)
  return null
}

function studyFallback(title, text) {
  return `## 1. Big Idea
${text}

## 2. What to Look For
- Watch how the shape changes as the live parameters move.
- Compare repeated structure, symmetry, curvature, or divergence instead of treating the image as decoration.
- Ask the AI for a variable guide when a symbol in the equation feels unclear.

## 3. Try This
1. Change one parameter slowly and watch which part of the visual responds first.
2. Pause the animation, then adjust the same parameter again.
3. Ask: "what does this variable measure?" for ${title}.`
}

function demoPrefix(reason = '') {
  return `## Demo Mode
The AI Worker is not connected, so this is a local preview response. To get a real answer to your exact question, run the Worker with \`npm run dev:ai\` in a second terminal while the Vite app is running.${reason ? `\n\nReason: ${reason}` : ''}

`
}

// Mock param suggestions per mode (action.params must match the mode's actual this.params keys)
const MOCK_PARAMS = {
  chaos: {
    text: `I'll increase σ to 16 and ρ to 38. σ strengthens coupling between X and Y; ρ raises the threshold where fixed points lose stability. Together they push the system deeper into chaos — faster wing-switching and more erratic trajectories.`,
    description: 'σ → 16, ρ → 38  (deeper chaos, faster wing-switching)',
    params: { sigma: 16, rho: 38 },
  },
  logistic: {
    text: `I'll speed up the orbit animation so the amber dot cycles faster through the attractor values, making the periodic and chaotic regions visually clearer.`,
    description: 'orbitSpeed → 12  (faster orbit animation)',
    params: { orbitSpeed: 12 },
  },
  default: {
    text: `Parameter control will provide live suggestions once the Cloudflare Worker backend is connected. The action card below shows the proposed change format that will be used.`,
    description: 'Example action — will apply when Worker is connected',
    params: {},
  },
}

// Known equation patterns → mode switch actions
const EQUATION_PATTERNS = [
  {
    re: /z\s*\^?\s*3\s*[-−]\s*1|z\^3\s*=\s*1|cubic roots of unity/i,
    text: `z³ − 1 = 0 has three roots — the cube roots of unity — at angles 0°, 120°, and 240° on the unit circle. I'll switch to Newton's fractal and place those roots. You'll see three symmetric basins of attraction.`,
    description: "Switch to Newton's Fractal — z³ − 1 = 0 (3 roots)",
    action: { type: 'switch_mode', mode: 'newton' },
  },
  {
    re: /z\s*\^?\s*4\s*[-−]\s*1|z\^4\s*=\s*1|fourth roots/i,
    text: `z⁴ − 1 = 0 has four roots at 1, i, −1, −i — the fourth roots of unity at 90° intervals. I'll switch to Newton's fractal with those four roots.`,
    description: "Switch to Newton's Fractal — z⁴ − 1 = 0 (4 roots)",
    action: { type: 'switch_mode', mode: 'newton' },
  },
  {
    re: /r\s*=\s*cos\s*\(\s*\d+/i,
    text: `That's a polar rose equation. I'll switch to the Rose mode — set k in the controls to match the value in your equation.`,
    description: 'Switch to Rose Curves',
    action: { type: 'switch_mode', mode: 'rose' },
  },
  {
    re: /lorenz|lorenz attractor|butterfly attractor/i,
    text: `The Lorenz attractor is in Chaos mode. Switching now.`,
    description: 'Switch to Lorenz Attractor (Chaos mode)',
    action: { type: 'switch_mode', mode: 'chaos' },
  },
  {
    re: /logistic|r\s*=\s*\d.*1\s*[-−]\s*x|period.doub/i,
    text: `That maps to the Logistic Map — x_{n+1} = r·x·(1−x). Switching now.`,
    description: 'Switch to Logistic Map',
    action: { type: 'switch_mode', mode: 'logistic' },
  },
]

// ---------------------------------------------------------------------------
// Session response cache
// ---------------------------------------------------------------------------
// Keyed by mode + requestKind + normalised question.
// Only caches explain-intent Ask responses and generated tab content
// (lesson / variables / examples) — never params or equation intents, since
// those depend on live parameter state which changes every slider move.

const CACHE_PREFIX = 'prism-ai-v1:'
const CACHE_MAX    = 60   // max entries per session

function cacheKey(mode, requestKind, question) {
  return CACHE_PREFIX + [mode, requestKind, question.toLowerCase().trim()].join('|')
}

function cacheGet(mode, requestKind, question) {
  try {
    return sessionStorage.getItem(cacheKey(mode, requestKind, question)) ?? null
  } catch { return null }
}

function cacheSet(mode, requestKind, question, text) {
  try {
    // Evict oldest entries if approaching the limit
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX))
    if (keys.length >= CACHE_MAX) sessionStorage.removeItem(keys[0])
    sessionStorage.setItem(cacheKey(mode, requestKind, question), text)
  } catch { /* sessionStorage full or blocked — silently skip */ }
}

// ---------------------------------------------------------------------------
// Intent classifier
// ---------------------------------------------------------------------------

function classifyIntent(text) {
  const t = text.toLowerCase()
  if (/z\s*\^|z\^|r\s*=\s*cos|lorenz|logistic|cubic roots|fourth roots|quartic|period.doub/i.test(t)) return 'equation'
  if (/\b(more|less|faster|slower|higher|lower|bigger|smaller|increase|decrease|make it|set|change|adjust|turn up|turn down|boost|reduce|show me)\b/i.test(t)) return 'params'
  return 'explain'
}

// ---------------------------------------------------------------------------
// AiPanel class
// ---------------------------------------------------------------------------

const MODE_DISPLAY_NAMES = {
  lissajous: 'Lissajous Curves',
  fourier:   'Fourier Lab',
  signal:    'Signal',
  rose:      'Rose Curves',
  mandelbrot:'Mandelbrot Set',
  julia:     'Julia Sets',
  newton:    "Newton's Fractal",
  chaos:     'Lorenz Attractor',
  surfaces:  'Surfaces',
  knots:     'Knots',
  complex:   'Complex Analysis',
  logistic:  'Logistic Map',
  pointcloud:'Point Cloud',
}

export class AiPanel {
  /**
   * @param {HTMLElement} element  the #ai-panel DOM element
   * @param {object} opts
   *   getContext()            → { mode, equation, params }
   *   applyAction(action)     → void  (called only after user confirms Apply)
   *   switchMode(name)        → void
   *   showToast(msg)          → void
   */
  constructor(element, { getContext, applyAction, switchMode, showToast, aiEndpoint = '/ask' }) {
    this._el          = element
    this._getCtx      = getContext
    this._applyAction = applyAction
    this._switchMode  = switchMode
    this._showToast   = showToast
    this._aiEndpoint  = aiEndpoint

    this._open          = false
    this._streaming     = false
    this._undoStack     = []
    this._pendingAction = null
    this._history       = []   // { role: 'user'|'assistant', text: string }[]

    // DOM refs
    this._label       = element.querySelector('.ai-label')
    this._modeLabel   = element.querySelector('.ai-mode-label')
    this._response    = element.querySelector('.ai-response')
    this._actionCard  = element.querySelector('.ai-action-card')
    this._actionType  = element.querySelector('.ai-action-type')
    this._actionDesc  = element.querySelector('.ai-action-desc')
    this._actionDeltas = element.querySelector('.ai-action-deltas')
    this._applyBtn    = element.querySelector('.ai-apply-btn')
    this._undoBtn     = element.querySelector('.ai-undo-btn')
    this._chips       = element.querySelector('.ai-chips')
    this._clearBtn    = element.querySelector('.ai-clear-btn')
    this._input       = element.querySelector('.ai-input')
    this._sendBtn     = element.querySelector('.ai-send-btn')
    this._closeBtn    = element.querySelector('.ai-close')
    this._tabs        = [...element.querySelectorAll('.ai-tab')]
    this._panels      = [...element.querySelectorAll('.ai-tab-panel')]
    this._outputs     = {
      lesson:    element.querySelector('[data-panel="lesson"] .ai-tab-output'),
      variables: element.querySelector('[data-panel="variables"] .ai-tab-output'),
      examples:  element.querySelector('[data-panel="examples"] .ai-tab-output'),
    }
    this._generateBtns = [...element.querySelectorAll('.ai-generate-btn')]

    this._bind()
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  toggle() { this._open ? this.close() : this.open() }

  open() {
    this._open = true
    this._el.classList.add('open')
    document.body.classList.add('ai-open')
    requestAnimationFrame(() => this._input.focus())
  }

  close() {
    this._open = false
    this._el.classList.remove('open')
    document.body.classList.remove('ai-open')
  }

  /** Called by main.js whenever the active mode changes. */
  setMode(name) {
    this._modeLabel.textContent = MODE_DISPLAY_NAMES[name] ?? name
    this._renderChips(MODE_CHIPS[name] ?? [])
  }

  ask(question) {
    if (!question || this._streaming) return
    this.open()
    this._setTab('ask')
    this._input.value = question
    this._submit()
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _bind() {
    this._closeBtn.addEventListener('click', () => this.close())
    this._sendBtn.addEventListener('click',  () => this._submit())
    this._applyBtn.addEventListener('click', () => this._apply())
    this._undoBtn.addEventListener('click',  () => this._undo())
    this._clearBtn?.addEventListener('click', () => {
      this._history = []
      this._response.innerHTML = ''
      this._clearBtn.hidden = true
    })

    this._tabs.forEach(tab => {
      tab.addEventListener('click', () => this._setTab(tab.dataset.tab))
    })

    this._generateBtns.forEach(btn => {
      btn.addEventListener('click', () => this._generateTab(btn.dataset.generate))
    })

    this._input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this._submit()
      }
    })
  }

  _setTab(name = 'ask') {
    this._tabs.forEach(tab => {
      const active = tab.dataset.tab === name
      tab.classList.toggle('active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    this._panels.forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === name)
    })
  }

  _renderChips(questions) {
    this._chips.innerHTML = ''
    questions.forEach(q => {
      const btn = document.createElement('button')
      btn.className   = 'ai-chip'
      btn.textContent = q
      btn.addEventListener('click', () => {
        this._input.value = q
        this._submit()
      })
      this._chips.appendChild(btn)
    })
  }

  _submit() {
    const question = this._input.value.trim()
    if (!question || this._streaming) return
    this._input.value = ''
    this._hideActionCard()

    // Append user message to conversation thread
    this._history.push({ role: 'user', text: question })
    const userBubble = document.createElement('div')
    userBubble.className = 'ai-message ai-message--user'
    userBubble.textContent = question
    this._response.appendChild(userBubble)

    // Create empty assistant bubble — the streaming response fills it
    const assistantBubble = document.createElement('div')
    assistantBubble.className = 'ai-message ai-message--assistant'
    this._response.appendChild(assistantBubble)
    this._response.scrollTop = this._response.scrollHeight

    if (this._clearBtn) this._clearBtn.hidden = false

    this._respond(question, {
      target:       assistantBubble,
      scrollTarget: this._response,
      requestKind:  'ask',
    })
  }

  _tabPrompt(kind) {
    if (kind === 'lesson') {
      return `Write a step-by-step textbook lesson for the current visualization.

Use exactly these section headings:
## 1. Big Idea
## 2. Equation
## 3. Symbols
## 4. What the Visual Is Showing
## 5. Parameter Experiments
## 6. Why It Matters

Rules:
- Use short paragraphs, never a wall of text.
- Put the central equation in $$...$$.
- Define every symbol the first time it appears.
- Explain what the student should look at on screen.
- End with 2 or 3 concrete experiments using the current controls.`
    }
    if (kind === 'variables') {
      return `Create a textbook-style variable guide for the current visualization.

Use exactly these section headings:
## 1. Equation Map
## 2. State Variables
## 3. Parameters
## 4. What Changes When You Move a Slider
## 5. Common Misreadings

Rules:
- Use bullets for symbol definitions.
- Use $...$ notation for symbols.
- For every parameter, explain what increasing it does mathematically and what changes visually.`
    }
    return `Give concrete real-world examples for the current visualization.

Use exactly these section headings:
## 1. The Pattern in the App
## 2. Real Examples
## 3. How to Read the Connection
## 4. Try This

Rules:
- Give 3 to 5 examples.
- Each example should be a short labeled paragraph.
- Include equations with $...$ only when they genuinely clarify the example.
- Connect each example to something visible in the current visualization.`
  }

  _generateTab(kind) {
    if (!kind || this._streaming) return
    this._setTab(kind)
    const target = this._outputs[kind]
    this._respond(this._tabPrompt(kind), { target, scrollTarget: target, requestKind: kind })
  }

  _thinkingLabel(requestKind = 'ask') {
    if (requestKind === 'lesson') return 'Composing lesson'
    if (requestKind === 'variables') return 'Mapping symbols'
    if (requestKind === 'examples') return 'Finding examples'
    return 'Analyzing visual state'
  }

  _showThinking(target, requestKind = 'ask') {
    target.innerHTML = `
      <div class="ai-thinking" role="status" aria-live="polite">
        <div class="ai-thinking-orbit" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="ai-thinking-copy">
          <strong>${this._thinkingLabel(requestKind)}</strong>
          <span>Reading the equation, controls, and current visual context.</span>
        </div>
        <div class="ai-thinking-bars" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </div>
      </div>
    `
    target.scrollTop = 0
    return target.querySelector('.ai-thinking')
  }

  async _respond(question, { target = this._response, scrollTarget, requestKind = 'ask' } = {}) {
    const _scroll = scrollTarget ?? target
    const intent  = requestKind === 'ask' ? classifyIntent(question) : requestKind
    const ctx     = this._getCtx({ question, requestKind, intent })
    this._lastDemoReason = ''

    // Cache hit — explain and tab content are deterministic enough to reuse.
    // Params/equation intents are skipped because they depend on live state.
    const cacheable = intent === 'explain' || requestKind !== 'ask'
    if (cacheable) {
      const cached = cacheGet(ctx.mode, requestKind, question)
      if (cached) {
        target.innerHTML = renderStudyText(cached)
        _scroll.scrollTop = _scroll.scrollHeight
        if (requestKind === 'ask') this._history.push({ role: 'assistant', text: cached })
        return
      }
    }

    try {
      const handled = await this._respondFromWorker(question, ctx, {
        target, scrollTarget: _scroll, requestKind, intent, cacheable,
      })
      if (handled) return
    } catch (err) {
      console.info('[AI] Worker unavailable; using local demo response.', err)
      this._lastDemoReason = err instanceof Error ? err.message : 'Request failed'
      this._showToast?.('AI Worker unavailable; using local demo')
    }

    await this._respondMock(question, ctx, { target, scrollTarget: _scroll, requestKind })
  }

  async _respondMock(question, ctx = this._getCtx(), { target = this._response, requestKind = 'ask' } = {}) {
    if (requestKind !== 'ask') {
      const title = ctx.lessonContext?.title ?? MODE_DISPLAY_NAMES[ctx.mode] ?? ctx.mode
      const text = requestKind === 'lesson'
        ? `## 1. Lesson Preview
The live AI Worker will turn this tab into a professor-style lesson for ${title}.

## 2. What It Will Cover
- The big idea behind the visualization.
- The central equation, rendered like a textbook.
- What every variable represents.
- How parameter changes alter the behavior on screen.
- Real-world examples and suggested experiments.`
        : requestKind === 'variables'
          ? `## 1. Variable Guide Preview
Once the AI Worker is connected, this tab will generate a symbol-by-symbol guide for ${title}.

## 2. Reading Plan
- What each variable represents.
- Why it appears in the equation.
- What happens mathematically when it changes.
- What the same change looks like in the visualization.`
          : `## 1. Examples Preview
Once the AI Worker is connected, this tab will connect ${title} to real examples.

## 2. What the Examples Will Do
- Name the real phenomenon.
- Show the matching mathematical structure.
- Point back to something visible in the app.`
      await this._streamText(demoPrefix(this._lastDemoReason) + text, target, requestKind)
      return
    }

    const intent = classifyIntent(question)
    let text     = ''
    let action   = null

    if (intent === 'equation') {
      const match = EQUATION_PATTERNS.find(p => p.re.test(question))
      if (match) {
        text   = match.text
        action = { ...match.action, _description: match.description }
      } else {
        text = `I can map equations to visualizations. Connect the Cloudflare Worker to unlock full equation parsing. For now, try: "z³ − 1", "z⁴ − 1", "r = cos(3θ)", or "Lorenz attractor".`
      }

    } else if (intent === 'params') {
      const m = MOCK_PARAMS[ctx.mode] ?? MOCK_PARAMS.default
      text   = m.text
      if (m.params && Object.keys(m.params).length > 0) {
        action = { type: 'set_params', params: m.params, _description: m.description }
      }

    } else {
      // Explain: keyword match first, then mode default
      const q        = question.toLowerCase()
      const keyMatch = Object.keys(EXPLAIN_KEYWORD).find(k =>
        k.split(' ').every(word => q.includes(word))
      )
      text = explainWithContext(question, ctx)
      text = text ?? (keyMatch
        ? EXPLAIN_KEYWORD[keyMatch]
        : (EXPLAIN_DEFAULT[ctx.mode] ?? `The AI backend will provide a contextual explanation of ${ctx.mode} once the Cloudflare Worker is connected.`))
      text = studyFallback(ctx.lessonContext?.title ?? MODE_DISPLAY_NAMES[ctx.mode] ?? ctx.mode, text)
    }

    await this._streamText(demoPrefix(this._lastDemoReason) + text, target, requestKind)

    if (action) {
      this._pendingAction = action
      this._showActionCard(action)
    }
  }

  _workerPayload(question, ctx, requestKind, intent) {
    const payload = {
      question,
      mode: ctx.mode,
      equation: ctx.equation,
      params: ctx.params,
      requestKind,
      intent,
    }

    if (ctx.extra) payload.extra = ctx.extra
    if (ctx.schema) payload.schema = ctx.schema
    if (ctx.lessonContext && (requestKind !== 'ask' || intent === 'explain')) {
      payload.lessonContext = ctx.lessonContext
    }

    // Include prior conversation turns for Ask tab so the AI has context.
    // Exclude the last entry (current user question, already in userMessage).
    if (requestKind === 'ask' && this._history.length > 1) {
      payload.conversationHistory = this._history
        .slice(0, -1)       // prior turns only
        .slice(-4)          // cap at 2 exchanges (4 messages) to stay in token budget
        .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', content: m.text }))
    }
    // Adaptive token budget — allocate more for deep explanations, less for
    // quick parameter or equation lookups. The worker caps at its own MAX_TOKENS.
    if (requestKind === 'ask') {
      if (intent === 'params')    payload.responseLimit = 320
      else if (intent === 'equation') payload.responseLimit = 480
      else                            payload.responseLimit = 1200  // full explain
    } else {
      payload.responseLimit = requestKind === 'lesson' ? 2400 : 1600
    }
    return payload
  }

  _formatWorkerError(status, message = '') {
    const text = String(message)
    const isGeminiQuota =
      /quota exceeded|exceeded your current quota|rate-limits|rate-limit/i.test(text) ||
      /"code"\s*:\s*429|code:\s*429/i.test(text)

    if (isGeminiQuota) {
      return 'Gemini free quota exceeded. Daily request quotas reset at midnight Pacific Time; minute-based limits usually clear after about a minute.'
    }

    if (status === 429) {
      return 'Rate limit reached. Wait about a minute and try again, or use the local Math Insight panel while quota clears.'
    }

    if (status >= 500) {
      const detail = text
        .replace(/\s+/g, ' ')
        .slice(0, 220)
      return `AI service error (${status})${detail ? `: ${detail}` : '.'}`
    }

    return `AI request failed (${status}).`
  }

  async _respondFromWorker(question, ctx, { target = this._response, scrollTarget, requestKind = 'ask', intent = 'explain', cacheable = false } = {}) {
    const _scroll = scrollTarget ?? target
    this._streaming = true
    this._label.classList.add('streaming')
    let thinking = this._showThinking(target, requestKind)
    let response

    try {
      response = await fetch(this._aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._workerPayload(question, ctx, requestKind, intent)),
      })
    } catch (err) {
      thinking?.remove()
      this._streaming = false
      this._label.classList.remove('streaming')
      throw err
    }

    if (!response.ok || !response.body) {
      let message = ''
      try {
        const data = await response.clone().json()
        message = data.message || data.error || ''
      } catch {
        try { message = await response.text() } catch { message = '' }
      }
      thinking?.remove()
      this._streaming = false
      this._label.classList.remove('streaming')

      // Surface real API errors instead of silently falling back to demo.
      // Worker 502s can wrap upstream Gemini 429 quota messages, so inspect
      // the body rather than only the HTTP status.
      if (response.status === 429 || response.status >= 500) {
        target.innerHTML = `<p class="ai-error">${this._formatWorkerError(response.status, message)}</p>`
        target.scrollTop = 0
        return true
      }

      // 4xx or unknown — fall through to demo
      this._lastDemoReason = `Worker returned HTTP ${response.status}${message ? ` — ${String(message).slice(0, 220)}` : ''}`
      return false
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      const data = await response.json()
      thinking?.remove()
      this._streaming = false
      this._label.classList.remove('streaming')
      await this._streamText(data.text ?? '', target, requestKind)
      if (data.action) {
        this._pendingAction = data.action
        this._showActionCard(data.action)
      }
      return true
    }

    const cursor = document.createElement('span')
    cursor.className = 'ai-cursor'

    let rendered = ''
    let pendingAction = null
    let buffer = ''
    let eventType = 'message'
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    const commitDelta = delta => {
      if (thinking) {
        thinking.remove()
        thinking = null
        target.innerHTML = ''
        target.appendChild(cursor)
      }
      rendered += delta
      target.textContent = rendered
      target.appendChild(cursor)
      _scroll.scrollTop = _scroll.scrollHeight
    }

    const handleEvent = raw => {
      const lines = raw.split('\n')
      const dataLines = []
      eventType = 'message'
      for (const line of lines) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      const dataText = dataLines.join('\n')
      if (!dataText || dataText === '[DONE]') return

      const payload = JSON.parse(dataText)
      if (eventType === 'delta' || payload.type === 'delta') {
        commitDelta(payload.delta ?? payload.text ?? '')
      } else if (eventType === 'action' || payload.type === 'action') {
        pendingAction = payload.action
      } else if (eventType === 'error' || payload.type === 'error') {
        throw new Error(payload.message ?? 'AI stream error')
      }
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) handleEvent(chunk)
      }
      if (buffer.trim()) handleEvent(buffer)
    } finally {
      thinking?.remove()
      cursor.remove()
      this._streaming = false
      this._label.classList.remove('streaming')
      // Final KaTeX render pass — converts $...$ to rendered math
      if (rendered.trim()) {
        target.innerHTML = renderStudyText(rendered.trim())
        _scroll.scrollTop = _scroll.scrollHeight
        if (cacheable) cacheSet(ctx.mode, requestKind, question, rendered.trim())
        // Commit to conversation history (Ask tab only)
        if (requestKind === 'ask') this._history.push({ role: 'assistant', text: rendered.trim() })
      }
    }

    if (pendingAction) {
      this._pendingAction = pendingAction
      this._showActionCard(pendingAction)
    }
    return true
  }

  async _streamText(text, target = this._response, requestKind = 'ask') {
    this._streaming = true
    this._label.classList.add('streaming')
    let thinking = this._showThinking(target, requestKind)

    const cursor = document.createElement('span')
    cursor.className = 'ai-cursor'

    const words = text.split(' ')
    let rendered = ''

    await new Promise(r => setTimeout(r, 360))
    if (thinking) {
      thinking.remove()
      thinking = null
      target.innerHTML = ''
      target.appendChild(cursor)
    }

    for (const word of words) {
      await new Promise(r => setTimeout(r, 18 + Math.random() * 32))
      rendered += (rendered ? ' ' : '') + word
      target.textContent = rendered
      target.appendChild(cursor)
      target.scrollTop = target.scrollHeight
    }

    cursor.remove()
    this._streaming = false
    this._label.classList.remove('streaming')
    if (rendered.trim()) {
      target.innerHTML = renderStudyText(rendered.trim())
      target.scrollTop = target.scrollHeight
    }
  }

  _formatValue(value) {
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
    if (typeof value === 'boolean') return value ? 'on' : 'off'
    if (value == null) return '—'
    return String(value)
  }

  _showActionCard(action) {
    const ctx = this._getCtx()
    this._actionType.textContent = action.type === 'switch_mode' ? 'Mode Switch' : 'Parameter Proposal'
    this._actionDesc.textContent = action._description ?? 'Review this proposed change before applying it.'
    this._actionDeltas.innerHTML = ''

    if (action.type === 'set_params') {
      Object.entries(action.params ?? {}).forEach(([key, next]) => {
        const row = document.createElement('div')
        row.className = 'ai-action-delta'

        const name = document.createElement('strong')
        name.textContent = key
        const values = document.createElement('span')
        values.textContent = `${this._formatValue(ctx.params?.[key])} → ${this._formatValue(next)}`

        row.append(name, values)
        this._actionDeltas.appendChild(row)
      })
    }

    if (action.type === 'switch_mode') {
      const row = document.createElement('div')
      row.className = 'ai-action-delta'
      const name = document.createElement('strong')
      name.textContent = 'mode'
      const values = document.createElement('span')
      values.textContent = `${ctx.mode ?? 'current'} → ${action.mode}`
      row.append(name, values)
      this._actionDeltas.appendChild(row)
    }

    this._actionCard.hidden = false
    this._undoBtn.hidden = this._undoStack.length === 0
  }

  _hideActionCard() {
    this._actionCard.hidden = true
    this._pendingAction = null
  }

  _apply() {
    if (!this._pendingAction) return
    const action = this._pendingAction

    if (action.type === 'set_params') {
      // Save undo snapshot before mutating
      const ctx = this._getCtx()
      this._undoStack.push({ type: 'set_params', params: { ...ctx.params } })
      this._applyAction(action)
      this._showToast('Parameters applied')
    } else if (action.type === 'switch_mode') {
      // Mode switches are one-way — no undo
      this._switchMode(action.mode)
      this._showToast(`Switching to ${action.mode}`)
    }

    this._hideActionCard()
  }

  _undo() {
    const prev = this._undoStack.pop()
    if (!prev) return
    this._applyAction({ type: 'set_params', params: prev.params })
    this._showToast('Undone')
    this._undoBtn.hidden = this._undoStack.length === 0
  }
}
