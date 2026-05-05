/**
 * knots.js — Mathematical Knot Visualizer
 *
 * Renders space curves as smooth tubes using a parallel transport frame
 * (avoids the spinning artifacts of Frenet-Serret near inflection points).
 *
 * Exhibits:
 *   Torus Knots T(p,q)  — integer p, q sliders change the winding counts
 *   Figure-Eight (4₁)   — canonical non-torus knot
 *   Borromean Rings      — three pairwise-unlinked but collectively linked circles
 *
 * Color modes: curvature κ, torsion τ, arc length (rainbow), solid teal
 *
 * Distortion: writhe — sinusoidal normal perturbation that adds wobble
 */

import * as THREE from 'three'
import { Pane }   from 'tweakpane'
import { animatePanel, addGuideNotes } from '../core/ui.js'

// ── Curve resolution ───────────────────────────────────────────────────────
const N_CURVE = 600   // sample points per curve
const N_SEG   = 18    // tube cross-section sides
const TWO_PI  = Math.PI * 2

// ── Palette ────────────────────────────────────────────────────────────────
const C_BLUE   = new THREE.Color(0x36a9ff)
const C_CYAN   = new THREE.Color(0x00ccff)
const C_CREAM  = new THREE.Color(0xf5f4eb)
const C_YELLOW = new THREE.Color(0xe8c547)
const C_TEAL   = new THREE.Color(0x28f0d2)

const RING_COLORS = [
  new THREE.Color(0x36a9ff),  // blue
  new THREE.Color(0x00ccff),  // cyan
  new THREE.Color(0xe8c547),  // yellow
]

// ── Helpers ────────────────────────────────────────────────────────────────

function lerp3(a, b, t, out) {
  out.r = a.r + (b.r - a.r) * t
  out.g = a.g + (b.g - a.g) * t
  out.b = a.b + (b.b - a.b) * t
}

function kappaToColor(k, kmax, out) {
  const t = 0.5 + 0.5 * Math.tanh(k / (kmax * 0.3 + 1e-9))
  if (t < 0.5) lerp3(C_BLUE,  C_CREAM,  t * 2,        out)
  else         lerp3(C_CREAM, C_YELLOW, (t - 0.5) * 2, out)
}

function gcdInt(a, b) {
  a = Math.abs(Math.round(a))
  b = Math.abs(Math.round(b))
  while (b !== 0) {
    const t = b
    b = a % b
    a = t
  }
  return Math.max(1, a)
}

// ── Curve library ──────────────────────────────────────────────────────────

/** Torus knot T(p,q): winds p times around z, q times around meridian */
function torusKnot(t, p, q) {
  const R = 1.8, r = 0.8
  return {
    x: (R + r * Math.cos(q * t)) * Math.cos(p * t),
    y: (R + r * Math.cos(q * t)) * Math.sin(p * t),
    z:  r * Math.sin(q * t),
  }
}

/** One component of T(p,q) when gcd(p,q)>1 creates a torus link. */
function torusLinkComponent(t, p, q, component, componentCount) {
  const R = 1.8, r = 0.8
  const p0 = p / componentCount
  const q0 = q / componentCount
  const phase = (component / componentCount) * TWO_PI
  const meridian = q0 * t + phase
  return {
    x: (R + r * Math.cos(meridian)) * Math.cos(p0 * t),
    y: (R + r * Math.cos(meridian)) * Math.sin(p0 * t),
    z:  r * Math.sin(meridian),
  }
}

/** Figure-eight knot (4₁) — non-torus knot with 4 crossings */
function figureEight(t) {
  return {
    x: (2 + Math.cos(2 * t)) * Math.cos(3 * t),
    y: (2 + Math.cos(2 * t)) * Math.sin(3 * t),
    z: Math.sin(4 * t),
  }
}

// ── Knot registry ──────────────────────────────────────────────────────────

const KNOTS = [
  {
    id: 'trefoil', name: 'Trefoil  T(2,3)', family: 'torus',
    p: 2, q: 3,
    curve: t => torusKnot(t, 2, 3),
    note: 'Simplest non-trivial knot. Three-fold symmetry, 3 crossings.',
  },
  {
    id: 'cinquefoil', name: 'Cinquefoil  T(2,5)', family: 'torus',
    p: 2, q: 5,
    curve: t => torusKnot(t, 2, 5),
    note: 'Five-petal torus knot. 5 crossings, chiral.',
  },
  {
    id: 't35', name: 'T(3,5)', family: 'torus',
    p: 3, q: 5,
    curve: t => torusKnot(t, 3, 5),
    note: '10 crossings. Wraps 3 times longitudinally, 5 times meridionally.',
  },
  {
    id: 't27', name: 'T(2,7)', family: 'torus',
    p: 2, q: 7,
    curve: t => torusKnot(t, 2, 7),
    note: '7-crossing torus knot. Elongated twist form.',
  },
  {
    id: 'figure8', name: 'Figure-Eight  (4₁)', family: 'other',
    curve: t => figureEight(t),
    note: 'Only amphichiral prime knot with ≤ 7 crossings. Equal to its mirror image.',
  },
  {
    id: 'custom', name: 'Custom T(p,q)', family: 'torus',
    p: 3, q: 5,
    curve: (t, p, q) => torusKnot(t, p, q),
    note: 'Use p and q sliders to explore the torus knot family.',
  },
]

// ── Parallel transport frame builder ──────────────────────────────────────
// More stable than Frenet-Serret near inflection points.

function buildFrames(pts) {
  const N  = pts.length
  const Ts = new Array(N)   // tangents
  const Ns = new Array(N)   // normals
  const Bs = new Array(N)   // binormals

  // Central-difference tangents (forward diff at endpoints)
  for (let i = 0; i < N; i++) {
    const prev = pts[(i - 1 + N) % N]
    const next = pts[(i + 1) % N]
    Ts[i] = new THREE.Vector3().subVectors(next, prev).normalize()
  }

  // Initial normal: find a vector not nearly parallel to T[0]
  const t0 = Ts[0]
  let n0 = new THREE.Vector3(0, 1, 0)
  if (Math.abs(t0.dot(n0)) > 0.9) n0 = new THREE.Vector3(1, 0, 0)
  n0.sub(t0.clone().multiplyScalar(t0.dot(n0))).normalize()
  Ns[0] = n0
  Bs[0] = new THREE.Vector3().crossVectors(t0, n0).normalize()

  // Propagate frame using parallel transport
  for (let i = 1; i < N; i++) {
    const ti = Ts[i]
    // Project previous normal onto plane perpendicular to current tangent
    const d  = Ns[i - 1].dot(ti)
    const ni = new THREE.Vector3()
      .copy(Ns[i - 1])
      .sub(ti.clone().multiplyScalar(d))
      .normalize()
    Ns[i] = ni
    Bs[i] = new THREE.Vector3().crossVectors(ti, ni).normalize()
  }

  // Twist correction: distribute closing angle evenly so tube seam is invisible
  const dotClose  = Ns[N - 1].dot(Ns[0])
  const crossClose = new THREE.Vector3().crossVectors(Ns[N - 1], Ns[0])
  const signClose  = crossClose.dot(Ts[N - 1]) > 0 ? 1 : -1
  const closingAng = signClose * Math.acos(Math.max(-1, Math.min(1, dotClose)))

  for (let i = 0; i < N; i++) {
    const correction = -closingAng * (i / N)
    const cos = Math.cos(correction), sin = Math.sin(correction)
    const ti = Ts[i], ni = Ns[i], bi = Bs[i]
    Ns[i] = new THREE.Vector3(
      ni.x * cos + bi.x * sin,
      ni.y * cos + bi.y * sin,
      ni.z * cos + bi.z * sin,
    ).normalize()
    Bs[i] = new THREE.Vector3().crossVectors(ti, Ns[i]).normalize()
  }

  return { Ts, Ns, Bs }
}

// ── Tube geometry builder ──────────────────────────────────────────────────

function buildTubeGeometry(pts, frames, tubeR, colorFn) {
  const N   = pts.length
  const nv  = N * N_SEG
  const pos = new Float32Array(nv * 3)
  const col = new Float32Array(nv * 3)
  const nrm = new Float32Array(nv * 3)
  const idx = []
  const tmp = new THREE.Color()

  for (let i = 0; i < N; i++) {
    const p  = pts[i]
    const ni = frames.Ns[i]
    const bi = frames.Bs[i]

    for (let s = 0; s < N_SEG; s++) {
      const angle = (s / N_SEG) * TWO_PI
      const cos   = Math.cos(angle), sin = Math.sin(angle)
      const nx    = cos * ni.x + sin * bi.x
      const ny    = cos * ni.y + sin * bi.y
      const nz    = cos * ni.z + sin * bi.z
      const vi    = i * N_SEG + s

      pos[vi * 3 + 0] = p.x + nx * tubeR
      pos[vi * 3 + 1] = p.y + ny * tubeR
      pos[vi * 3 + 2] = p.z + nz * tubeR

      nrm[vi * 3 + 0] = nx
      nrm[vi * 3 + 1] = ny
      nrm[vi * 3 + 2] = nz

      colorFn(i, tmp)
      col[vi * 3 + 0] = tmp.r
      col[vi * 3 + 1] = tmp.g
      col[vi * 3 + 2] = tmp.b
    }

    // Triangle strip connecting ring i to ring (i+1)%N
    const ni2 = (i + 1) % N
    for (let s = 0; s < N_SEG; s++) {
      const s2 = (s + 1) % N_SEG
      const a  = i   * N_SEG + s
      const b  = i   * N_SEG + s2
      const c  = ni2 * N_SEG + s
      const d  = ni2 * N_SEG + s2
      idx.push(a, b, d,  a, d, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3))
  geo.setIndex(idx)
  return geo
}

// ── KnotsMode ──────────────────────────────────────────────────────────────

export class KnotsMode {
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer
    this._time    = 0
    this._tmpC    = new THREE.Color()

    this.params = {
      exhibit:   'custom',
      p:         3,
      q:         5,
      tubeR:     0.12,
      colorMode: 'arc_length',  // 'arc_length' | 'curvature' | 'solid'
      writhe:    0.0,
      autoRotate: true,
    }

    this._meshes = {}     // id → { geos, mesh }
    this._borromean = []  // array of { geo, mesh } for the 3 rings

    this._configureCamera()
    this._buildLights()
    this._buildAllKnots()
    this._buildBorromean()
    this._buildPane()
    this._setExhibit('custom')
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
    this.renderer.camera.position.set(0, 1.5, 10)
    ctrl.target.set(0, 0, 0)
    ctrl.enableRotate    = true
    ctrl.enablePan       = false
    ctrl.enableZoom      = true
    ctrl.autoRotate      = true
    ctrl.autoRotateSpeed = 0.6
    this.renderer.parallaxEnabled = false
    ctrl.update()
  }

  _buildLights() {
    const amb  = new THREE.AmbientLight(0xffffff, 0.30)
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.95)
    const dir2 = new THREE.DirectionalLight(0x7ec8ff, 0.45)
    const dir3 = new THREE.DirectionalLight(0xe8c547, 0.25)
    dir1.position.set(5, 7, 4)
    dir2.position.set(-4, -2, -3)
    dir3.position.set(0, -5, 3)
    this._lightGroup = new THREE.Group()
    this._lightGroup.add(amb, dir1, dir2, dir3)
    this.scene.add(this._lightGroup)
  }

  // ── Build a single knot tube ──────────────────────────────────────────────

  _sampleCurve(fn, p, q) {
    const pts = []
    for (let i = 0; i < N_CURVE; i++) {
      const t   = (i / N_CURVE) * TWO_PI
      const raw = fn(t, p, q)
      pts.push(new THREE.Vector3(raw.x, raw.y, raw.z))
    }
    return pts
  }

  _sampleTorusLinkComponent(p, q, component, componentCount) {
    const pts = []
    for (let i = 0; i < N_CURVE; i++) {
      const t   = (i / N_CURVE) * TWO_PI
      const raw = torusLinkComponent(t, p, q, component, componentCount)
      pts.push(new THREE.Vector3(raw.x, raw.y, raw.z))
    }
    return pts
  }

  _computeArclengths(pts) {
    const N    = pts.length
    const arcs = new Float32Array(N)
    arcs[0] = 0
    for (let i = 1; i < N; i++) {
      arcs[i] = arcs[i - 1] + pts[i].distanceTo(pts[i - 1])
    }
    return arcs
  }

  _computeCurvature(pts) {
    const N   = pts.length
    const kap = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const prev = pts[(i - 1 + N) % N]
      const next = pts[(i + 1) % N]
      const d1   = new THREE.Vector3().subVectors(pts[i], prev)
      const d2   = new THREE.Vector3().subVectors(next, pts[i])
      const len  = (d1.length() + d2.length()) * 0.5 + 1e-9
      kap[i] = d1.normalize().sub(d2.normalize()).length() / len
    }
    return kap
  }

  _buildTubeFromPoints(pts, colorOffset = 0) {
    // Apply writhe perturbation (sinusoidal normal displacement)
    const frames0 = buildFrames(pts)
    if (Math.abs(this.params.writhe) > 0.001) {
      const W = 5   // wraps of the sinusoidal wobble
      pts.forEach((p0, i) => {
        const offset = Math.sin(W * TWO_PI * i / N_CURVE) * this.params.writhe
        p0.addScaledVector(frames0.Ns[i], offset)
      })
    }

    const frames = buildFrames(pts)
    const arcs   = this._computeArclengths(pts)
    const kap    = this._computeCurvature(pts)
    const totalArc = arcs[N_CURVE - 1] + 1e-9
    let kapMax = 1e-9
    for (let i = 0; i < N_CURVE; i++) if (kap[i] > kapMax) kapMax = kap[i]

    const colorMode = this.params.colorMode
    const tmp = this._tmpC

    const colorFn = (i, out) => {
      if (colorMode === 'arc_length') {
        out.setHSL((colorOffset + arcs[i] / totalArc) % 1, 0.80, 0.60)
      } else if (colorMode === 'curvature') {
        kappaToColor(kap[i], kapMax, out)
      } else {
        out.copy(RING_COLORS[Math.round(colorOffset * RING_COLORS.length) % RING_COLORS.length] ?? C_TEAL)
      }
    }

    const geo  = buildTubeGeometry(pts, frames, this.params.tubeR, colorFn)
    const mesh = new THREE.Mesh(geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide }),
    )
    return { geo, mesh }
  }

  _buildKnotMesh(knotId, p, q) {
    const knot = KNOTS.find(k => k.id === knotId) ?? KNOTS[0]
    const linkCount = knot.family === 'torus' ? gcdInt(p, q) : 1

    if (linkCount > 1) {
      const group = new THREE.Group()
      const geos = []
      for (let c = 0; c < linkCount; c++) {
        const pts = this._sampleTorusLinkComponent(p, q, c, linkCount)
        const built = this._buildTubeFromPoints(pts, c / linkCount)
        group.add(built.mesh)
        geos.push(built.geo)
      }
      return { geos, mesh: group, linkCount }
    }

    const pts = knot.family === 'torus'
      ? this._sampleCurve(torusKnot, p, q)
      : this._sampleCurve(knot.curve, p, q)
    const built = this._buildTubeFromPoints(pts)
    return { geos: [built.geo], mesh: built.mesh, linkCount: 1 }
  }

  _buildAllKnots() {
    const { p, q } = this.params
    KNOTS.forEach(knot => {
      const kp = knot.id === 'custom' ? p : knot.p ?? p
      const kq = knot.id === 'custom' ? q : knot.q ?? q
      const built = this._buildKnotMesh(knot.id, kp, kq)
      this._meshes[knot.id] = built
      built.mesh.visible = false
      this.scene.add(built.mesh)
    })
  }

  _buildBorromean() {
    // Three circles in perpendicular planes, interlaced so none links pairwise
    // but all three are linked collectively.
    const R  = 2.2
    const configs = [
      { axis: 'z', offset: new THREE.Vector3(0, 0, 0),   color: RING_COLORS[0] },
      { axis: 'x', offset: new THREE.Vector3(R * 0.5, 0, 0), color: RING_COLORS[1] },
      { axis: 'y', offset: new THREE.Vector3(0, R * 0.5, 0), color: RING_COLORS[2] },
    ]

    this._borromean = []
    configs.forEach(({ axis, offset, color }) => {
      const pts = []
      for (let i = 0; i < N_CURVE; i++) {
        const t  = (i / N_CURVE) * TWO_PI
        const cos = Math.cos(t) * R, sin = Math.sin(t) * R
        let x = 0, y = 0, z = 0
        if (axis === 'z') { x = cos; y = sin; z = 0 }
        if (axis === 'x') { x = 0;   y = cos; z = sin }
        if (axis === 'y') { x = cos; y = 0;   z = sin }
        pts.push(new THREE.Vector3(x + offset.x, y + offset.y, z + offset.z))
      }

      const frames  = buildFrames(pts)
      const colorFn = (_i, out) => out.copy(color)
      const geo  = buildTubeGeometry(pts, frames, this.params.tubeR * 1.2, colorFn)
      const mesh = new THREE.Mesh(geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide }),
      )
      mesh.visible = false
      this.scene.add(mesh)
      this._borromean.push({ geo, mesh })
    })
  }

  // ── Rebuild active T(p,q) when sliders change ─────────────────────────────

  _isTorusExhibit(id = this.params.exhibit) {
    const knot = KNOTS.find(k => k.id === id)
    return knot?.family === 'torus'
  }

  _rebuildActiveTorus() {
    if (!this._isTorusExhibit()) return
    const id = this.params.exhibit
    const old = this._meshes[id]
    this._disposeBuilt(old)
    const built = this._buildKnotMesh(id, this.params.p, this.params.q)
    this._meshes[id] = built
    built.mesh.visible = true
    this.scene.add(built.mesh)
  }

  // ── Exhibit switching ─────────────────────────────────────────────────────

  _setExhibit(id) {
    this.params.exhibit = id
    const knot = KNOTS.find(k => k.id === id)

    if (knot?.family === 'torus' && id !== 'custom') {
      this.params.p = knot.p
      this.params.q = knot.q
      this.pane?.refresh()
      this._rebuildActiveTorus()
    }

    // Hide all
    Object.values(this._meshes).forEach(m => { m.mesh.visible = false })
    this._borromean.forEach(b => { b.mesh.visible = false })

    if (id === 'borromean') {
      this._borromean.forEach(b => { b.mesh.visible = true })
    } else {
      const m = this._meshes[id]
      if (m) m.mesh.visible = true
    }
  }

  // ── Tweakpane ─────────────────────────────────────────────────────────────

  _buildPane() {
    this.pane = new Pane({ title: 'Knots' })

    const exhibitOpts = {}
    KNOTS.forEach(k => { exhibitOpts[k.name] = k.id })
    exhibitOpts['Borromean Rings'] = 'borromean'

    this.pane.addBinding(this.params, 'exhibit', {
      label: 'knot', options: exhibitOpts,
    }).on('change', ({ value }) => this._setExhibit(value))

    // T(p,q) controls — torus presets seed these values, then sliders reshape.
    const pqF = this.pane.addFolder({ title: 'Torus T(p,q)', expanded: true })
    pqF.addBinding(this.params, 'p', {
      label: 'p', min: 2, max: 9, step: 1,
    }).on('change', () => this._rebuildActiveTorus())
    pqF.addBinding(this.params, 'q', {
      label: 'q', min: 3, max: 11, step: 1,
    }).on('change', () => this._rebuildActiveTorus())
    addGuideNotes(pqF, [
      'Torus presets load starting p,q.',
      'Drag p or q to reshape that preset.',
      'p and q are winding counts.',
      'Shared factors split into links.',
    ])

    const styleF = this.pane.addFolder({ title: 'Style', expanded: true })
    styleF.addBinding(this.params, 'tubeR', {
      label: 'tube radius', min: 0.04, max: 0.35, step: 0.005,
    }).on('change', () => this._rebuildAll())
    styleF.addBinding(this.params, 'colorMode', {
      label: 'color',
      options: { 'Arc length': 'arc_length', 'Curvature κ': 'curvature', 'Solid': 'solid' },
    }).on('change', () => this._rebuildAll())
    styleF.addBinding(this.params, 'writhe', {
      label: 'writhe', min: 0, max: 0.5, step: 0.01,
    }).on('change', () => this._rebuildAll())

    animatePanel(this.pane)
  }

  _rebuildAll() {
    // Rebuild whichever knot is currently visible
    const id = this.params.exhibit
    if (id === 'borromean') {
      this._borromean.forEach(b => { b.geo.dispose(); this.scene.remove(b.mesh) })
      this._borromean = []
      this._buildBorromean()
      this._borromean.forEach(b => { b.mesh.visible = true })
    } else {
      const old = this._meshes[id]
      this._disposeBuilt(old)
      const knot = KNOTS.find(k => k.id === id)
      const [kp, kq] = knot?.family === 'torus'
        ? [this.params.p, this.params.q]
        : [knot?.p ?? 0, knot?.q ?? 0]
      const built = this._buildKnotMesh(id, kp, kq)
      this._meshes[id] = built
      built.mesh.visible = true
      this.scene.add(built.mesh)
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    this._time += dt
  }

  setAudio(audio) { this._audio = audio }

  onResize() {}

  _disposeBuilt(built) {
    if (!built) return
    built.geos?.forEach(geo => geo.dispose())
    if (built.geo) built.geo.dispose()
    this.scene.remove(built.mesh)
  }

  aiContext() {
    const knot = KNOTS.find(k => k.id === this.params.exhibit)
    return {
      mode:    'knots',
      exhibit: knot?.name ?? this.params.exhibit,
      params:  { ...this.params },
      note:    knot?.note ?? '',
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
    Object.values(this._meshes).forEach(built => {
      built.geos?.forEach(geo => geo.dispose())
      if (built.geo) built.geo.dispose()
    })
    this._borromean.forEach(({ geo }) => geo.dispose())
    this.pane?.dispose()
  }
}
