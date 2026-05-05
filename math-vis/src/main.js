/**
 * main.js — entry point + UI orchestration
 *
 * Five interaction layers that together make the UI feel reactive:
 *
 *   1. Mouse parallax    — renderer tilts the scene as the mouse moves (renderer.js)
 *   2. Magnetic buttons  — nav buttons attract the cursor and snap back elastically
 *   3. Char stagger      — each letter in a button waves independently on hover
 *   4. Post-fx on switch — bloom + chroma spike on mode transition then settle
 *   5. GSAP timeline     — mode switch is a choreographed sequence, not parallel fades
 */

import './style.css'
import { gsap }                from 'gsap'
import { Renderer }            from './core/renderer.js'
import { LissajousMode }       from './modes/lissajous.js'
import { FourierMode }         from './modes/fourier.js'
import { RoseMode }            from './modes/rose.js'
import { ChaosMode }           from './modes/chaos.js'
import { SurfacesMode }          from './modes/surfaces.js'
import { KnotsMode }             from './modes/knots.js'
import { ComplexMode }           from './modes/complex.js'
import { BackgroundParticles } from './core/particles.js'
import { AudioReactive }       from './core/audio.js'
import { SpatialVolume }       from './core/spatial-volume.js'
import { AiPanel }             from './core/ai-panel.js'
import { renderMath }          from './core/math-render.js'
import { annotatePanel }       from './core/ui.js'

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const renderer = new Renderer()
let   prevTime = performance.now()
const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || '/ask'

// Background curl-noise particle field (lives in the main scene)
const particles = new BackgroundParticles(renderer.scene)
const spatialVolume = new SpatialVolume(renderer.scene)
spatialVolume.setCenterAxesVisible(false)

// Audio reactive analyser
const audio = new AudioReactive()

let activeMode    = new LissajousMode(renderer.scene, renderer)
activeMode.setAudio?.(audio)
let transitioning = false

const overlay = document.getElementById('transition-overlay')
const titleScreen = document.getElementById('title-screen')
const modeGallery = document.getElementById('mode-gallery')
const galleryClose = document.getElementById('gallery-close')
const liveEq = document.getElementById('live-eq')

const MODE_META = {
  lissajous: {
    title: 'Lissajous',
    equation: 'x = A sin(at + delta)',
    description: 'A luminous parametric orbit drawn as a living trail.',
    tags: ['Parametric', 'Phase', 'Resonance'],
  },
  fourier: {
    title: 'Fourier',
    equation: 'f(t), z(t) = sum A_n e^(i omega_n t)',
    description: 'Rotating phasors build waves and decompose hand-drawn paths.',
    tags: ['Harmonics', 'Signals', 'Epicycles'],
  },
  rose: {
    title: 'Rose Curves',
    equation: 'r = cos(k theta)',
    description: 'Petal symmetries unfold from polar rhythm and phase.',
    tags: ['Polar', 'Symmetry', 'Petals'],
  },
  chaos: {
    title: 'Attractors',
    equation: 'dx/dt = sigma(y - x)',
    description: 'Deterministic equations braid paths that never repeat.',
    tags: ['ODEs', 'Chaos', 'Phase Space'],
  },
  surfaces: {
    title: 'Surfaces',
    equation: 'K = (LN − M²) / (EG − F²)',
    description: 'A gallery of exotic mathematical surfaces — tori, minimal surfaces, algebraic forms — with live distortion and Hopf/Morse exhibits.',
    tags: ['Curvature', 'Topology', 'Manifolds'],
  },
  knots: {
    title: 'Knots',
    equation: 'r(t) = (R + r·cos(qt))·(cos(pt), sin(pt), 0) + r·sin(qt)·ẑ',
    description: 'Torus knots, the figure-eight, and Borromean rings rendered as smooth tubes with parallel transport framing.',
    tags: ['Topology', 'Torus Knots', 'Links'],
  },
  complex: {
    title: 'Complex Analysis',
    equation: 'f: ℂ → ℂ,  height = |f(z)|,  color = arg(f(z))',
    description: 'Complex functions as 3D landscapes, Riemann sphere, and multi-sheeted branch surfaces.',
    tags: ['Complex', 'Domain Color', 'Riemann'],
  },
}

const modeReveal = {
  root:        document.getElementById('mode-reveal'),
  title:       document.getElementById('mode-title'),
  equation:    document.getElementById('mode-equation'),
  description: document.getElementById('mode-description'),
}

const MODE_CATEGORY = {
  lissajous:  'Periodic',
  fourier:    'Periodic',
  rose:       'Periodic',
  chaos:      'Chaos',
  surfaces:   'Spatial',
  knots:      'Topology',
  complex:    'Complex',
}

const insightPanel = {
  root:    document.getElementById('insight-panel'),
  mode:    document.getElementById('insight-mode'),
  concept: document.getElementById('insight-concept'),
  chips:   document.getElementById('insight-prompts'),
}

const hud = {
  mode:       document.getElementById('hud-mode'),
  equation:   document.getElementById('hud-equation'),
  fps:        document.getElementById('hud-fps'),
  controls:   document.getElementById('controls-btn'),
  analytics:  document.getElementById('analytics-btn'),
  gallery:    document.getElementById('gallery-btn'),
  pause:      document.getElementById('pause-btn'),
  capture:    document.getElementById('capture-btn'),
  fullscreen: document.getElementById('fullscreen-btn'),
  spatial:    document.getElementById('spatial-btn'),
  toast:      document.getElementById('toast'),
}

const controlsPanel = document.getElementById('controls-panel')
const analyticsPanel = document.getElementById('analytics-panel')
const analytics = {
  mode: document.getElementById('analytics-mode'),
  fps:  document.getElementById('analytics-fps'),
  geo:  document.getElementById('analytics-geo'),
}

let paused = false
let controlsVisible = true
let analyticsVisible = false
let spatialEnabled = true
let aiPanel = null
let toastTween = null
let lastAudioEnabled = false
let fpsSampleTime = performance.now()
let fpsFrames = 0
let currentFps = 0
let analyticsSampleTime = performance.now()
let liveEquationFrame = 0
let lastLiveEquation = ''
let tooltipAnnotationFrame = 0

const INSIGHT_PROMPTS = {
  lissajous: [
    'Explain the frequency ratio in this Lissajous curve.',
    'What does phase change in this system?',
    'Why does this orbit close or drift?',
  ],
  fourier: [
    'Explain how the epicycles reconstruct this signal.',
    'What does each Fourier coefficient mean?',
    'Why do more terms make the curve sharper?',
  ],
  rose: [
    'Explain why k changes the rose curve shape.',
    'What does z frequency show in the 3D rose?',
    'Why do some rose curves close and others drift?',
  ],
  chaos: [
    'What are the axes measuring in this attractor?',
    'What does chaos mean in this visualization?',
    'Explain what the current equations are doing.',
  ],
  surfaces: [
    'Explain the current surface and its curvature.',
    'What do the distortion controls do mathematically?',
    'Where does this surface appear in the real world?',
  ],
  knots: [
    'Explain what p and q mean in this knot.',
    'Why do shared factors create links?',
    'What makes Borromean rings special?',
  ],
  complex: [
    'Explain what the colors represent on this surface.',
    'What is a pole and why does it spike upward?',
    'What is a Riemann sheet and why does it exist?',
  ],
}

const INSIGHT_CONCEPT = {
  lissajous: [
    'A Lissajous figure traces the path of a point driven by two independent sinusoids: $x(t) = A\\sin(at + \\delta)$ and $y(t) = B\\sin(bt)$.',
    'The frequency ratio $a:b$ determines closure — rational ratios produce a stable closed figure; irrational ratios slowly fill a rectangle.',
    'The phase $\\delta$ continuously morphs the curve between a line, an ellipse, and every intermediate shape as it sweeps $0 \\to 2\\pi$.',
    'Adding a third frequency $c$ along $z$ lifts the figure into three dimensions, producing spatial Lissajous knots.',
  ].join(' '),
  fourier: [
    'The Fourier series decomposes any periodic signal into a sum of rotating phasors: $f(t) = \\sum_{n=1}^{N} A_n \\cos(n\\omega t + \\phi_n)$.',
    'Each epicycle radius equals the coefficient $A_n$; its rotation speed is $n\\omega$, the $n$-th harmonic of the fundamental frequency $\\omega$.',
    'Adding more terms sharpens the waveform, but near a sharp jump the partial sum always overshoots by ~9% — the Gibbs phenomenon.',
    'The drawing mode inverts the process, recovering Fourier coefficients from a hand-traced path via numerical integration.',
  ].join(' '),
  rose: [
    'A rose curve $r = \\cos(k\\theta)$ describes a petal pattern in polar coordinates where $k$ controls petal count.',
    'When $k$ is odd the curve has exactly $k$ petals; when even it has $2k$, because each petal is traced twice.',
    'The 3D lift $z = \\sin(n\\theta)$ projects the curve onto a sphere, producing spherical-harmonic-like figures.',
    'Irrational $k$ produces an open curve that never closes, slowly sweeping a dense annular region.',
  ].join(' '),
  chaos: [
    'A chaotic attractor is the limiting geometry of a deterministic ODE system such as the Lorenz equations: $\\dot{x} = \\sigma(y-x),\\; \\dot{y} = x(\\rho-z)-y,\\; \\dot{z} = xy-\\beta z$.',
    'The system is deterministic — identical initial conditions always yield identical trajectories — yet nearby paths diverge exponentially, measured by the Lyapunov exponent $\\lambda > 0$.',
    'The attractor has a fractal dimension between 2 and 3, meaning trajectories explore it forever without exactly repeating.',
    'The shadow below each trail tracks current divergence; close paths indicate locally stable dynamics.',
  ].join(' '),
  surfaces: [
    'Each surface is coloured by its Gaussian curvature $K = \\kappa_1\\kappa_2$, the product of the two principal curvatures at each point.',
    'Yellow indicates $K > 0$ (dome); blue indicates $K < 0$ (saddle); cream indicates $K = 0$ (cylinder or flat region).',
    'The Gauss–Bonnet theorem ties total curvature to topology: $\\iint_S K\\,dA = 2\\pi\\chi$, so the integral over a closed surface equals $2\\pi$ times its Euler characteristic.',
    'The distortion sliders — twist, inflate, noise, pinch — deform the surface continuously while preserving its parametric structure.',
  ].join(' '),
  knots: [
    'A torus knot $T(p,q)$ winds $p$ times around the longitude of a torus and $q$ times through its hole.',
    'When $\\gcd(p,q) = 1$ the result is a single closed knot; a common factor $g > 1$ produces a torus link with $g$ components.',
    'The tube uses a parallel-transport frame which carries the normal without unnecessary spin, avoiding the artefacts of the Frenet frame near inflection points.',
    'Writhe adds a sinusoidal radial perturbation that changes visual complexity without altering the underlying knot type.',
  ].join(' '),
  complex: [
    'Domain colouring maps $f: \\mathbb{C} \\to \\mathbb{C}$ to a surface where height encodes $|f(z)|$ and hue encodes $\\arg(f(z))$.',
    'Poles appear as upward spikes; the colour cycles through the full wheel once per unit of winding number around the pole.',
    'Zeros touch the floor and colour cycles in the opposite direction; branch cuts appear as sharp lines of colour discontinuity.',
    'The Riemann sphere compactifies $\\mathbb{C}$ by adding a point at infinity via stereographic projection from the north pole.',
  ].join(' '),
}

function setModeChrome(name, reveal = false) {
  const meta = MODE_META[name] ?? MODE_META.lissajous
  document.body.dataset.mode = name

  modeReveal.title.textContent = meta.title
  modeReveal.equation.textContent = meta.equation
  modeReveal.description.textContent = meta.description
  hud.mode.textContent = meta.title
  hud.equation.textContent = meta.equation
  analytics.mode.textContent = meta.title
  aiPanel?.setMode(name)
  updateInsightPanel(name)

  if (!reveal) return

  gsap.killTweensOf(modeReveal.root)
  gsap.timeline()
    .set(modeReveal.root, { opacity: 0, y: 18, scale: 0.985 })
    .to(modeReveal.root, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: 'power3.out' }, 0.02)
    .to(modeReveal.root, { opacity: 0, y: -14, scale: 1.01, duration: 0.42, ease: 'power2.in' }, 1.05)
}

function updateAudioChrome() {
  // Audio remains available to modes, but it is no longer surfaced as a
  // persistent bottom-HUD status pill.
}

function showToast(message) {
  if (!hud.toast) return
  hud.toast.textContent = message
  if (toastTween) toastTween.kill()
  toastTween = gsap.timeline()
    .to(hud.toast, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' })
    .to(hud.toast, { opacity: 0, y: 8, duration: 0.28, ease: 'power2.in' }, '+=1.9')
}

function fallbackLiveEquation(name = document.body.dataset.mode ?? 'lissajous') {
  const meta = MODE_META[name] ?? MODE_META.lissajous
  return `$${meta.equation}$`
}

function updateLiveEquation() {
  if (!liveEq) return
  let equation = ''
  try {
    equation = activeMode?.liveEquation?.()
      ?? activeMode?.equationContext?.()?.equation
      ?? fallbackLiveEquation()
  } catch (err) {
    console.warn('[UI] liveEquation failed:', err)
    equation = fallbackLiveEquation()
  }
  if (equation === lastLiveEquation) return
  lastLiveEquation = equation
  liveEq.innerHTML = renderMath(equation)
}

function scheduleLiveEquationUpdate() {
  if (liveEquationFrame) return
  liveEquationFrame = requestAnimationFrame(() => {
    liveEquationFrame = 0
    updateLiveEquation()
  })
}

function annotateActivePane() {
  try {
    annotatePanel(activeMode?.pane, activeMode?.tooltips?.() ?? {})
  } catch (err) {
    console.warn('[UI] Control tooltip annotation failed:', err)
  }
}

function scheduleTooltipAnnotation() {
  if (tooltipAnnotationFrame) return
  tooltipAnnotationFrame = requestAnimationFrame(() => {
    tooltipAnnotationFrame = 0
    annotateActivePane()
  })
}

function refreshModeUi() {
  activeMode?.pane?.refresh?.()
  scheduleLiveEquationUpdate()
  scheduleTooltipAnnotation()
  window.dispatchEvent(new CustomEvent('mathvis:mode-pane-changed', {
    detail: { showControls: controlsVisible },
  }))
}

function setControlsVisible(next) {
  controlsVisible = next
  document.body.classList.toggle('controls-hidden', !controlsVisible)
  hud.controls.classList.toggle('active', controlsVisible)
  hud.controls.setAttribute('aria-label', controlsVisible ? 'Hide controls' : 'Show controls')
  hud.controls.setAttribute('title', controlsVisible ? 'Hide controls' : 'Show controls')
  mountControlPane()
}

function setAnalyticsVisible(next) {
  analyticsVisible = next
  analyticsPanel.classList.toggle('open', analyticsVisible)
  hud.analytics.classList.toggle('active', analyticsVisible)
  hud.analytics.setAttribute('aria-label', analyticsVisible ? 'Hide analytics' : 'Show analytics')
  hud.analytics.setAttribute('title', analyticsVisible ? 'Hide analytics' : 'Show analytics')
}

function modeSupportsSpatial(name = document.body.dataset.mode) {
  return !['fourier'].includes(name)
}

function updateSpatialChrome() {
  const visible = spatialEnabled && modeSupportsSpatial()
  spatialVolume.setVisible(visible)
  spatialVolume.setCenterAxesVisible(false)
  activeMode?.axes?.setVisible?.(true)
  document.body.classList.toggle('spatial-enabled', visible)
  hud.spatial.classList.toggle('active', visible)
  hud.spatial.textContent = visible ? 'Grid On' : 'Grid Off'
  hud.spatial.setAttribute('aria-label', visible ? 'Grid on. Hide grid' : 'Grid off. Show grid')
  hud.spatial.setAttribute('title', visible ? 'Grid On' : 'Grid Off')
}

function setSpatialEnabled(next) {
  spatialEnabled = next
  updateSpatialChrome()
}

function updateInsightPanel(name = document.body.dataset.mode ?? 'lissajous') {
  if (!insightPanel.root) return
  const meta = MODE_META[name] ?? MODE_META.lissajous
  const category = MODE_CATEGORY[name] ?? 'System'
  insightPanel.mode.textContent = `${category} · ${meta.title}`
  insightPanel.concept.innerHTML = renderMath(INSIGHT_CONCEPT[name] ?? '')
  insightPanel.chips.replaceChildren(...(INSIGHT_PROMPTS[name] ?? []).map(prompt => {
    const btn = document.createElement('button')
    btn.className = 'insight-prompt'
    btn.type = 'button'
    btn.textContent = prompt
    btn.addEventListener('click', () => {
      aiPanel?.ask(prompt)
      document.getElementById('ai-btn')?.classList.add('active')
    })
    return btn
  }))
}

function mountControlPane() {
  const paneEl = activeMode?.pane?.element
  if (!paneEl) return
  // Strip every inline style the mode constructor + Tweakpane set so that the
  // #controls-panel .tp-dfwv CSS rules (position: static, width: 100%, etc.)
  // take over cleanly — they're !important but inline styles can still win in
  // some edge-cases without this reset.
  paneEl.style.cssText = ''
  if (paneEl.parentElement !== controlsPanel) {
    controlsPanel.replaceChildren(paneEl)
  }
  if (!activeMode.pane._prismUiWired) {
    activeMode.pane._prismUiWired = true
    activeMode.pane.on?.('change', () => {
      scheduleLiveEquationUpdate()
    })
    paneEl.addEventListener('click', () => {
      scheduleLiveEquationUpdate()
      scheduleTooltipAnnotation()
    })
  }
  scheduleTooltipAnnotation()
  scheduleLiveEquationUpdate()
}

function updateAnalytics() {
  const memoryInfo = renderer.webgl.info.memory
  analytics.fps.textContent = currentFps ? `${currentFps} fps` : '--'
  analytics.geo.textContent = `${memoryInfo.geometries} geometries`
}

function buildDefaultLessonContext(mode, extra = null) {
  const meta = MODE_META[mode] ?? MODE_META.lissajous
  return {
    title: meta.title,
    bigIdea: meta.description,
    equations: [meta.equation],
    variables: {},
    parameters: { ...(activeMode.params ?? {}) },
    visualLinks: {
      currentMode: mode,
      activeExhibit: extra?.exhibit ?? extra?.attractor ?? null,
      note: 'Use the current visual state and exposed parameters when explaining.',
    },
    mustMention: [
      'Explain what the equation is measuring or generating.',
      'Define the visible variables and controls before discussing behavior.',
      'Connect the explanation directly to the curve, surface, trail, color, axes, or motion on screen.',
    ],
    misconceptions: [],
    realWorld: [],
    tryThis: [],
  }
}

function callModeHook(name, fallback = null) {
  try {
    return activeMode?.[name]?.() ?? fallback
  } catch (err) {
    console.warn(`[AI] ${name} failed for ${document.body.dataset.mode}:`, err)
    return fallback
  }
}

function toJsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (typeof item === 'number') return Number.isFinite(item) ? item : null
      if (typeof item === 'function' || typeof item === 'symbol') return undefined
      return item
    }))
  } catch (err) {
    console.warn('[AI] Context serialization failed:', err)
    return null
  }
}

function pickContextExtra(mode, extra, intent, requestKind) {
  if (!extra) return null
  if (requestKind !== 'ask') return {
    exhibit: extra.exhibit ?? extra.attractor ?? null,
    function: extra.function ?? null,
    sheet: extra.sheet ?? null,
    note: extra.note ?? null,
  }
  if (intent === 'params' || intent === 'equation') return null
  if (mode === 'chaos') return {
    attractor: extra.attractor,
    equations: extra.equations,
    attractorParams: extra.attractorParams,
    axes: extra.axes,
    chaos: extra.chaos,
  }
  if (mode === 'rose') return {
    params: extra.params,
    interpretation: extra.interpretation,
  }
  return {
    exhibit: extra.exhibit ?? null,
    function: extra.function ?? null,
    sheet: extra.sheet ?? null,
    note: extra.note ?? null,
  }
}

function compactLessonContext(mode, lessonContext, requestKind) {
  if (!lessonContext) return null
  if (requestKind === 'lesson') return lessonContext
  if (requestKind === 'variables') return {
    title: lessonContext.title,
    equations: lessonContext.equations,
    variables: lessonContext.variables,
    parameters: lessonContext.parameters,
  }
  if (requestKind === 'examples') return {
    title: lessonContext.title,
    bigIdea: lessonContext.bigIdea,
    equations: lessonContext.equations,
    realWorld: lessonContext.realWorld,
  }
  return { title: lessonContext.title, bigIdea: lessonContext.bigIdea }
}

function buildAiContext(options = {}) {
  const { requestKind = 'ask', intent = 'explain' } = options
  const mode = document.body.dataset.mode ?? 'lissajous'
  const extra = callModeHook('aiContext', null)
  const lessonContext = callModeHook('lessonContext', buildDefaultLessonContext(mode, extra))
  const schema = callModeHook('aiSchema', null)
  const includeSchema = requestKind === 'variables' || intent === 'params'
  return toJsonSafe({
    mode,
    equation: MODE_META[mode]?.equation ?? '',
    params:   {
      ...(activeMode?.params ?? {}),
      ...(extra?.params ?? {}),
    },
    extra: pickContextExtra(mode, extra, intent, requestKind),
    lessonContext: compactLessonContext(mode, lessonContext, requestKind),
    schema: includeSchema ? schema : null,
  }) ?? {
    mode,
    equation: MODE_META[mode]?.equation ?? '',
    params: {},
    extra: null,
    lessonContext: { title: MODE_META[mode]?.title ?? mode },
    schema: null,
  }
}

setModeChrome('lissajous')
updateAudioChrome()
setControlsVisible(true)
setSpatialEnabled(true)
updateLiveEquation()
requestAnimationFrame(mountControlPane)
window.addEventListener('mathvis:mode-pane-changed', event => {
  if (event.detail?.showControls) setControlsVisible(true)
  requestAnimationFrame(() => {
    mountControlPane()
    updateLiveEquation()
  })
})

gsap.timeline({ defaults: { ease: 'power3.out' } })
  .from('.title-kicker, .title-heading, .title-subtitle, .title-meta, .title-scroll-cue', {
    y: 18,
    opacity: 0,
    duration: 0.72,
    stagger: 0.04,
  }, 0.12)

// Which mode the title screen will boot into (set by Bento card clicks)
let _entryMode = 'lissajous'
let galleryVisible = false

function setActiveNavMode(name) {
  document.querySelectorAll('.nav-btn[data-mode]').forEach(b => b.classList.remove('active'))
  document.querySelector(`.nav-btn[data-mode="${name}"]`)?.classList.add('active')
}

function openModeGallery() {
  if (!modeGallery || galleryVisible) return
  galleryVisible = true
  modeGallery.classList.add('open')
  modeGallery.setAttribute('aria-hidden', 'false')
  document.body.classList.add('gallery-open')
  hud.gallery?.classList.add('active')

  gsap.killTweensOf(modeGallery)
  gsap.fromTo(modeGallery,
    { opacity: 0 },
    { opacity: 1, duration: 0.32, ease: 'power2.out' },
  )
  gsap.fromTo('.gallery-kicker, .gallery-title, .gallery-close, .gallery-card',
    { y: 18, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.58, ease: 'power3.out', stagger: 0.025 },
  )
}

function closeModeGallery(immediate = false) {
  if (!modeGallery || !galleryVisible) return

  const finish = () => {
    galleryVisible = false
    modeGallery.classList.remove('open')
    modeGallery.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('gallery-open')
    hud.gallery?.classList.remove('active')
  }

  gsap.killTweensOf(modeGallery)
  if (immediate) {
    gsap.set(modeGallery, { opacity: 0 })
    finish()
    return
  }

  gsap.to(modeGallery, {
    opacity: 0,
    duration: 0.22,
    ease: 'power2.in',
    onComplete: finish,
  })
}

function chooseGalleryMode(name) {
  if (!name) return

  if (document.body.classList.contains('title-open')) {
    _entryMode = name
    closeModeGallery(true)
    enterExperience()
    return
  }

  closeModeGallery()
  if (name === document.body.dataset.mode || transitioning) return
  setActiveNavMode(name)
  switchTo(name)
}

function enterExperience() {
  if (!document.body.classList.contains('title-open')) return

  gsap.timeline({ defaults: { ease: 'power3.inOut' } })
    .to(titleScreen, {
      opacity: 0,
      duration: 0.52,
      onComplete: () => {
        document.body.classList.remove('title-open')
        titleScreen?.remove()

        if (_entryMode !== 'lissajous') {
          // Update active nav button to the chosen mode
          setActiveNavMode(_entryMode)
          setModeChrome(_entryMode, true)
          enterScene(_entryMode)
        } else {
          setActiveNavMode('lissajous')
          setModeChrome('lissajous', true)
        }
      },
    })
    .to(renderer.bloomPass, { strength: 0.9, duration: 0.42, ease: 'power2.out' }, 0)
    .to(renderer.bloomPass, { strength: 0.45, duration: 1.0, ease: 'power3.out' }, 0.36)
}

// Bento grid card clicks — set entry mode then trigger the same fade
document.querySelector('.title-home-section')?.addEventListener('click', e => {
  if (e.target.closest('button, a')) return
  _entryMode = 'lissajous'
  enterExperience()
})

document.querySelectorAll('.title-mode-card').forEach(card => {
  card.addEventListener('click', () => {
    _entryMode = card.dataset.mode
    enterExperience()
  })
})

document.querySelectorAll('.gallery-card').forEach(card => {
  card.addEventListener('click', () => chooseGalleryMode(card.dataset.mode))
})

// ---------------------------------------------------------------------------
// AI panel
// ---------------------------------------------------------------------------

aiPanel = new AiPanel(document.getElementById('ai-panel'), {
  getContext: buildAiContext,
  applyAction: (action) => {
    if (activeMode.applyAiAction?.(action)) return
    if (action.type === 'set_params' && activeMode.params) {
      const schema = activeMode.aiSchema?.()?.params ?? {}
      const nextParams = {}
      for (const [key, value] of Object.entries(action.params ?? {})) {
        const rule = schema[key]
        if (!rule && !(key in activeMode.params)) continue
        if (rule?.type === 'boolean') {
          nextParams[key] = Boolean(value)
        } else if (typeof value === 'number' && rule) {
          const min = rule.min ?? -Infinity
          const max = rule.max ?? Infinity
          nextParams[key] = Math.max(min, Math.min(max, value))
        } else {
          nextParams[key] = value
        }
      }
      Object.assign(activeMode.params, nextParams)
      activeMode.pane?.refresh()
    }
  },
  switchMode: (name) => {
    if (transitioning) return
    setActiveNavMode(name)
    switchTo(name)
  },
  showToast,
  aiEndpoint: AI_ENDPOINT,
})

aiPanel.setMode(document.body.dataset.mode ?? 'lissajous')

document.getElementById('ai-btn').addEventListener('click', () => {
  aiPanel.toggle()
  const open = document.getElementById('ai-panel').classList.contains('open')
  document.getElementById('ai-btn').classList.toggle('active', open)
  showToast(open ? 'AI assistant open' : 'AI assistant closed')
})

galleryClose?.addEventListener('click', () => closeModeGallery())
hud.gallery?.addEventListener('click', () => {
  openModeGallery()
  showToast('Exhibit gallery open')
})

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && galleryVisible) {
    closeModeGallery()
    return
  }
  if (galleryVisible) return
  if (e.key === 'Enter') enterExperience()
})

// ---------------------------------------------------------------------------
// Click → ripple distortion
// ---------------------------------------------------------------------------

window.addEventListener('click', e => {
  // Don't trigger inside the nav or control panels
  if (e.target.closest('#title-screen, #mode-gallery, #nav, #hud, #mode-tools, #toast, #live-eq, #insight-panel, #controls-panel, #analytics-panel, #ai-panel, .tp-dfwv')) return
  renderer.triggerRipple(e.clientX, e.clientY)
})

hud.controls?.addEventListener('click', () => {
  setControlsVisible(!controlsVisible)
  showToast(controlsVisible ? 'Controls visible' : 'Controls hidden')
})

hud.analytics?.addEventListener('click', () => {
  setAnalyticsVisible(!analyticsVisible)
  showToast(analyticsVisible ? 'Live stats visible' : 'Live stats hidden')
})

hud.pause?.addEventListener('click', () => {
  paused = !paused
  hud.pause.classList.toggle('active', paused)
  hud.pause.textContent = paused ? 'GO' : 'II'
  hud.pause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation')
  hud.pause.setAttribute('title', paused ? 'Resume animation' : 'Pause animation')
  showToast(paused ? 'Animation paused' : 'Animation resumed')
})

hud.capture?.addEventListener('click', () => {
  renderer.render()
  const link = document.createElement('a')
  const mode = (hud.mode.textContent || 'math-vis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  link.download = `${mode || 'math-vis'}-${new Date().toISOString().slice(0, 10)}.png`
  link.href = renderer.domElement.toDataURL('image/png')
  link.click()
  showToast('Saved PNG snapshot')
})

const copyParamsBtn = document.getElementById('copy-params-btn')
const loadParamsBtn = document.getElementById('load-params-btn')
const loadParamsFile = document.getElementById('load-params-file')

copyParamsBtn?.addEventListener('click', () => {
  const params = activeMode?.params
  if (!params) { showToast('No parameters to copy'); return }
  navigator.clipboard.writeText(JSON.stringify(params, null, 2))
    .then(() => showToast('Parameters copied'))
    .catch(() => showToast('Clipboard unavailable'))
})

loadParamsBtn?.addEventListener('click', () => loadParamsFile?.click())
loadParamsFile?.addEventListener('change', () => {
  const file = loadParamsFile.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result)
      if (!activeMode?.params) { showToast('No active mode'); return }
      if (activeMode.applyParams?.(parsed)) {
        // Mode handled its own rebuild/reset.
      } else {
        Object.assign(activeMode.params, parsed)
        activeMode.pane?.refresh()
      }
      refreshModeUi()
      showToast('Parameters loaded')
    } catch {
      showToast('Invalid JSON file')
    } finally {
      loadParamsFile.value = ''
    }
  }
  reader.readAsText(file)
})

hud.fullscreen?.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
      hud.fullscreen.classList.add('active')
    } else {
      await document.exitFullscreen()
      hud.fullscreen.classList.remove('active')
    }
  } catch {
    showToast('Fullscreen is blocked by this browser')
  }
})

hud.spatial?.addEventListener('click', () => {
  setSpatialEnabled(!spatialEnabled)
  showToast(spatialEnabled && modeSupportsSpatial() ? 'Grid visible' : 'Grid hidden')
})

document.addEventListener('fullscreenchange', () => {
  hud.fullscreen.classList.toggle('active', Boolean(document.fullscreenElement))
})

// ---------------------------------------------------------------------------
// Nav scrolling — wheel and drag affordances for dense mode lists
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

const cursorDot  = document.getElementById('cursor-dot')
const cursorRing = document.getElementById('cursor-ring')

// Both dot and ring follow the cursor instantly — the ring must stay
// pixel-aligned with the WebGL lens shader which uses the raw cursor UV.
if (cursorDot && cursorRing) {
  window.addEventListener('mousemove', e => {
    document.body.classList.add('custom-cursor')
    gsap.set(cursorDot,  { x: e.clientX, y: e.clientY })
    gsap.set(cursorRing, { x: e.clientX, y: e.clientY })
  })
}

// ---------------------------------------------------------------------------
// Mode switching — choreographed GSAP timeline
// ---------------------------------------------------------------------------

function switchTo(name) {
  transitioning = true
  setModeChrome(name, true)

  // ── Phase 1: exit current scene ───────────────────────────────────────────
  const exitTl = gsap.timeline({
    onComplete: () => enterScene(name),
  })

  // Bloom flare + chroma split signal the cut
  exitTl
    .to(renderer.bloomPass, {
      strength: 1.2,
      duration: 0.18,
      ease:     'power3.in',
    }, 0)
    .to(renderer.chromaPass.uniforms.uStrength, {
      value:    0.006,
      duration: 0.18,
      ease:     'power3.in',
    }, 0)
    .to(overlay, {
      opacity:  1,
      duration: 0.22,
      ease:     'power2.in',
    }, 0)
}

function enterScene(name) {
  activeMode.dispose()
  renderer.scene.clear()

  switch (name) {
    case 'lissajous':  activeMode = new LissajousMode(renderer.scene, renderer);  break
    case 'fourier':      activeMode = new FourierMode(renderer.scene, renderer);     break
    case 'rose':       activeMode = new RoseMode(renderer.scene, renderer);       break
    case 'chaos':      activeMode = new ChaosMode(renderer.scene, renderer);    break
    case 'surfaces':   activeMode = new SurfacesMode(renderer.scene, renderer);  break
    case 'knots':      activeMode = new KnotsMode(renderer.scene, renderer);     break
    case 'complex':    activeMode = new ComplexMode(renderer.scene, renderer);   break
  }

  requestAnimationFrame(() => {
    mountControlPane()
    updateLiveEquation()
  })

  // Re-add particles to the scene (scene.clear() removed them)
  renderer.scene.add(particles._pointsBlue)
  renderer.scene.add(particles._pointsAmber)
  spatialVolume.attach(renderer.scene)

  // Pass audio to modes that support it
  activeMode.setAudio?.(audio)

  // Hide particles in pure-2D locked-camera modes (they'd be behind the quad)
  const is2D = ['fourier'].includes(name)
  particles.setVisible(!is2D && name !== 'surfaces' && name !== 'knots' && name !== 'complex')
  updateSpatialChrome()
  updateLiveEquation()

  // ── Phase 2: enter new scene ──────────────────────────────────────────────
  const enterTl = gsap.timeline({
    onComplete: () => { transitioning = false },
  })

  enterTl
    .to(overlay, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0)
    .to(renderer.bloomPass, { strength: 0.45, duration: 1.4, ease: 'power3.out' }, 0)
    .to(renderer.chromaPass.uniforms.uStrength, { value: 0.0006, duration: 1.0, ease: 'power2.out' }, 0)
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  if (activeMode.onResize) activeMode.onResize()
})

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

function tick() {
  requestAnimationFrame(tick)
  const now = performance.now()
  const dt  = Math.min((now - prevTime) / 1000, 0.05)
  prevTime  = now
  fpsFrames += 1

  if (now - fpsSampleTime > 500) {
    currentFps = Math.round((fpsFrames * 1000) / (now - fpsSampleTime))
    hud.fps.textContent = `${currentFps} fps`
    fpsFrames = 0
    fpsSampleTime = now
  }

  // Audio — read FFT every frame
  if (!paused) audio.update()
  if (audio.enabled !== lastAudioEnabled) {
    lastAudioEnabled = audio.enabled
    updateAudioChrome()
  }

  // Bloom responds to audio overall amplitude — but only in modes that use bloom.
  // Mandelbrot disables bloom entirely (bloomPass.strength = 0) to prevent
  // the fractal exterior from washing out to white.
  if (audio.enabled && renderer.bloomPass.strength > 0) {
    renderer.bloomPass.strength = 0.45 + audio.overall * 0.35
  }

  // Particle field — cursor NDC from renderer's internal mouse tracker
  if (!paused) {
    if (particles.visible) particles.update(dt, renderer._mouse)
    if (spatialVolume.visible) spatialVolume.update(dt)

    activeMode.update(dt)
  }
  renderer.render()

  if (analyticsVisible && now - analyticsSampleTime > 180) {
    updateAnalytics()
    analyticsSampleTime = now
  }
}

tick()
