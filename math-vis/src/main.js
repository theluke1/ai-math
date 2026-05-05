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

const MODE_META = {
  lissajous: {
    title: 'Lissajous',
    equation: 'x = A sin(at + delta)',
    description: 'A luminous parametric orbit drawn as a living trail.',
  },
  fourier: {
    title: 'Fourier',
    equation: 'f(t), z(t) = sum A_n e^(i omega_n t)',
    description: 'Rotating phasors build waves and decompose hand-drawn paths.',
  },
  rose: {
    title: 'Rose Curves',
    equation: 'r = cos(k theta)',
    description: 'Petal symmetries unfold from polar rhythm and phase.',
  },
  chaos: {
    title: 'Attractors',
    equation: 'dx/dt = sigma(y - x)',
    description: 'Deterministic equations braid paths that never repeat.',
  },
  surfaces: {
    title: 'Surfaces',
    equation: 'K = (LN − M²) / (EG − F²)',
    description: 'A gallery of exotic mathematical surfaces — tori, minimal surfaces, algebraic forms — with live distortion and Hopf/Morse exhibits.',
  },
  knots: {
    title: 'Knots',
    equation: 'r(t) = (R + r·cos(qt))·(cos(pt), sin(pt), 0) + r·sin(qt)·ẑ',
    description: 'Torus knots, the figure-eight, and Borromean rings rendered as smooth tubes with parallel transport framing.',
  },
  complex: {
    title: 'Complex Analysis',
    equation: 'f: ℂ → ℂ,  height = |f(z)|,  color = arg(f(z))',
    description: 'Complex functions as 3D landscapes, Riemann sphere, and multi-sheeted branch surfaces.',
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
  mode:     document.getElementById('analytics-mode'),
  fps:      document.getElementById('analytics-fps'),
  frame:    document.getElementById('analytics-frame'),
  draws:    document.getElementById('analytics-draws'),
  geo:      document.getElementById('analytics-geo'),
  scene:    document.getElementById('analytics-scene'),
  camera:   document.getElementById('analytics-camera'),
  pointer:  document.getElementById('analytics-pointer'),
  audio:    document.getElementById('analytics-audio'),
  bloom:    document.getElementById('analytics-bloom'),
  viewport: document.getElementById('analytics-viewport'),
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
  hud.toast.textContent = message
  if (toastTween) toastTween.kill()
  toastTween = gsap.timeline()
    .to(hud.toast, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' })
    .to(hud.toast, { opacity: 0, y: 8, duration: 0.28, ease: 'power2.in' }, '+=1.9')
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

function formatVec3(v) {
  return `${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}`
}

function updateInsightPanel(name = document.body.dataset.mode ?? 'lissajous') {
  if (!insightPanel.root) return
  const meta = MODE_META[name] ?? MODE_META.lissajous
  const category = MODE_CATEGORY[name] ?? 'System'
  insightPanel.mode.textContent = `${category} · ${meta.title}`
  insightPanel.concept.textContent = 'Ask the AI to explain what the system is measuring, how the controls change the behavior, or why the current shape appears.'
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
}

function updateAnalytics(dt) {
  const info = renderer.webgl.info
  const renderInfo = info.render
  const memoryInfo = info.memory

  analytics.fps.textContent = currentFps ? `${currentFps} fps` : '--'
  analytics.frame.textContent = `${(dt * 1000).toFixed(1)} ms`
  analytics.draws.textContent = `${renderInfo.calls} render passes`
  analytics.geo.textContent = `${memoryInfo.geometries} shapes, ${memoryInfo.textures} textures`
  analytics.scene.textContent = `${renderer.scene.children.length} visible parts`
  analytics.camera.textContent = formatVec3(renderer.camera.position)
  analytics.pointer.textContent = `${renderer._mouse.x.toFixed(2)}, ${renderer._mouse.y.toFixed(2)}`
  analytics.audio.textContent = audio.enabled
    ? `bass ${audio.bass.toFixed(2)}, mid ${audio.mid.toFixed(2)}, high ${audio.treble.toFixed(2)}`
    : 'off'
  analytics.bloom.textContent = `${renderer.bloomPass.strength.toFixed(2)}`
  analytics.viewport.textContent = `${window.innerWidth} x ${window.innerHeight}`
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

function buildAiContext() {
  const mode = document.body.dataset.mode ?? 'lissajous'
  const extra = callModeHook('aiContext', null)
  const lessonContext = callModeHook('lessonContext', buildDefaultLessonContext(mode, extra))
  const schema = callModeHook('aiSchema', null)
  return toJsonSafe({
    mode,
    equation: MODE_META[mode]?.equation ?? '',
    params:   {
      ...(activeMode?.params ?? {}),
      ...(extra?.params ?? {}),
    },
    extra,
    lessonContext,
    schema,
  }) ?? {
    mode,
    equation: MODE_META[mode]?.equation ?? '',
    params: {},
    extra: null,
    lessonContext: buildDefaultLessonContext(mode, null),
    schema: null,
  }
}

setModeChrome('lissajous')
updateAudioChrome()
setControlsVisible(true)
setSpatialEnabled(true)
requestAnimationFrame(mountControlPane)
window.addEventListener('mathvis:mode-pane-changed', event => {
  if (event.detail?.showControls) setControlsVisible(true)
  requestAnimationFrame(mountControlPane)
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
  if (e.target.closest('#title-screen, #mode-gallery, #nav, #hud, #mode-tools, #toast, #insight-panel, #controls-panel, #analytics-panel, #ai-panel, .tp-dfwv')) return
  renderer.triggerRipple(e.clientX, e.clientY)
})

hud.controls.addEventListener('click', () => {
  setControlsVisible(!controlsVisible)
  showToast(controlsVisible ? 'Controls visible' : 'Controls hidden')
})

hud.analytics.addEventListener('click', () => {
  setAnalyticsVisible(!analyticsVisible)
  showToast(analyticsVisible ? 'Live stats visible' : 'Live stats hidden')
})

hud.pause.addEventListener('click', () => {
  paused = !paused
  hud.pause.classList.toggle('active', paused)
  hud.pause.textContent = paused ? 'GO' : 'II'
  hud.pause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation')
  hud.pause.setAttribute('title', paused ? 'Resume animation' : 'Pause animation')
  showToast(paused ? 'Animation paused' : 'Animation resumed')
})

hud.capture.addEventListener('click', () => {
  renderer.render()
  const link = document.createElement('a')
  const mode = (hud.mode.textContent || 'math-vis').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  link.download = `${mode || 'math-vis'}-${new Date().toISOString().slice(0, 10)}.png`
  link.href = renderer.domElement.toDataURL('image/png')
  link.click()
  showToast('Saved PNG snapshot')
})

hud.fullscreen.addEventListener('click', async () => {
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

hud.spatial.addEventListener('click', () => {
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
window.addEventListener('mousemove', e => {
  gsap.set(cursorDot,  { x: e.clientX, y: e.clientY })
  gsap.set(cursorRing, { x: e.clientX, y: e.clientY })
})

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

  requestAnimationFrame(mountControlPane)

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
    updateAnalytics(dt)
    analyticsSampleTime = now
  }
}

tick()
