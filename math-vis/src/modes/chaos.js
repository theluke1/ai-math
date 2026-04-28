/**
 * chaos.js — Chaotic Attractor Visualizer
 *
 * Numerically integrates strange attractors using 4th-order Runge-Kutta (RK4).
 * RK4 is used rather than Euler because Euler can introduce artificial divergence
 * in chaotic systems at larger dt — RK4 stays accurate with far fewer steps.
 *
 * Two trajectories run simultaneously:
 *   Main  — the primary trail
 *   Shadow — starts 0.001 away from the main initial condition
 *
 * As time passes the two trajectories diverge exponentially. The separation
 * distance is displayed in the analytics panel and visually demonstrates the
 * Lyapunov exponent: nearby states become uncorrelated within finite time.
 *
 * Colour maps velocity magnitude |dz/dt| to a blue→cyan→white gradient.
 * Fast regions of the attractor glow bright; slow regions (where trajectories
 * linger) stay deep blue. This reveals the non-uniform time structure of chaos.
 *
 * Available attractors:
 *   Lorenz, Rössler, Halvorsen, Thomas, Chen, Aizawa, Dadras,
 *   Rabinovich-Fabrikant, Lorenz 83, Sprott B, Burke-Shaw
 *
 * Each is defined as { label, params, init, scale, equations, deriv } so
 * adding new ones is a matter of adding an entry to the ATTRACTORS table below.
 */

import * as THREE from 'three'
import { gsap }         from 'gsap'
import { Pane }         from 'tweakpane'
import { Axes }         from '../core/axes.js'
import { animatePanel } from '../core/ui.js'

const TRAIL_LENGTH  = 6000    // points in the main trail
const STEPS_PER_FRAME = 8    // RK4 sub-steps per animation frame
const DT_INTEGRATION = 0.005  // fixed integration step (seconds of attractor time)

// ---------------------------------------------------------------------------
// Attractor library
// ---------------------------------------------------------------------------

const ATTRACTORS = {
  lorenz: {
    label:  'Lorenz',
    params: { σ: 10, ρ: 28, β: 2.667 },
    init:   [0.1, 0, 0],
    scale:  0.038,
    equations: [
      'ẋ = σ(y − x)',
      'ẏ = x(ρ − z) − y',
      'ż = xy − βz',
      'σ=10  ρ=28  β=2.667',
    ],
    deriv(s, p, o) {
      o[0] = p.σ * (s[1] - s[0])
      o[1] = s[0] * (p.ρ - s[2]) - s[1]
      o[2] = s[0] * s[1] - p.β * s[2]
    },
  },

  rossler: {
    label:  'Rössler',
    params: { a: 0.2, b: 0.2, c: 5.7 },
    init:   [0.1, 0, 0],
    scale:  0.052,
    equations: [
      'ẋ = −y − z',
      'ẏ = x + ay',
      'ż = b + z(x − c)',
      'a=0.2  b=0.2  c=5.7',
    ],
    deriv(s, p, o) {
      o[0] = -s[1] - s[2]
      o[1] =  s[0] + p.a * s[1]
      o[2] =  p.b + s[2] * (s[0] - p.c)
    },
  },

  halvorsen: {
    label:  'Halvorsen',
    params: { a: 1.89 },
    init:   [-1.48, -1.51, 2.04],
    scale:  0.18,
    equations: [
      'ẋ = −ax − 4y − 4z − y²',
      'ẏ = −ay − 4z − 4x − z²',
      'ż = −az − 4x − 4y − x²',
      'a=1.89',
    ],
    deriv(s, p, o) {
      const a = p.a
      o[0] = -a * s[0] - 4 * s[1] - 4 * s[2] - s[1] * s[1]
      o[1] = -a * s[1] - 4 * s[2] - 4 * s[0] - s[2] * s[2]
      o[2] = -a * s[2] - 4 * s[0] - 4 * s[1] - s[0] * s[0]
    },
  },

  thomas: {
    label:  'Thomas',
    params: { b: 0.19 },
    init:   [0.1, 0, 0],
    scale:  0.28,
    equations: [
      'ẋ = sin(y) − bx',
      'ẏ = sin(z) − by',
      'ż = sin(x) − bz',
      'b=0.19',
    ],
    deriv(s, p, o) {
      o[0] = Math.sin(s[1]) - p.b * s[0]
      o[1] = Math.sin(s[2]) - p.b * s[1]
      o[2] = Math.sin(s[0]) - p.b * s[2]
    },
  },

  chen: {
    label:  'Chen',
    params: { a: 35, b: 3, c: 28 },
    init:   [-0.1, 0.5, 0.6],
    scale:  0.030,
    equations: [
      'ẋ = a(y − x)',
      'ẏ = (c−a)x − xz + cy',
      'ż = xy − bz',
      'a=35  b=3  c=28',
    ],
    deriv(s, p, o) {
      o[0] = p.a * (s[1] - s[0])
      o[1] = (p.c - p.a) * s[0] - s[0] * s[2] + p.c * s[1]
      o[2] = s[0] * s[1] - p.b * s[2]
    },
  },

  aizawa: {
    label:  'Aizawa',
    params: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 },
    init:   [0.1, 0, 0],
    scale:  0.60,
    equations: [
      'ẋ = (z−b)x − dy',
      'ẏ = dx + (z−b)y',
      'ż = c + az − z³/3',
      '    − (x²+y²)(1+ez) + fzx³',
      'a=0.95 b=0.7 c=0.6 d=3.5',
    ],
    deriv(s, p, o) {
      const x = s[0], y = s[1], z = s[2]
      o[0] = (z - p.b) * x - p.d * y
      o[1] = p.d * x + (z - p.b) * y
      o[2] = p.c + p.a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + p.e * z) + p.f * z * x * x * x
    },
  },

  dadras: {
    label:  'Dadras',
    params: { a: 3, b: 2.7, c: 1.7, d: 2, e: 9 },
    init:   [0.1, 0.03, 0],
    scale:  0.12,
    equations: [
      'ẋ = y − ax + byz',
      'ẏ = cy − xz + z',
      'ż = dxy − ez',
      'a=3  b=2.7  c=1.7  d=2  e=9',
    ],
    deriv(s, p, o) {
      o[0] = s[1] - p.a * s[0] + p.b * s[1] * s[2]
      o[1] = p.c * s[1] - s[0] * s[2] + s[2]
      o[2] = p.d * s[0] * s[1] - p.e * s[2]
    },
  },

  rabinovich: {
    label:  'Rabinovich-Fabrikant',
    params: { α: 0.14, γ: 0.1 },
    init:   [-1.0, 0.0, 0.5],
    scale:  0.44,
    equations: [
      'ẋ = y(z − 1 + x²) + γx',
      'ẏ = x(3z + 1 − x²) + γy',
      'ż = −2z(α + xy)',
      'α=0.14  γ=0.1',
    ],
    deriv(s, p, o) {
      const x = s[0], y = s[1], z = s[2]
      o[0] = y * (z - 1 + x * x) + p.γ * x
      o[1] = x * (3 * z + 1 - x * x) + p.γ * y
      o[2] = -2 * z * (p.α + x * y)
    },
  },

  lorenz83: {
    label:  'Lorenz 83',
    params: { a: 0.95, b: 7.91, F: 4.83, G: 4.66 },
    init:   [-0.2, -0.5, 0.3],
    scale:  0.14,
    equations: [
      'ẋ = −ax − y² − z² + aF',
      'ẏ = −y + xy − bxz + G',
      'ż = −z + bxy + xz',
      'a=0.95  b=7.91  F=4.83  G=4.66',
    ],
    deriv(s, p, o) {
      const x = s[0], y = s[1], z = s[2]
      o[0] = -p.a * x - y * y - z * z + p.a * p.F
      o[1] = -y + x * y - p.b * x * z + p.G
      o[2] = -z + p.b * x * y + x * z
    },
  },

  sprottB: {
    label:  'Sprott B',
    params: {},
    init:   [0.6, 0.6, 0.6],
    scale:  0.50,
    equations: [
      'ẋ = yz',
      'ẏ = x − y',
      'ż = 1 − xy',
    ],
    deriv(s, p, o) {
      o[0] = s[1] * s[2]
      o[1] = s[0] - s[1]
      o[2] = 1 - s[0] * s[1]
    },
  },

  burkeshaw: {
    label:  'Burke-Shaw',
    params: { s: 10, b: 4.272 },
    init:   [0.1, 0, 0],
    scale:  0.065,
    equations: [
      'ẋ = −s(x + y)',
      'ẏ = −y − sxz',
      'ż = sxy + b',
      's=10  b=4.272',
    ],
    deriv(s, p, o) {
      const x = s[0], y = s[1], z = s[2]
      o[0] = -p.s * (x + y)
      o[1] = -y - p.s * x * z
      o[2] = p.s * x * y + p.b
    },
  },
}

// ---------------------------------------------------------------------------
// RK4 integrator — integrates a single step h
// ---------------------------------------------------------------------------

const _k1 = [0, 0, 0]
const _k2 = [0, 0, 0]
const _k3 = [0, 0, 0]
const _k4 = [0, 0, 0]
const _tmp = [0, 0, 0]

function rk4Step(state, h, attractor) {
  const { deriv, params } = attractor
  const s = state

  deriv(s, params, _k1)

  _tmp[0] = s[0] + h * _k1[0] / 2
  _tmp[1] = s[1] + h * _k1[1] / 2
  _tmp[2] = s[2] + h * _k1[2] / 2
  deriv(_tmp, params, _k2)

  _tmp[0] = s[0] + h * _k2[0] / 2
  _tmp[1] = s[1] + h * _k2[1] / 2
  _tmp[2] = s[2] + h * _k2[2] / 2
  deriv(_tmp, params, _k3)

  _tmp[0] = s[0] + h * _k3[0]
  _tmp[1] = s[1] + h * _k3[1]
  _tmp[2] = s[2] + h * _k3[2]
  deriv(_tmp, params, _k4)

  s[0] += (h / 6) * (_k1[0] + 2 * _k2[0] + 2 * _k3[0] + _k4[0])
  s[1] += (h / 6) * (_k1[1] + 2 * _k2[1] + 2 * _k3[1] + _k4[1])
  s[2] += (h / 6) * (_k1[2] + 2 * _k2[2] + 2 * _k3[2] + _k4[2])
}

// ---------------------------------------------------------------------------
// Shaders — Line-based, velocity colour interpolated per segment by GPU
// ---------------------------------------------------------------------------

// Main trail: velocity mapped to blue→cyan→white, fades with age
const chaosVert = /* glsl */`
  attribute float vVelocity;
  attribute float age;
  varying  float fVelocity;
  varying  float fAge;
  void main() {
    fVelocity   = vVelocity;
    fAge        = age;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const chaosFrag = /* glsl */`
  varying float fVelocity;
  varying float fAge;
  void main() {
    float fade = pow(fAge, 0.85);
    vec3 slow  = vec3(0.02, 0.08, 0.55);
    vec3 mid   = vec3(0.00, 0.75, 1.00);
    vec3 fast  = vec3(1.40, 1.40, 1.50);
    vec3 colour = fVelocity < 0.5
      ? mix(slow, mid,  fVelocity * 2.0)
      : mix(mid,  fast, (fVelocity - 0.5) * 2.0);
    gl_FragColor = vec4(colour, fade * 0.88);
  }
`

// Shadow trail: amber, fades with age
const shadowVert = /* glsl */`
  attribute float age;
  varying  float fAge;
  void main() {
    fAge        = age;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const shadowFrag = /* glsl */`
  varying float fAge;
  void main() {
    gl_FragColor = vec4(1.0, 0.55, 0.05, pow(fAge, 1.2) * 0.50);
  }
`

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export class ChaosMode {
  // renderer is passed so Axes can mount CSS2D labels
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer

    this._attractorKey = 'lorenz'
    this._attractor    = ATTRACTORS[this._attractorKey]

    // Main and shadow states
    this._state       = [...this._attractor.init]
    this._shadowState = this._state.map((v, i) => i === 0 ? v + 0.001 : v)

    // Position + attribute buffers for main trail
    this._positions   = new Float32Array(TRAIL_LENGTH * 3)
    this._ages        = new Float32Array(TRAIL_LENGTH)
    this._velocities  = new Float32Array(TRAIL_LENGTH)

    // Shadow trail (shorter — just enough to see divergence)
    const SHADOW_LEN  = Math.floor(TRAIL_LENGTH / 3)
    this._shadowPos   = new Float32Array(SHADOW_LEN * 3)
    this._shadowAges  = new Float32Array(SHADOW_LEN)
    this._SHADOW_LEN  = SHADOW_LEN

    this._maxVelocity = 1   // updated dynamically for normalisation

    this.params = {
      showShadow:  true,
      shadowDist:  0,      // live readout
      speed:       1.0,
    }

    this._initBuffers()
    this._buildMesh()
    this._buildShadowMesh()
    this._buildUI()
    this.axes = new Axes(scene, renderer)
  }

  // -------------------------------------------------------------------------
  // Buffers
  // -------------------------------------------------------------------------

  _initBuffers() {
    const init = this._attractor.init
    const sc   = this._attractor.scale
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this._positions[i * 3]     = init[0] * sc
      this._positions[i * 3 + 1] = init[1] * sc
      this._positions[i * 3 + 2] = init[2] * sc
      this._ages[i]       = Math.pow(1 - i / (TRAIL_LENGTH - 1), 1.5)
      this._velocities[i] = 0
    }
    const sl = this._SHADOW_LEN
    for (let i = 0; i < sl; i++) {
      this._shadowPos[i * 3]     = init[0] * sc
      this._shadowPos[i * 3 + 1] = init[1] * sc
      this._shadowPos[i * 3 + 2] = init[2] * sc
      this._shadowAges[i] = Math.pow(1 - i / (sl - 1), 1.5)
    }
  }

  _buildMesh() {
    this.geometry = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(this._positions, 3)
    const ageAttr = new THREE.BufferAttribute(this._ages, 1)
    const velAttr = new THREE.BufferAttribute(this._velocities, 1)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    velAttr.setUsage(THREE.DynamicDrawUsage)

    this.geometry.setAttribute('position',  posAttr)
    this.geometry.setAttribute('age',       ageAttr)
    this.geometry.setAttribute('vVelocity', velAttr)

    this.material = new THREE.ShaderMaterial({
      vertexShader:   chaosVert,
      fragmentShader: chaosFrag,
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })

    this.mesh = new THREE.Line(this.geometry, this.material)
    this.scene.add(this.mesh)
  }

  _buildShadowMesh() {
    this.shadowGeometry = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(this._shadowPos, 3)
    const ageAttr = new THREE.BufferAttribute(this._shadowAges, 1)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    this.shadowGeometry.setAttribute('position',  posAttr)
    this.shadowGeometry.setAttribute('age',       ageAttr)
    this.shadowGeometry.setAttribute('vVelocity',
      new THREE.BufferAttribute(new Float32Array(this._SHADOW_LEN), 1))

    this.shadowMaterial = new THREE.ShaderMaterial({
      vertexShader:   chaosVert,
      fragmentShader: chaosFrag,
      uniforms: {},
      transparent: true,
      depthTest:   false,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })

    this.shadowMesh = new THREE.Line(this.shadowGeometry, new THREE.ShaderMaterial({
      vertexShader:   shadowVert,
      fragmentShader: shadowFrag,
      transparent:    true,
      depthTest:      false,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    }))
    this.scene.add(this.shadowMesh)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Chaos Attractors' })
    Object.assign(this.pane.element.style, {
      position: 'fixed',
      top:      '60px',
      right:    '16px',
      zIndex:   '100',
      width:    '260px',
    })
    animatePanel(this.pane)

    // Attractor selector
    const attractorFolder = this.pane.addFolder({ title: 'Attractor', expanded: true })
    for (const [key, att] of Object.entries(ATTRACTORS)) {
      attractorFolder.addButton({ title: att.label }).on('click', () => {
        this._switchAttractor(key)
      })
    }

    // Equations display — DOM-injected so text spans full width
    const eqFolder = this.pane.addFolder({ title: 'Equations', expanded: true })
    this._eqEl = document.createElement('div')
    this._eqEl.className = 'tp-guide'
    eqFolder.element.appendChild(this._eqEl)
    this._updateEquations()

    // Animation
    this.pane.addBinding(this.params, 'speed', {
      label: 'speed', min: 0.1, max: 3.0, step: 0.1,
    })

    // Shadow trajectory toggle
    this.pane.addBinding(this.params, 'showShadow', {
      label: 'shadow trajectory',
    }).on('change', ({ value }) => {
      this.shadowMesh.visible = value
    })

    // Analytics
    const analyticsFolder = this.pane.addFolder({ title: 'Analytics', expanded: false })
    this._distBinding = analyticsFolder.addBinding(this.params, 'shadowDist', {
      label: 'divergence',
      readonly: true,
      format: v => v.toFixed(4),
    })

    analyticsFolder.addBinding(this._state, '0', { label: 'x', readonly: true, format: v => v.toFixed(3) })
    analyticsFolder.addBinding(this._state, '1', { label: 'y', readonly: true, format: v => v.toFixed(3) })
    analyticsFolder.addBinding(this._state, '2', { label: 'z', readonly: true, format: v => v.toFixed(3) })
  }

  _updateEquations() {
    this._eqEl.innerHTML = ''
    const lines = this._attractor.equations || []
    lines.forEach(text => {
      const d = document.createElement('div')
      d.className = 'tp-guide__line'
      d.textContent = text
      this._eqEl.appendChild(d)
    })
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  update(dt) {
    const att   = this._attractor
    const sc    = att.scale
    const steps = Math.max(1, Math.round(STEPS_PER_FRAME * this.params.speed))
    const h     = DT_INTEGRATION
    const sl    = this._SHADOW_LEN

    // Push a ring-buffer point at EVERY sub-step, not just once per frame.
    // Previously only one point was stored after all sub-steps ran, meaning
    // each line segment spanned 8 integration steps — producing visible corners.
    // Now each segment spans exactly 1 step (h = 0.005), giving smooth curves.
    for (let s = 0; s < steps; s++) {
      // Velocity at current state (before advancing) — used for colour mapping
      att.deriv(this._state, att.params, _k1)
      const vx = _k1[0], vy = _k1[1], vz = _k1[2]
      const spd = Math.sqrt(vx * vx + vy * vy + vz * vz)
      this._maxVelocity = Math.max(this._maxVelocity * 0.9999, spd)
      const normSpeed   = Math.min(spd / this._maxVelocity, 1)

      rk4Step(this._state,       h, att)
      rk4Step(this._shadowState, h, att)

      // Shift and push main trail
      this._positions.copyWithin(3, 0, (TRAIL_LENGTH - 1) * 3)
      this._velocities.copyWithin(1, 0, TRAIL_LENGTH - 1)
      this._positions[0] = this._state[0] * sc
      this._positions[1] = this._state[1] * sc
      this._positions[2] = this._state[2] * sc
      this._velocities[0] = normSpeed

      // Shift and push shadow trail
      this._shadowPos.copyWithin(3, 0, (sl - 1) * 3)
      this._shadowPos[0] = this._shadowState[0] * sc
      this._shadowPos[1] = this._shadowState[1] * sc
      this._shadowPos[2] = this._shadowState[2] * sc
    }

    this.geometry.attributes.position.needsUpdate  = true
    this.geometry.attributes.vVelocity.needsUpdate = true
    this.shadowGeometry.attributes.position.needsUpdate = true

    // Update analytics
    const dx = this._state[0] - this._shadowState[0]
    const dy = this._state[1] - this._shadowState[1]
    const dz = this._state[2] - this._shadowState[2]
    this.params.shadowDist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    this._distBinding.refresh()
  }

  // -------------------------------------------------------------------------
  // Attractor switching
  // -------------------------------------------------------------------------

  _switchAttractor(key) {
    this._attractorKey = key
    this._attractor    = ATTRACTORS[key]
    this._state        = [...this._attractor.init]
    this._shadowState  = this._state.map((v, i) => i === 0 ? v + 0.001 : v)
    this._maxVelocity  = 1
    this._initBuffers()
    this.geometry.attributes.position.needsUpdate  = true
    this.geometry.attributes.vVelocity.needsUpdate = true
    this.shadowGeometry.attributes.position.needsUpdate = true
    this._updateEquations()
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose() {
    this.scene.remove(this.mesh)
    this.scene.remove(this.shadowMesh)
    this.geometry.dispose()
    this.material.dispose()
    this.shadowGeometry.dispose()
    this.shadowMesh.material.dispose()
    this.axes.dispose()
    this.pane.dispose()
  }
}
