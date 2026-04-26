/**
 * main.js — entry point
 *
 * Boots renderer (PerspectiveCamera + OrbitControls + bloom) and runs loop.
 * Temporary keyboard switching: press 1 = Lissajous, 2 = Waves.
 * A proper nav bar replaces this in M5.
 */

import { Renderer }      from './core/renderer.js'
import { LissajousMode } from './modes/lissajous.js'
import { WavesMode }     from './modes/waves.js'

const renderer = new Renderer()
let   prevTime = performance.now()

let activeMode = new LissajousMode(renderer.scene)

// ---------------------------------------------------------------------------
// Mode switching — temporary until nav bar (M5)
// ---------------------------------------------------------------------------

window.addEventListener('keydown', e => {
  if (e.key === '1') switchTo('lissajous')
  if (e.key === '2') switchTo('waves')
})

function switchTo(name) {
  activeMode.dispose()
  renderer.scene.clear()

  if (name === 'lissajous') {
    activeMode = new LissajousMode(renderer.scene)
  } else if (name === 'waves') {
    // WavesMode needs the renderer for raycasting (camera) and event binding (canvas)
    activeMode = new WavesMode(renderer.scene, renderer)
  }
}

// ---------------------------------------------------------------------------
// Resize — forward to active mode if it needs to rebuild geometry
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  if (activeMode.onResize) activeMode.onResize()
})

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function tick() {
  requestAnimationFrame(tick)
  const now = performance.now()
  const dt  = Math.min((now - prevTime) / 1000, 0.05) // cap at 50ms — prevents large jumps if tab is backgrounded
  prevTime  = now
  activeMode.update(dt)
  renderer.render()
}

tick()
