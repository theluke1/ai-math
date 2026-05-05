/**
 * rose.js — Rose Curves (Rhodonea)
 *
 * Parametric equations in polar coordinates: r = cos(k·θ)
 * Converted to 3D Cartesian with an optional z oscillation:
 *
 *   x(θ) = cos(k·θ) · cos(θ)
 *   y(θ) = cos(k·θ) · sin(θ)
 *   z(θ) = sin(n·θ) · h          ← lifts petals off the plane
 *
 * Petal count:
 *   k odd integer  → k petals
 *   k even integer → 2k petals
 *   k = p/q (rational, reduced) → closes after q full rotations, p·q petals
 *   k irrational   → never closes — fills the sphere (spirograph feel)
 *
 * Non-integer k values are where it gets beautiful. Try k = 2.5, 3.5, 7/3.
 *
 * Rendering: same ring-buffer / additive-blending / shader approach as
 * Lissajous. The tip is overbright white → bloom. Older trail segments
 * fade with a power-curve age attribute.
 */

import * as THREE from 'three'
import { gsap }         from 'gsap'
import { Pane }         from 'tweakpane'
import { animatePanel } from '../core/ui.js'
import { Axes }   from '../core/axes.js'
import lissajousVert from '../shaders/lissajous.vert'
import lissajousFrag from '../shaders/lissajous.frag'

const TRAIL_LENGTH = 3000

const PRESETS = {
  '3 petals':     { k: 3,   n: 0,   h: 0,    speed: 0.4 },
  '5 petals':     { k: 5,   n: 0,   h: 0,    speed: 0.3 },
  '7/2 rose':     { k: 3.5, n: 0,   h: 0,    speed: 0.25 },
  '4 petals 3D':  { k: 2,   n: 3,   h: 0.5,  speed: 0.4 },
  'Spirograph':   { k: 7/3, n: 0,   h: 0,    speed: 0.2 },
  'Sphere wrap':  { k: 5,   n: 7,   h: 0.55, speed: 0.2 },
  '11/6 open':    { k: 11/6, n: 0,  h: 0,    speed: 0.15 },
}

export class RoseMode {
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer
    this.t = 0

    this.params = {
      k:     3,      // petal frequency
      n:     0,      // z-axis oscillation frequency
      h:     0.0,    // z-axis amplitude (0 = flat)
      speed: 0.4,
    }

    this._positions = new Float32Array(TRAIL_LENGTH * 3)
    this._ages      = new Float32Array(TRAIL_LENGTH)

    this._initBuffers()
    this._buildMesh()
    this._buildUI()
    this.axes = new Axes(scene, renderer)
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  _initBuffers() {
    const p = this._eval(0)
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this._positions[i * 3]     = p.x
      this._positions[i * 3 + 1] = p.y
      this._positions[i * 3 + 2] = p.z
      this._ages[i] = Math.pow(1 - i / (TRAIL_LENGTH - 1), 1.5)
    }
  }

  /** Evaluate rose curve at parameter θ */
  _eval(theta) {
    const { k, n, h } = this.params
    const r = Math.cos(k * theta)
    return {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta),
      z: Math.sin(n * theta) * h,
    }
  }

  _buildMesh() {
    this.geometry = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(this._positions, 3)
    const ageAttr = new THREE.BufferAttribute(this._ages, 1)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', posAttr)
    this.geometry.setAttribute('age',      ageAttr)

    this.material = new THREE.ShaderMaterial({
      vertexShader:   lissajousVert,
      fragmentShader: lissajousFrag,
      uniforms: {
        uColour: { value: new THREE.Color(0xff99ff) },  // soft magenta — distinct from Lissajous cyan
      },
      transparent:  true,
      depthTest:    false,
      depthWrite:   false,
      blending:     THREE.NormalBlending,
    })

    this.mesh = new THREE.Line(this.geometry, this.material)
    this.scene.add(this.mesh)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Rose Curves' })
    Object.assign(this.pane.element.style, {
      position: 'fixed',
      top:      '60px',
      right:    '16px',
      zIndex:   '100',
      width:    '260px',
    })
    animatePanel(this.pane)

    const shapeFolder = this.pane.addFolder({ title: 'Shape', expanded: true })
    shapeFolder.addBinding(this.params, 'k', {
      label: 'k  (petals)', min: 0.5, max: 12, step: 0.01,
    }).on('change', () => this._reset())

    shapeFolder.addBinding(this.params, 'n', {
      label: 'n  (z freq)', min: 0, max: 12, step: 0.01,
    }).on('change', () => this._reset())

    shapeFolder.addBinding(this.params, 'h', {
      label: 'h  (z height)', min: 0, max: 1.0, step: 0.01,
    }).on('change', () => this._reset())

    const motionFolder = this.pane.addFolder({ title: 'Motion', expanded: true })
    motionFolder.addBinding(this.params, 'speed', {
      label: 'speed', min: 0.05, max: 2.0, step: 0.05,
    })

    const presetFolder = this.pane.addFolder({ title: 'Presets', expanded: true })
    for (const [label, values] of Object.entries(PRESETS)) {
      presetFolder.addButton({ title: label }).on('click', () => {
        Object.assign(this.params, values)
        this.pane.refresh()
        this._reset()
      })
    }
  }

  liveEquation() {
    const { k, n, h } = this.params
    return [
      `$$r(\\theta) = \\cos(${k.toFixed(2)}\\theta)$$`,
      `$$x = r\\cos\\theta,\\quad y = r\\sin\\theta,\\quad z = ${h.toFixed(2)}\\sin(${n.toFixed(2)}\\theta)$$`,
    ].join('\n')
  }

  tooltips() {
    return {
      k: 'Petal rhythm; integers produce clean symmetry, fractions create longer traces.',
      n: 'Depth wave frequency; it controls how often the rose lifts out of the plane.',
      h: 'Depth height; set near 0 for a flat polar rose.',
      speed: 'How quickly theta advances along the curve.',
    }
  }

  applyParams(params = {}) {
    Object.assign(this.params, params)
    this.pane?.refresh()
    this._reset()
    return true
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt) {
    const { speed } = this.params

    // Sub-step to keep curves smooth at high speed.
    // Without this, large Δt jumps produce straight-line segments between samples.
    const SAMPLES = Math.max(4, Math.ceil(speed * 4))
    const step    = (dt * speed) / SAMPLES

    for (let s = 0; s < SAMPLES; s++) {
      this.t += step
      const p = this._eval(this.t)

      this._positions.copyWithin(3, 0, (TRAIL_LENGTH - 1) * 3)
      this._positions[0] = p.x
      this._positions[1] = p.y
      this._positions[2] = p.z
    }

    this.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Helpers / dispose
  // -------------------------------------------------------------------------

  _reset() {
    this.t = 0
    this._initBuffers()
    this.geometry.attributes.position.needsUpdate = true
  }

  aiContext() {
    const k = this.params.k
    const nearestInteger = Math.round(k)
    const isNearInteger = Math.abs(k - nearestInteger) < 0.001
    const flat = Math.abs(this.params.h) < 0.001 || Math.abs(this.params.n) < 0.001

    return {
      mode: 'rose',
      exhibit: flat ? 'flat rhodonea curve' : '3D lifted rose curve',
      equations: [
        'r(theta) = cos(k theta)',
        'x(theta) = r(theta) cos(theta)',
        'y(theta) = r(theta) sin(theta)',
        'z(theta) = h sin(n theta)',
      ],
      equation: {
        polar: 'r = cos(k theta)',
        cartesian: [
          'x(theta) = cos(k theta) cos(theta)',
          'y(theta) = cos(k theta) sin(theta)',
          'z(theta) = sin(n theta) h',
        ],
      },
      params: { ...this.params },
      interpretation: {
        kType: isNearInteger ? 'integer' : 'non-integer',
        nearestInteger,
        flat,
        zMotion: flat ? 'flat 2D curve' : '3D lifted curve',
        petalRule: isNearInteger
          ? (nearestInteger % 2 === 0 ? 'even integer k gives 2k petals' : 'odd integer k gives k petals')
          : 'non-integer k traces a longer path before closing, or may not close cleanly in finite time',
      },
    }
  }

  aiSchema() {
    return {
      params: {
        k: { min: 0.5, max: 12 },
        n: { min: 0, max: 12 },
        h: { min: 0, max: 1 },
        speed: { min: 0.05, max: 2 },
      },
    }
  }

  dispose() {
    this.scene.remove(this.mesh)
    this.geometry.dispose()
    this.material.dispose()
    this.axes.dispose()
    this.pane.dispose()
  }
}
