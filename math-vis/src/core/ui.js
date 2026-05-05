/**
 * ui.js — shared UI animation utilities
 *
 * animatePanel(pane, delay?)
 *   Staggers each Tweakpane blade row in from the right.
 *   Each row slides from x:+14px / opacity:0 to its natural position,
 *   delayed by 55ms per row. This creates a cascading "typewriter" feel
 *   on the control panel rather than a single block slide-in.
 *
 *   Call at the end of every mode's _buildUI(). Uses requestAnimationFrame
 *   so Tweakpane has finished constructing its DOM before we query it.
 */

import { gsap } from 'gsap'

/**
 * addGuideNotes(folderOrPane, notes)
 *
 * Injects plain-text guide lines directly into a Tweakpane folder element,
 * bypassing Tweakpane's two-column (label | value) layout entirely.
 * This avoids the "text shifted right with empty left half" problem that
 * occurs when using addBinding({ label: '', readonly: true }).
 *
 * @param {object}   folder  Tweakpane Pane or FolderApi
 * @param {string[]} notes   Lines to display
 */
export function addGuideNotes(folder, notes) {
  const wrap = document.createElement('div')
  wrap.className = 'tp-guide'
  notes.forEach(text => {
    const line = document.createElement('div')
    line.className = 'tp-guide__line'
    line.textContent = text
    wrap.appendChild(line)
  })
  folder.element.appendChild(wrap)
}

/**
 * @param {import('tweakpane').Pane} pane
 * @param {number} delay  initial delay in seconds before first row animates
 */
export function animatePanel(pane, delay = 0.1) {
  // One rAF ensures Tweakpane has rendered all blade DOM nodes
  requestAnimationFrame(() => {
    const blades = pane.element.querySelectorAll('.tp-brkv')

    // Start invisible and 14px to the right
    gsap.set(blades, { x: 14, opacity: 0 })

    gsap.to(blades, {
      x:        0,
      opacity:  1,
      duration: 0.40,
      stagger:  0.055,   // 55ms between each row
      ease:     'power3.out',
      delay,
      clearProps: 'transform,opacity',  // clean up inline styles after animation
    })
  })
}

function normalizeLabel(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[δσρβκχₙ²³⁴₁]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Attach short explanatory tooltips to Tweakpane rows.
 *
 * Tweakpane does not expose a stable DOM key on blade rows, so this helper
 * matches against visible labels and button titles. It is deliberately
 * best-effort: controls still work normally if a row cannot be matched.
 *
 * @param {import('tweakpane').Pane} pane
 * @param {Record<string, string>} tooltipMap
 */
export function annotatePanel(pane, tooltipMap = {}) {
  if (!pane?.element || !tooltipMap || !Object.keys(tooltipMap).length) return

  requestAnimationFrame(() => {
    const entries = Object.entries(tooltipMap).map(([key, tip]) => ({
      key: normalizeLabel(key),
      rawKey: key,
      tip,
    }))

    pane.element.querySelectorAll('.tp-brkv').forEach(row => {
      const labelEl = row.querySelector('.tp-lblv_l, .tp-btnv_t, .tp-rotv_t')
      const label = normalizeLabel(labelEl?.textContent || row.textContent)
      const match = entries.find(({ key, rawKey }) =>
        label === key ||
        label.includes(key) ||
        normalizeLabel(rawKey).split(' ').some(part => part.length > 1 && label.includes(part)))

      if (!match) return
      row.dataset.tooltip = match.tip
      row.setAttribute('title', match.tip)
    })
  })
}
