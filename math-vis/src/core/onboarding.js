/**
 * onboarding.js — First-visit coach-mark tour
 *
 * Shows a 4-step spotlight sequence the very first time a user enters the
 * experience. Each step highlights a UI element with a darkened overlay and
 * a floating tooltip. The tour is localStorage-gated: once dismissed or
 * completed it never appears again.
 *
 * Usage: call runOnboarding() inside enterExperience() after the title screen
 * has faded out — that guarantees all HUD elements are visible.
 */

import { gsap } from 'gsap'

const STORAGE_KEY = 'prism-onboarded'

// ── Step definitions ────────────────────────────────────────────────────────
// position: where the tooltip appears relative to the spotlight
//   'above' | 'below' | 'left' | 'right'

const STEPS = [
  {
    target:   '#gallery-btn',
    title:    'Exhibit Gallery',
    body:     'Explore 7 mathematical systems — from Fourier epicycles and chaos attractors to knots and complex analysis.',
    position: 'left',
  },
  {
    target:   '#ai-btn',
    title:    'AI Professor',
    body:     'Ask questions, generate full lessons, and explore the math behind what you\'re seeing — powered by Gemini.',
    position: 'left',
  },
  {
    target:   '#controls-btn',
    title:    'Live Controls',
    body:     'Drag sliders to reshape the visualization in real time. Every parameter change updates the 3-D scene instantly.',
    position: 'above',
  },
  {
    target:   '#live-eq',
    title:    'Live Equation',
    body:     'The governing equation stays in sync with your parameters. Math and motion always match.',
    position: 'below',
  },
]

// ── Tooltip dimensions (used for position clamping before paint) ───────────
const TT_W = 256   // matches CSS width
const TT_H = 148   // approximate rendered height

// ── Public entry point ─────────────────────────────────────────────────────

export function runOnboarding() {
  if (localStorage.getItem(STORAGE_KEY)) return

  let step = 0

  // ── DOM elements ──────────────────────────────────────────────────────────

  const spotlight = document.createElement('div')
  spotlight.className = 'prism-coach-spotlight'
  spotlight.setAttribute('aria-hidden', 'true')

  const tooltip = document.createElement('div')
  tooltip.className = 'prism-coach-tooltip'
  tooltip.setAttribute('role', 'dialog')
  tooltip.setAttribute('aria-label', 'Tour guide')
  tooltip.innerHTML = `
    <div class="prism-coach-progress">
      <span class="prism-coach-step-dots"></span>
      <span class="prism-coach-counter"></span>
    </div>
    <div class="prism-coach-title"></div>
    <div class="prism-coach-body"></div>
    <div class="prism-coach-actions">
      <button class="prism-coach-skip" type="button">Skip tour</button>
      <button class="prism-coach-next" type="button">Next →</button>
    </div>
  `

  document.body.append(spotlight, tooltip)

  // ── Dot progress indicators ───────────────────────────────────────────────

  const dotsContainer = tooltip.querySelector('.prism-coach-step-dots')
  const dots = STEPS.map((_, i) => {
    const d = document.createElement('span')
    d.className = 'prism-coach-dot'
    dotsContainer.append(d)
    return d
  })

  // ── Positioning helper ────────────────────────────────────────────────────

  function positionAtTarget(targetEl, position) {
    const rect    = targetEl.getBoundingClientRect()
    const pad     = 10   // spotlight padding around the element
    const gap     = 14   // gap between spotlight edge and tooltip

    // Place spotlight over the target
    gsap.set(spotlight, {
      left:   rect.left   - pad,
      top:    rect.top    - pad,
      width:  rect.width  + pad * 2,
      height: rect.height + pad * 2,
    })

    // Calculate tooltip position
    const sl = rect.left   - pad     // spotlight left edge
    const st = rect.top    - pad     // spotlight top edge
    const sr = rect.right  + pad     // spotlight right edge
    const sb = rect.bottom + pad     // spotlight bottom edge
    const scx = (sl + sr) / 2        // spotlight center x
    const scy = (st + sb) / 2        // spotlight center y

    let ttLeft, ttTop

    switch (position) {
      case 'left':
        ttLeft = sl - gap - TT_W
        ttTop  = scy - TT_H / 2
        break
      case 'right':
        ttLeft = sr + gap
        ttTop  = scy - TT_H / 2
        break
      case 'above':
        ttLeft = scx - TT_W / 2
        ttTop  = st - gap - TT_H
        break
      case 'below':
      default:
        ttLeft = scx - TT_W / 2
        ttTop  = sb + gap
        break
    }

    // Clamp to viewport with 8px margin
    const vw = window.innerWidth
    const vh = window.innerHeight
    ttLeft = Math.max(8, Math.min(ttLeft, vw - TT_W - 8))
    ttTop  = Math.max(8, Math.min(ttTop,  vh - TT_H - 8))

    gsap.set(tooltip, { left: ttLeft, top: ttTop })
  }

  // ── Step renderer ─────────────────────────────────────────────────────────

  function showStep(i, animate = true) {
    const s        = STEPS[i]
    const targetEl = document.querySelector(s.target)

    // If target doesn't exist, skip to the next step silently
    if (!targetEl) { goNext(); return }

    // Update content
    tooltip.querySelector('.prism-coach-counter').textContent = `${i + 1} / ${STEPS.length}`
    tooltip.querySelector('.prism-coach-title').textContent   = s.title
    tooltip.querySelector('.prism-coach-body').textContent    = s.body

    const nextBtn = tooltip.querySelector('.prism-coach-next')
    nextBtn.textContent = i === STEPS.length - 1 ? 'Done ✓' : 'Next →'

    // Update dots
    dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i))

    if (!animate) {
      positionAtTarget(targetEl, s.position)
      return
    }

    if (i === 0) {
      // First step — fade in from nothing
      positionAtTarget(targetEl, s.position)
      gsap.fromTo(
        [spotlight, tooltip],
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)', stagger: 0.07 },
      )
    } else {
      // Between steps — fade out, reposition, fade in
      gsap.timeline()
        .to([spotlight, tooltip], {
          opacity: 0,
          scale:   0.95,
          duration: 0.18,
          ease: 'power2.in',
        })
        .call(() => {
          positionAtTarget(targetEl, s.position)
        })
        .fromTo(
          [spotlight, tooltip],
          { opacity: 0, scale: 0.95 },
          { opacity: 1, scale: 1, duration: 0.28, ease: 'back.out(1.4)', stagger: 0.06 },
        )
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function goNext() {
    step++
    if (step >= STEPS.length) {
      finish()
    } else {
      showStep(step)
    }
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    gsap.to([spotlight, tooltip], {
      opacity:  0,
      scale:    0.92,
      duration: 0.28,
      ease:     'power2.in',
      onComplete: () => {
        spotlight.remove()
        tooltip.remove()
      },
    })
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  tooltip.querySelector('.prism-coach-next').addEventListener('click', goNext)
  tooltip.querySelector('.prism-coach-skip').addEventListener('click', finish)

  // Keyboard: Escape to skip, Enter/Space to advance
  const onKey = e => {
    if (e.key === 'Escape')               finish()
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goNext() }
  }
  window.addEventListener('keydown', onKey, { once: false })
  // Remove listener on finish
  const origFinish = finish
  const cleanup = () => window.removeEventListener('keydown', onKey)
  tooltip.querySelector('.prism-coach-next').addEventListener('click', cleanup, { once: true })
  tooltip.querySelector('.prism-coach-skip').addEventListener('click', cleanup, { once: true })

  // ── Start ─────────────────────────────────────────────────────────────────
  // Small delay so the entering animation fully settles before the tour appears
  setTimeout(() => showStep(0), 600)
}
