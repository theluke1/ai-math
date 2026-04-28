/**
 * lissajous.js
 *
 * Lissajous / parametric curve mode.
 *
 * A Lissajous figure is the path traced by a point whose x and y coordinates
 * are independent sinusoidal oscillations:
 *
 *   x(t) = A · sin(a·t + δ)
 *   y(t) = B · sin(b·t)
 *
 * The shape is determined by:
 *   a, b  — frequency ratio. Integer ratios produce closed, stable curves.
 *           Non-integer ratios produce open curves that slowly precess.
 *   δ     — phase difference. Sweeping δ from 0 → 2π morphs the curve
 *           continuously (circle → ellipse → line → ellipse → circle).
 *   A, B  — amplitudes (scale). Both default to 0.85 to fill most of the screen.
 *
 * Trail implementation:
 *   We maintain a ring buffer of TRAIL_LENGTH positions. Each frame, the new
 *   point is prepended (copyWithin shifts the rest back). Ages are precomputed
 *   once as a power curve — newest point has age 1.0, oldest has age 0.0.
 *   The geometry is updated in-place each frame (no allocations in the loop).
 *
 * Rendering:
 *   THREE.Line with ShaderMaterial + AdditiveBlending. Additive blending means
 *   where the trail crosses itself the colours sum and get brighter — this is
 *   the phosphor/oscilloscope effect.
 */

import * as THREE from 'three'
import { gsap }          from 'gsap'
import { Pane }          from 'tweakpane'
import { Axes }          from '../core/axes.js'
import { animatePanel }  from '../core/ui.js'
import lissajousVert from '../shaders/lissajous.vert'
import lissajousFrag from '../shaders/lissajous.frag'

const TRAIL_LENGTH = 2000

// Named presets — now with z-frequency (c) and z-amplitude (C) for 3D figures
const PRESETS = {
  '1:2:3  (3D)': { a: 1, b: 2, c: 3, delta: Math.PI/4, deltaZ: Math.PI/3, A: 0.8, B: 0.8, C: 0.8, speed: 1.0 },
  '2:3:4  (3D)': { a: 2, b: 3, c: 4, delta: Math.PI/4, deltaZ: Math.PI/5, A: 0.8, B: 0.8, C: 0.8, speed: 0.9 },
  '3:4:5  (3D)': { a: 3, b: 4, c: 5, delta: Math.PI/6, deltaZ: Math.PI/4, A: 0.8, B: 0.8, C: 0.8, speed: 0.8 },
  '1:2  flat':   { a: 1, b: 2, c: 0, delta: Math.PI/4, deltaZ: 0,         A: 0.85, B: 0.85, C: 0, speed: 1.2 },
  '3:7  flat':   { a: 3, b: 7, c: 0, delta: Math.PI/5, deltaZ: 0,         A: 0.85, B: 0.85, C: 0, speed: 0.7 },
}

export class LissajousMode {
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer

    // --- Parameters (these are read by Tweakpane controls) ---
    this.params = {
      a:      2,
      b:      3,
      c:      4,              // z-axis frequency
      delta:  Math.PI / 4,   // x phase offset δ
      deltaZ: Math.PI / 3,   // z phase offset
      A:      0.8,
      B:      0.8,
      C:      0.8,            // z amplitude
      speed:  1.0,
    }

    this.t = 0              // parametric time, advances each frame

    // --- Buffers ---
    // positions: flat [x0,y0,z0, x1,y1,z1, ...] for THREE.BufferGeometry
    // ages: precomputed power-curve fade from 1.0 (newest) to 0.0 (oldest)
    this._positions = new Float32Array(TRAIL_LENGTH * 3)
    this._ages      = new Float32Array(TRAIL_LENGTH)

    this._initBuffers()
    this._buildMesh()
    this._buildUI()
    this.axes = new Axes(scene, renderer)
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  _initBuffers() {
    const { a, b, c, delta, deltaZ, A, B, C } = this.params
    const startX = A * Math.sin(delta)
    const startY = B * Math.sin(0)
    const startZ = C * Math.sin(deltaZ)

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this._positions[i * 3]     = startX
      this._positions[i * 3 + 1] = startY
      this._positions[i * 3 + 2] = startZ

      // Power curve: age stays high for longer, then falls sharply near the tail
      // Power 1.5 gives a nice phosphor-decay feel
      this._ages[i] = Math.pow(1 - i / (TRAIL_LENGTH - 1), 1.5)
    }
  }

  _buildMesh() {
    this.geometry = new THREE.BufferGeometry()

    // BufferAttribute(array, itemSize)
    const posAttr = new THREE.BufferAttribute(this._positions, 3)
    const ageAttr = new THREE.BufferAttribute(this._ages, 1)
    posAttr.setUsage(THREE.DynamicDrawUsage)  // positions update every frame

    this.geometry.setAttribute('position', posAttr)
    this.geometry.setAttribute('age',      ageAttr)

    this.material = new THREE.ShaderMaterial({
      vertexShader:   lissajousVert,
      fragmentShader: lissajousFrag,
      uniforms: {
        // Electric cyan — safe for red-green colorblindness
        uColour: { value: new THREE.Color(0x00ffee) },
      },
      transparent:  true,
      depthTest:    false,
      depthWrite:   false,
      // Additive: overlapping parts of the trail add together and get brighter
      blending:     THREE.AdditiveBlending,
    })

    this.mesh = new THREE.Line(this.geometry, this.material)
    this.scene.add(this.mesh)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Lissajous' })

    // Position the panel top-right, slide in from the right
    Object.assign(this.pane.element.style, {
      position: 'fixed',
      top:      '60px',
      right:    '16px',
      zIndex:   '100',
      width:    '260px',
    })
    animatePanel(this.pane)

    // --- Frequency ratio ---
    const freqFolder = this.pane.addFolder({ title: 'Frequencies  a : b : c', expanded: true })
    freqFolder.addBinding(this.params, 'a', { label: 'a  (x)', min: 1, max: 12, step: 1 })
    freqFolder.addBinding(this.params, 'b', { label: 'b  (y)', min: 1, max: 12, step: 1 })
    freqFolder.addBinding(this.params, 'c', { label: 'c  (z)', min: 0, max: 12, step: 1 })

    // --- Phase & amplitude ---
    const shapeFolder = this.pane.addFolder({ title: 'Shape', expanded: true })
    shapeFolder.addBinding(this.params, 'delta',  { label: 'δx phase', min: 0, max: Math.PI * 2, step: 0.01 })
    shapeFolder.addBinding(this.params, 'deltaZ', { label: 'δz phase', min: 0, max: Math.PI * 2, step: 0.01 })
    shapeFolder.addBinding(this.params, 'A', { label: 'A  (x scale)', min: 0.1, max: 1.0, step: 0.01 })
    shapeFolder.addBinding(this.params, 'B', { label: 'B  (y scale)', min: 0.1, max: 1.0, step: 0.01 })
    shapeFolder.addBinding(this.params, 'C', { label: 'C  (z scale)', min: 0.0, max: 1.0, step: 0.01 })

    // --- Animation ---
    const animFolder = this.pane.addFolder({ title: 'Animation', expanded: true })
    animFolder.addBinding(this.params, 'speed', {
      label: 'speed  (rad/s)',
      min: 0.1, max: 4.0, step: 0.05,
    })

    // --- Presets ---
    const presetFolder = this.pane.addFolder({ title: 'Presets', expanded: true })
    for (const [label, values] of Object.entries(PRESETS)) {
      presetFolder.addButton({ title: label }).on('click', () => {
        Object.assign(this.params, values)
        this.pane.refresh()       // update slider positions to match new values
        this._resetTrail()        // clear old trail so it doesn't show stale positions
      })
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame update — called from main.js animation loop
  // -------------------------------------------------------------------------

  /**
   * Attach an AudioReactive instance so this mode can modulate its
   * frequencies from live microphone input.
   * @param {import('../core/audio.js').AudioReactive} audio
   */
  setAudio(audio) { this._audio = audio }

  update(dt) {
    const { a, b, c, delta, deltaZ, A, B, C, speed } = this.params

    // Audio modulation — bass warps x-freq, treble warps z-freq.
    // The stored params never change; this is a per-frame overlay.
    const audio = this._audio
    const aLive = audio?.enabled ? a * (1 + audio.bass   * 0.55) : a
    const bLive = audio?.enabled ? b * (1 + audio.mid    * 0.35) : b
    const cLive = audio?.enabled ? c * (1 + audio.treble * 0.55) : c
    const ALive = audio?.enabled ? Math.min(1, A * (1 + audio.bass * 0.25))   : A
    const BLive = audio?.enabled ? Math.min(1, B * (1 + audio.mid  * 0.25))   : B

    const SAMPLES = Math.max(4, Math.ceil(speed * 4))
    const step    = (dt * speed) / SAMPLES

    for (let s = 0; s < SAMPLES; s++) {
      this.t += step

      const x = ALive * Math.sin(aLive * this.t + delta)
      const y = BLive * Math.sin(bLive * this.t)
      const z = C     * Math.sin(cLive * this.t + deltaZ)

      this._positions.copyWithin(3, 0, (TRAIL_LENGTH - 1) * 3)

      this._positions[0] = x
      this._positions[1] = y
      this._positions[2] = z
    }

    this.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Clear the trail — used when switching presets so old path doesn't linger */
  _resetTrail() {
    this.t = 0
    this._initBuffers()
    this.geometry.attributes.position.needsUpdate = true
  }

  /** Call when switching away from this mode — cleans up scene and UI */
  dispose() {
    this.scene.remove(this.mesh)
    this.geometry.dispose()
    this.material.dispose()
    this.axes.dispose()
    this.pane.dispose()
  }
}
