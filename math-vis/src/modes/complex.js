/**
 * complex.js — Complex Analysis Visualizer
 *
 * Three exhibits:
 *
 *   Landscape   — f(z) as a 3D surface: height = |f(z)|, color = arg(f(z))
 *                 Poles spike up, zeros sink to zero, branch cuts appear as
 *                 color discontinuities. Domain is the complex plane.
 *
 *   Riemann     — The Riemann sphere with Möbius transforms animated.
 *                 Points of the sphere correspond to C ∪ {∞} via stereographic
 *                 projection. A continuous Möbius transform f(z) = (az+b)/(cz+d)
 *                 animates as a flow on the sphere surface.
 *
 *   Sheets      — Multi-valued surfaces of √z, ∛z, log z lifted into R³.
 *                 Each sheet wraps around the branch point at the origin.
 *
 * Complex arithmetic is done in plain JS (no external library needed).
 * Colors use the standard argument phase wheel: arg(f) → hue, |f| → lightness.
 */

import * as THREE from 'three'
import { Pane }   from 'tweakpane'
import { animatePanel, addGuideNotes } from '../core/ui.js'

// ── Grid resolution ────────────────────────────────────────────────────────
const L_RES  = 200     // landscape: L_RES×L_RES grid
const S_RES  = 160     // sheets: S_RES×S_RES grid per sheet
const R_RES  = 80      // Riemann sphere lat/lon resolution
const TWO_PI = Math.PI * 2
const MAX_H  = 4.0     // clamp |f(z)| to this height

// ── Complex arithmetic helpers ─────────────────────────────────────────────
// All ops take/return { re, im }

const C = {
  add:  (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub:  (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul:  (a, b) => ({ re: a.re*b.re - a.im*b.im, im: a.re*b.im + a.im*b.re }),
  div:  (a, b) => {
    const d = b.re*b.re + b.im*b.im + 1e-30
    return { re: (a.re*b.re + a.im*b.im) / d, im: (a.im*b.re - a.re*b.im) / d }
  },
  abs:  a => Math.sqrt(a.re*a.re + a.im*a.im),
  arg:  a => Math.atan2(a.im, a.re),
  exp:  a => {
    const e = Math.exp(a.re)
    return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) }
  },
  log:  a => ({ re: 0.5 * Math.log(a.re*a.re + a.im*a.im + 1e-30), im: Math.atan2(a.im, a.re) }),
  pow:  (a, n) => {   // z^n for real n
    const r = Math.pow(C.abs(a) + 1e-30, n)
    const t = C.arg(a) * n
    return { re: r * Math.cos(t), im: r * Math.sin(t) }
  },
  sin:  a => ({
    re:  Math.sin(a.re) * Math.cosh(a.im),
    im:  Math.cos(a.re) * Math.sinh(a.im),
  }),
  cos:  a => ({
    re:  Math.cos(a.re) * Math.cosh(a.im),
    im: -Math.sin(a.re) * Math.sinh(a.im),
  }),
  conj: a => ({ re: a.re, im: -a.im }),
  from: (re, im = 0) => ({ re, im }),
}

// Gamma function approximation (Lanczos, 7 terms)
function cgamma(z) {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851,  -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z.re < 0.5) {
    // Γ(z) = π / (sin(πz) · Γ(1-z))
    const piz   = C.mul(C.from(Math.PI), z)
    const sinPZ = C.sin(piz)
    const oneMinZ = C.sub(C.from(1), z)
    return C.div(C.from(Math.PI), C.mul(sinPZ, cgamma(oneMinZ)))
  }
  const zm1 = C.sub(z, C.from(1))
  let   x   = C.from(c[0])
  for (let i = 1; i < g + 2; i++) {
    x = C.add(x, C.div(C.from(c[i]), C.add(zm1, C.from(i))))
  }
  const t = C.add(zm1, C.from(g + 0.5))
  const sq = C.mul(C.from(Math.sqrt(TWO_PI)), x)
  return C.mul(sq, C.mul(C.pow(t, zm1.re + 0.5), C.exp(C.mul(C.from(-1), t))))
}

// ── Function registry ──────────────────────────────────────────────────────

const FUNCTIONS = [
  {
    id: 'z2', name: 'z²', domain: 2.5,
    f: z => C.mul(z, z),
    note: 'Two sheets meeting at the origin. Argument doubles around 0.',
  },
  {
    id: 'recip', name: '1/z', domain: 2.5,
    f: z => C.div(C.from(1), z),
    note: 'Simple pole at z=0. Möbius inversion maps 0↔∞.',
  },
  {
    id: 'sin', name: 'sin(z)', domain: Math.PI * 1.8,
    f: z => C.sin(z),
    note: 'Entire function — no poles. Zeros at nπ.',
  },
  {
    id: 'exp', name: 'eˢ', domain: 3.0,
    f: z => C.exp(z),
    note: 'Essential singularity at ∞. Periodic with period 2πi.',
  },
  {
    id: 'gamma', name: 'Γ(z)', domain: 4.5,
    f: z => cgamma(z),
    note: 'Poles at 0, −1, −2, … . Generalises the factorial.',
  },
  {
    id: 'tan', name: 'tan(z)', domain: Math.PI * 1.5,
    f: z => C.div(C.sin(z), C.cos(z)),
    note: 'Simple poles at π/2 + nπ. Zeros at nπ.',
  },
  {
    id: 'zeta_approx', name: 'ζ(z) approx', domain: 5.0,
    f: z => {
      // Euler–Maclaurin partial sum, 40 terms — approximate, Re(z) > 1 region
      let s = C.from(0)
      for (let n = 1; n <= 40; n++) s = C.add(s, C.pow(C.from(n), -z.re - z.im * 0))
      // Treat as real-axis approximation; full analytic continuation not computed
      const val = C.pow(C.from(1), { re: -z.re, im: -z.im })
      let s2 = C.from(0)
      for (let n = 1; n <= 40; n++) {
        const nz = { re: z.re * Math.log(n), im: z.im * Math.log(n) }
        s2 = C.add(s2, C.div(C.from(1), C.exp(nz)))
      }
      return s2
    },
    note: 'Partial sum approximation. Non-trivial zeros at Re(z)=½ (Riemann hypothesis).',
  },
]

// ── Presets ────────────────────────────────────────────────────────────────

const PRESETS = {
  '1/z  (simple pole)': { exhibit: 'landscape', functionId: 'recip' },
  'z²  (sheets)':       { exhibit: 'landscape', functionId: 'z2' },
  'sin(z)':             { exhibit: 'landscape', functionId: 'sin' },
  'Γ(z)  gamma':        { exhibit: 'landscape', functionId: 'gamma' },
  'Riemann ζ approx':   { exhibit: 'landscape', functionId: 'zeta_approx' },
}

// ── Sheet definitions (multi-valued) ──────────────────────────────────────

const SHEETS = [
  {
    id: 'sqrt', name: '√z  (2 sheets)', sheets: 2,
    f: (r, theta, sheet) => {
      const mag = Math.pow(r, 0.5)
      const arg = (theta + TWO_PI * sheet) / 2
      return { re: mag * Math.cos(arg), im: mag * Math.sin(arg) }
    },
    note: 'Two-sheeted cover of C, branch point at 0. Sheets join along the branch cut.',
  },
  {
    id: 'cbrt', name: '∛z  (3 sheets)', sheets: 3,
    f: (r, theta, sheet) => {
      const mag = Math.pow(r, 1/3)
      const arg = (theta + TWO_PI * sheet) / 3
      return { re: mag * Math.cos(arg), im: mag * Math.sin(arg) }
    },
    note: 'Three-sheeted cover. Three values of z^(1/3) for each z ≠ 0.',
  },
  {
    id: 'log', name: 'log z  (helix)', sheets: 4,
    f: (r, theta, sheet) => ({
      re: Math.log(r + 1e-10),
      im: theta + TWO_PI * sheet,
    }),
    note: 'Infinitely-sheeted Riemann surface. Each sheet is a copy of ℂ shifted by 2πi.',
  },
]

// ── Helper: arg → hue color (phase wheel) ────────────────────────────────

function argToColor(arg, mag, out) {
  // Standard domain-coloring: hue = argument, lightness modulated by |f|
  const hue  = ((arg / TWO_PI) + 1) % 1
  const mag01 = 1 - 1 / (1 + mag * 0.6)   // 0..1, saturates
  out.setHSL(hue, 0.85, 0.25 + mag01 * 0.45)
}

// ── ComplexMode ────────────────────────────────────────────────────────────

export class ComplexMode {
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer
    this._time    = 0
    this._tmpC    = new THREE.Color()

    this.params = {
      exhibit:    'landscape',
      functionId: 'recip',
      sheetId:    'sqrt',
      domain:     2.5,
      mobiusSpeed: 0.25,
    }

    this._lGroups  = {}   // landscape meshes keyed by functionId
    this._shGroups = {}   // sheet meshes keyed by sheetId
    this._rGroup   = null // Riemann sphere group

    this._configureCamera()
    this._buildLights()
    this._buildAllLandscapes()
    this._buildAllSheets()
    this._buildRiemann()
    this._buildPane()
    this._setExhibit('landscape')
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  _configureCamera() {
    if (!this.renderer) return
    const ctrl = this.renderer.controls
    this._saved = {
      position:     this.renderer.camera.position.clone(),
      target:       ctrl.target.clone(),
      autoRotate:   ctrl.autoRotate,
      autoRotateSpeed: ctrl.autoRotateSpeed,
      enableRotate: ctrl.enableRotate,
      enablePan:    ctrl.enablePan,
      enableZoom:   ctrl.enableZoom,
      parallax:     this.renderer.parallaxEnabled,
    }
    this.renderer.camera.position.set(0, 5.5, 9.0)
    ctrl.target.set(0, 0.5, 0)
    ctrl.enableRotate    = true
    ctrl.enablePan       = false
    ctrl.enableZoom      = true
    ctrl.autoRotate      = true
    ctrl.autoRotateSpeed = 0.3
    this.renderer.parallaxEnabled = false
    ctrl.update()
  }

  _buildLights() {
    const amb  = new THREE.AmbientLight(0xffffff, 0.25)
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.80)
    const dir2 = new THREE.DirectionalLight(0x36a9ff, 0.35)
    dir1.position.set(3, 8, 4)
    dir2.position.set(-5, -2, -3)
    this._lightGroup = new THREE.Group()
    this._lightGroup.add(amb, dir1, dir2)
    this.scene.add(this._lightGroup)
  }

  // ── Landscape builder ─────────────────────────────────────────────────────

  _buildLandscape(fnDef) {
    const N   = L_RES
    const SV  = (N + 1) * (N + 1)
    const pos = new Float32Array(SV * 3)
    const col = new Float32Array(SV * 3)
    const idx = []

    const D = fnDef.domain
    const tmp = this._tmpC

    for (let i = 0; i <= N; i++) {
      const re = (i / N) * 2 * D - D
      for (let j = 0; j <= N; j++) {
        const im = (j / N) * 2 * D - D
        const vi = i * (N + 1) + j
        const w  = fnDef.f({ re, im })
        const h  = Math.min(MAX_H, C.abs(w))
        const a  = C.arg(w)

        pos[vi*3+0] = re
        pos[vi*3+1] = h
        pos[vi*3+2] = im

        argToColor(a, h, tmp)
        col[vi*3+0] = tmp.r
        col[vi*3+1] = tmp.g
        col[vi*3+2] = tmp.b
      }
    }

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const a = i*(N+1)+j, b = i*(N+1)+j+1
        const c = (i+1)*(N+1)+j, d = (i+1)*(N+1)+j+1
        idx.push(a,b,d, a,d,c)
      }
    }

    const geo  = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()

    return new THREE.Mesh(geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )
  }

  _buildAllLandscapes() {
    FUNCTIONS.forEach(fn => {
      const mesh  = this._buildLandscape(fn)
      const group = new THREE.Group()
      group.add(mesh)
      group.visible = false
      this.scene.add(group)
      this._lGroups[fn.id] = { group, mesh, geo: mesh.geometry }
    })
  }

  // ── Riemann sphere ────────────────────────────────────────────────────────
  // Sphere colored by stereographic projection arg: each point on the sphere
  // maps to a complex number z via projection, colored by arg(z).

  _buildRiemann() {
    const N   = R_RES
    const SV  = (N + 1) * (N + 1)
    const pos = new Float32Array(SV * 3)
    const col = new Float32Array(SV * 3)
    const idx = []
    const tmp = this._tmpC

    const R = 2.5
    for (let i = 0; i <= N; i++) {
      const phi = (i / N) * Math.PI           // 0..π  (colatitude)
      for (let j = 0; j <= N; j++) {
        const theta = (j / N) * TWO_PI        // 0..2π (longitude)
        const vi    = i * (N + 1) + j

        const x = R * Math.sin(phi) * Math.cos(theta)
        const y = R * Math.cos(phi)
        const z = R * Math.sin(phi) * Math.sin(theta)
        pos[vi*3+0] = x; pos[vi*3+1] = y; pos[vi*3+2] = z

        // Stereographic projection from north pole: z_complex = (x+iz)/(R-y)
        if (Math.abs(R - y) > 0.01) {
          const denom = R - y
          const re    = x / denom, im = z / denom
          const arg   = Math.atan2(im, re)
          const mag   = Math.sqrt(re*re + im*im)
          argToColor(arg, mag * 0.4, tmp)
        } else {
          tmp.setRGB(1, 1, 1)  // north pole = ∞
        }
        col[vi*3+0] = tmp.r; col[vi*3+1] = tmp.g; col[vi*3+2] = tmp.b
      }
    }

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const a=i*(N+1)+j, b=i*(N+1)+j+1, c=(i+1)*(N+1)+j, d=(i+1)*(N+1)+j+1
        idx.push(a,b,d, a,d,c)
      }
    }

    const geo  = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()

    const mesh = new THREE.Mesh(geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )

    this._rGeo  = geo
    this._rMesh = mesh
    this._rGroup = new THREE.Group()
    this._rGroup.add(mesh)
    this._rGroup.visible = false
    this.scene.add(this._rGroup)
  }

  // Animate Riemann sphere: rotate color pattern by applying a rotation to
  // the stereographic argument, simulating a Möbius flow on the sphere.
  _updateRiemann(dt) {
    this._rGroup.rotation.y += dt * this.params.mobiusSpeed
  }

  // ── Sheets builder ────────────────────────────────────────────────────────

  _buildSheets(shDef) {
    const group  = new THREE.Group()
    const N      = S_RES
    const D      = 2.5      // domain radius
    const tmp    = this._tmpC

    for (let sheet = 0; sheet < shDef.sheets; sheet++) {
      const SV  = (N + 1) * (N + 1)
      const pos = new Float32Array(SV * 3)
      const col = new Float32Array(SV * 3)
      const idx = []

      for (let i = 0; i <= N; i++) {
        const r = (i / N) * D + 0.02   // avoid r=0
        for (let j = 0; j <= N; j++) {
          // Theta spans full 2π per sheet — sheets are stacked vertically
          const theta = (j / N) * TWO_PI
          const vi    = i * (N + 1) + j
          const w     = shDef.f(r, theta, sheet)
          const h     = w.im * 0.8 + sheet * 0.1  // Im(w) as height, sheets offset
          const arg   = Math.atan2(w.im, w.re)

          // Lay out in polar: x = r·cos(θ), z = r·sin(θ)
          pos[vi*3+0] = r * Math.cos(theta)
          pos[vi*3+1] = Math.max(-3, Math.min(3, h))
          pos[vi*3+2] = r * Math.sin(theta)

          argToColor(arg, C.abs(w), tmp)
          col[vi*3+0] = tmp.r; col[vi*3+1] = tmp.g; col[vi*3+2] = tmp.b
        }
      }

      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const a=i*(N+1)+j, b=i*(N+1)+j+1, c=(i+1)*(N+1)+j, d=(i+1)*(N+1)+j+1
          idx.push(a,b,d, a,d,c)
        }
      }

      const geo  = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()

      const mesh = new THREE.Mesh(geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      )
      group.add(mesh)
    }

    group.visible = false
    this.scene.add(group)
    this._shGroups[shDef.id] = { group }
  }

  _buildAllSheets() {
    SHEETS.forEach(sh => this._buildSheets(sh))
  }

  // ── Exhibit switching ─────────────────────────────────────────────────────

  _setExhibit(name) {
    this.params.exhibit = name
    Object.values(this._lGroups).forEach(({ group }) => { group.visible = false })
    Object.values(this._shGroups).forEach(({ group }) => { group.visible = false })
    if (this._rGroup) this._rGroup.visible = false

    if (name === 'landscape') {
      const g = this._lGroups[this.params.functionId]
      if (g) g.group.visible = true
    } else if (name === 'riemann') {
      if (this._rGroup) this._rGroup.visible = true
    } else if (name === 'sheets') {
      const g = this._shGroups[this.params.sheetId]
      if (g) g.group.visible = true
    }
  }

  _setFunction(id) {
    this.params.functionId = id
    if (this.params.exhibit === 'landscape') {
      Object.values(this._lGroups).forEach(({ group }) => { group.visible = false })
      const g = this._lGroups[id]
      if (g) g.group.visible = true
    }
  }

  _setSheet(id) {
    this.params.sheetId = id
    if (this.params.exhibit === 'sheets') {
      Object.values(this._shGroups).forEach(({ group }) => { group.visible = false })
      const g = this._shGroups[id]
      if (g) g.group.visible = true
    }
  }

  // ── Tweakpane ─────────────────────────────────────────────────────────────

  _buildPane() {
    this.pane = new Pane({ title: 'Complex Analysis' })

    this.pane.addBinding(this.params, 'exhibit', {
      label: 'exhibit',
      options: {
        'Landscape  |f(z)|':    'landscape',
        'Riemann Sphere':        'riemann',
        'Riemann Sheets':        'sheets',
      },
    }).on('change', ({ value }) => this._setExhibit(value))

    // ── Presets folder ────────────────────────────────────────────────────────
    const presetF = this.pane.addFolder({ title: 'Presets', expanded: true })
    for (const [label, values] of Object.entries(PRESETS)) {
      presetF.addButton({ title: label }).on('click', () => {
        this.applyParams(values)
      })
    }

    // ── Landscape folder ──────────────────────────────────────────────────────
    const lF = this.pane.addFolder({ title: 'Shape', expanded: true })
    const fnOpts = {}
    FUNCTIONS.forEach(fn => { fnOpts[fn.name] = fn.id })
    lF.addBinding(this.params, 'functionId', {
      label: 'f(z)', options: fnOpts,
    }).on('change', ({ value }) => this._setFunction(value))
    addGuideNotes(lF, [
      'Height = |f(z)|.  Color = arg(f(z)).',
      'Poles spike upward.',
      'Zeros touch the floor.',
      'Color spins 360° around each pole/zero.',
    ])

    // ── Riemann folder ────────────────────────────────────────────────────────
    const rF = this.pane.addFolder({ title: 'Motion', expanded: false })
    rF.addBinding(this.params, 'mobiusSpeed', {
      label: 'rotation', min: 0, max: 1.0, step: 0.01,
    })
    addGuideNotes(rF, [
      'Every point on the sphere is a',
      'complex number via stereographic',
      'projection. North pole = ∞.',
      'Color = arg of the projected z.',
    ])

    // ── Sheets folder ─────────────────────────────────────────────────────────
    const shF = this.pane.addFolder({ title: 'Camera', expanded: false })
    const shOpts = {}
    SHEETS.forEach(sh => { shOpts[sh.name] = sh.id })
    shF.addBinding(this.params, 'sheetId', {
      label: 'function', options: shOpts,
    }).on('change', ({ value }) => this._setSheet(value))
    addGuideNotes(shF, [
      'Each sheet is one branch of the',
      'multi-valued function.',
      'Sheets join at branch cuts.',
      'Color = arg on that sheet.',
    ])

    animatePanel(this.pane)
  }

  liveEquation() {
    const fn = FUNCTIONS.find(f => f.id === this.params.functionId)
    const sh = SHEETS.find(s => s.id === this.params.sheetId)
    if (this.params.exhibit === 'riemann') {
      return `$$\\pi:S^2\\setminus\\{N\\}\\to\\mathbb{C},\\quad \\text{stereographic projection},\\quad \\omega=${this.params.mobiusSpeed.toFixed(2)}$$`
    }
    if (this.params.exhibit === 'sheets') {
      return `$$w = \\text{${sh?.name ?? this.params.sheetId}},\\quad \\text{multi-valued branches over }\\mathbb{C}$$`
    }
    return [
      `$$f(z)=\\text{${fn?.name ?? this.params.functionId}}$$`,
      `$$\\text{height}=|f(z)|,\\quad \\text{color}=\\arg(f(z))$$`,
    ].join('\n')
  }

  tooltips() {
    return {
      exhibit: 'Choose landscape, Riemann sphere, or branch sheet view.',
      f: 'Complex function used for the landscape.',
      rotation: 'Rotation speed for the Riemann sphere.',
      function: 'Multi-valued function whose branches form the sheets.',
      presets: 'Load common complex functions and singularity examples.',
    }
  }

  applyParams(params = {}) {
    Object.assign(this.params, params)
    this._setExhibit(this.params.exhibit)
    if (params.functionId) this._setFunction(params.functionId)
    if (params.sheetId) this._setSheet(params.sheetId)
    this.pane?.refresh()
    return true
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    this._time += dt
    if (this.params.exhibit === 'riemann') {
      this._updateRiemann(dt)
    }
  }

  setAudio(audio) { this._audio = audio }

  onResize() {}

  aiContext() {
    const fn = FUNCTIONS.find(f => f.id === this.params.functionId)
    const sh = SHEETS.find(s => s.id === this.params.sheetId)
    return {
      mode:    'complex',
      exhibit: this.params.exhibit,
      function: fn?.name ?? '',
      sheet:   sh?.name ?? '',
      note:    this.params.exhibit === 'landscape' ? fn?.note :
               this.params.exhibit === 'sheets'    ? sh?.note : '',
      params:  { ...this.params },
    }
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  dispose() {
    if (this.renderer && this._saved) {
      const ctrl = this.renderer.controls
      this.renderer.camera.position.copy(this._saved.position)
      ctrl.target.copy(this._saved.target)
      ctrl.autoRotate      = this._saved.autoRotate
      ctrl.autoRotateSpeed = this._saved.autoRotateSpeed
      ctrl.enableRotate    = this._saved.enableRotate
      ctrl.enablePan       = this._saved.enablePan
      ctrl.enableZoom      = this._saved.enableZoom
      this.renderer.parallaxEnabled = this._saved.parallax
      ctrl.update()
    }
    Object.values(this._lGroups).forEach(({ geo }) => geo?.dispose())
    Object.values(this._shGroups).forEach(({ group }) => {
      group.children.forEach(m => m.geometry?.dispose())
    })
    this._rGeo?.dispose()
    this.pane?.dispose()
  }
}
