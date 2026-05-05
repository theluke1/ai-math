/**
 * surfaces.js — Mathematical Surfaces Gallery
 *
 * A data-driven registry of exotic 3D surfaces with live distortion.
 * Three rendering modes:
 *   UV Mesh    — parametric surfaces sampled on a (S+1)×(S+1) grid
 *   Hopf       — carried from topology.js, special line-segment render
 *   Morse      — carried from topology.js, level-set sweep on torus
 *
 * Distortion sliders (CPU, applied every frame on top of base positions):
 *   twist    — rotates each horizontal slice by twist * y
 *   inflate  — pushes vertices along their normals
 *   noise    — value-noise displacement along normals
 *   pinch    — scales XZ inward near the top/bottom poles
 *
 * Color modes:
 *   curvature_K — Gaussian curvature (blue=saddle, cream=flat, yellow=dome)
 *   uv          — hue from u parameter
 *   normal      — RGB from normal direction
 *   solid       — flat teal with Lambertian lighting
 */

import * as THREE from 'three'
import { Pane }   from 'tweakpane'
import { animatePanel, addGuideNotes } from '../core/ui.js'

// ── Mesh resolution ────────────────────────────────────────────────────────
const S   = 120          // UV grid: (S+1)×(S+1) vertices
const SV  = (S + 1) * (S + 1)
const TWO_PI = Math.PI * 2

// ── Hopf constants (carried from topology.js) ──────────────────────────────
const H_BANDS = 10
const H_PER   = 12
const H_N     = H_BANDS * H_PER
const H_PTS   = 80

// ── Morse constants (carried from topology.js) ─────────────────────────────
const M_R    = 1.4
const M_r    = 0.55
const M_TH   = 100
const M_PH   = 60
const M_TMAX =  M_R + M_r
const M_TS1  =  M_R - M_r
const M_TS2  = -(M_R - M_r)
const M_TMIN = -(M_R + M_r)
const LC_N   = 300
const SURFACE_TARGET_RADIUS = 2.25
const SURFACE_MIN_SCALE = 0.12
const SURFACE_MAX_SCALE = 5.0

// ── Palette ────────────────────────────────────────────────────────────────
const C_BLUE   = new THREE.Color(0x36a9ff)
const C_CYAN   = new THREE.Color(0x00ccff)
const C_CREAM  = new THREE.Color(0xf5f4eb)
const C_YELLOW = new THREE.Color(0xe8c547)
const C_TEAL   = new THREE.Color(0x28f0d2)
const C_DIM    = new THREE.Color(0x061428)

// ── Helpers ────────────────────────────────────────────────────────────────

function lerp3(a, b, t, out) {
  out.r = a.r + (b.r - a.r) * t
  out.g = a.g + (b.g - a.g) * t
  out.b = a.b + (b.b - a.b) * t
}

function kToColor(K, Kscale, out) {
  const t = 0.5 + 0.5 * Math.tanh(K / (Kscale * 0.25))
  if (t < 0.5) lerp3(C_BLUE,  C_CREAM,  t * 2,        out)
  else         lerp3(C_CREAM, C_YELLOW, (t - 0.5) * 2, out)
}

function hopfBandColor(b, out) {
  const t = b / (H_BANDS - 1)
  if (t < 0.5) lerp3(C_BLUE, C_CYAN,   t * 2,       out)
  else         lerp3(C_CYAN, C_YELLOW, (t - 0.5) * 2, out)
}

/** Simple hash-based smooth noise, returns −1..1 */
function snoise(x, y, z) {
  let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.9) * 43758.5453
  n = n - Math.floor(n)
  return n * 2 - 1
}

function fbm(x, y, z, oct = 3) {
  let v = 0, a = 0.5, f = 1
  for (let i = 0; i < oct; i++) {
    v += a * snoise(x * f, y * f, z * f)
    a *= 0.5; f *= 2.1
  }
  return v
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/** Morse torus vertex (vertically-oriented) */
function mV(theta, phi) {
  const A = M_R + M_r * Math.cos(phi)
  return new THREE.Vector3(
    M_r * Math.sin(phi),
    A   * Math.sin(theta),
    A   * Math.cos(theta),
  )
}
function mF(theta, phi) {
  return (M_R + M_r * Math.cos(phi)) * Math.cos(theta)
}

// ── Surface registry ───────────────────────────────────────────────────────
// Each entry: { id, name, family, pos(u,v,p)→{x,y,z}, K(u,v,p)→number }
// u ∈ [0,1], v ∈ [0,1]  (normalised — surface maps to its own domain)

const SURFACES = [
  // ── Torus family ──────────────────────────────────────────────────────────
  {
    id: 'ring_torus', name: 'Ring Torus', family: 'torus',
    pos(u, v, p) {
      const R = p.majorR, r = p.minorR
      const tu = u * TWO_PI, tv = v * TWO_PI
      const A  = R + r * Math.cos(tv)
      return { x: A * Math.cos(tu), y: A * Math.sin(tu), z: r * Math.sin(tv) }
    },
    K(u, v, p) {
      const R = p.majorR, r = p.minorR
      const tv = v * TWO_PI
      const A  = R + r * Math.cos(tv)
      return Math.cos(tv) / (r * A)
    },
  },
  {
    id: 'horn_torus', name: 'Horn Torus', family: 'torus',
    pos(u, v, _p) {
      const R = 1.0, r = 1.0
      const tu = u * TWO_PI, tv = v * TWO_PI
      const A  = R + r * Math.cos(tv)
      return { x: A * Math.cos(tu), y: A * Math.sin(tu), z: r * Math.sin(tv) }
    },
    K(u, v, _p) {
      const tv = v * TWO_PI
      const A  = 1.0 + Math.cos(tv)
      return Math.cos(tv) / (1.0 * A)
    },
  },
  {
    id: 'spindle_torus', name: 'Spindle Torus', family: 'torus',
    pos(u, v, _p) {
      const R = 0.6, r = 1.1
      const tu = u * TWO_PI, tv = v * TWO_PI
      const A  = R + r * Math.cos(tv)
      return { x: A * Math.cos(tu), y: A * Math.sin(tu), z: r * Math.sin(tv) }
    },
    K(u, v, _p) {
      const R = 0.6, r = 1.1, tv = v * TWO_PI
      const A  = R + r * Math.cos(tv)
      return Math.cos(tv) / (r * A)
    },
  },
  {
    id: 'ditorus', name: 'Ditorus', family: 'torus',
    pos(u, v, _p) {
      // Torus of a torus: tube itself is circular in a second revolution
      const R1 = 1.8, R2 = 0.7, r = 0.25
      const tu  = u * TWO_PI
      const tv  = v * TWO_PI * 3   // 3 wraps of the inner tube
      const A2  = R2 + r * Math.cos(tv)
      const cx  = (R1 + A2 * Math.cos(tu))
      return {
        x: cx * Math.cos(tu * 0.5),
        y: cx * Math.sin(tu * 0.5),
        z: A2 * Math.sin(tv) + r * Math.sin(tv),
      }
    },
    K(_u, _v, _p) { return 0 },
  },

  // ── Minimal surfaces ──────────────────────────────────────────────────────
  {
    id: 'catenoid', name: 'Catenoid', family: 'minimal',
    pos(u, v, _p) {
      const uc = (u - 0.5) * 4          // u ∈ [−2, 2]
      const tv = v * TWO_PI
      const ch = Math.cosh(uc)
      return { x: ch * Math.cos(tv), y: ch * Math.sin(tv), z: uc * 1.2 }
    },
    K(u, _v, _p) {
      const uc = (u - 0.5) * 4
      const ch = Math.cosh(uc)
      return -1 / (ch * ch * ch * ch)
    },
  },
  {
    id: 'helicoid', name: 'Helicoid', family: 'minimal',
    pos(u, v, _p) {
      const uc = (u - 0.5) * 4
      const tv = v * TWO_PI
      return { x: uc * Math.cos(tv), y: uc * Math.sin(tv), z: tv * 0.6 }
    },
    K(u, _v, _p) {
      const uc = (u - 0.5) * 4
      return -1 / ((1 + uc * uc) * (1 + uc * uc))
    },
  },
  {
    id: 'enneper', name: 'Enneper', family: 'minimal',
    pos(u, v, _p) {
      const ue = (u - 0.5) * 4, ve = (v - 0.5) * 4
      return {
        x: ue - ue*ue*ue/3 + ue*ve*ve,
        y: ve - ve*ve*ve/3 + ve*ue*ue,
        z: (ue*ue - ve*ve) * 0.8,
      }
    },
    K(u, v, _p) {
      const ue = (u - 0.5) * 4, ve = (v - 0.5) * 4
      const d2 = 1 + ue*ue + ve*ve
      return -16 / (d2 * d2 * d2 * d2)
    },
  },
  {
    id: 'scherk', name: "Scherk's Surface", family: 'minimal',
    pos(u, v, _p) {
      // Scherk's first surface: z = log(cos(y)/cos(x)), avoid |x|,|y| → π/2
      const xu = (u - 0.5) * Math.PI * 1.7
      const yv = (v - 0.5) * Math.PI * 1.7
      const cx = Math.cos(xu), cy = Math.cos(yv)
      const safe = Math.abs(cx) > 0.04 && Math.abs(cy) > 0.04
      const z    = safe ? Math.log(Math.abs(cy / cx)) : 0
      return { x: xu * 1.2, y: yv * 1.2, z: Math.max(-3, Math.min(3, z)) }
    },
    K(_u, _v, _p) { return 0 },
  },

  // ── Algebraic / exotic ────────────────────────────────────────────────────
  {
    id: 'sphere', name: 'Sphere', family: 'algebraic',
    pos(u, v, _p) {
      const tu = u * TWO_PI, tv = v * Math.PI
      const r  = 2.0
      return {
        x: r * Math.sin(tv) * Math.cos(tu),
        y: r * Math.sin(tv) * Math.sin(tu),
        z: r * Math.cos(tv),
      }
    },
    K(_u, _v, _p) { return 1 / (2.0 * 2.0) },
  },
  {
    id: 'roman', name: 'Roman Surface', family: 'algebraic',
    pos(u, v, _p) {
      // Steiner's Roman surface (Boy-like self-intersecting projective plane)
      const tu = u * Math.PI, tv = v * Math.PI
      const r  = 2.0
      return {
        x: r * Math.sin(2 * tu) * Math.cos(tv) * Math.cos(tv),
        y: r * Math.sin(tu)     * Math.sin(2 * tv),
        z: r * Math.cos(tu)     * Math.sin(2 * tv),
      }
    },
    K(_u, _v, _p) { return 0 },
  },
  {
    id: 'dini', name: "Dini's Surface", family: 'algebraic',
    pos(u, v, _p) {
      // Dini's surface: constant negative curvature, a pseudo-sphere wound into a helix
      const a = 1.0, b = 0.2
      const tu = u * TWO_PI * 4   // 4 turns
      const tv = Math.max(0.05, v * Math.PI * 0.95)
      return {
        x: a * Math.cos(tu) * Math.sin(tv),
        y: a * Math.sin(tu) * Math.sin(tv),
        z: a * (Math.cos(tv) + Math.log(Math.tan(tv / 2))) + b * tu,
      }
    },
    K(_u, _v, _p) { return -1 },
  },
  {
    id: 'pseudosphere', name: 'Pseudosphere', family: 'algebraic',
    pos(u, v, _p) {
      const tu = u * TWO_PI
      const tc = (v - 0.5) * 4     // t ∈ [−2, 2]
      const s  = 1 / Math.cosh(tc)
      return {
        x: s * Math.cos(tu),
        y: s * Math.sin(tu),
        z: tc - Math.tanh(tc),
      }
    },
    K(_u, v, _p) {
      const tc = (v - 0.5) * 4
      const s  = 1 / Math.cosh(tc)
      return -s * s * s * s
    },
  },
  {
    id: 'seashell', name: 'Seashell', family: 'algebraic',
    pos(u, v, _p) {
      // Logarithmic spiral shell surface
      const tu = u * TWO_PI * 2, tv = v * TWO_PI
      const k  = 0.18
      const e  = Math.exp(k * tu)
      return {
        x: e * (1 + Math.cos(tv)) * Math.cos(tu),
        y: e * (1 + Math.cos(tv)) * Math.sin(tu),
        z: e * Math.sin(tv) - 1.5 * e,
      }
    },
    K(_u, _v, _p) { return 0 },
  },
  {
    id: 'monkey_saddle', name: 'Monkey Saddle', family: 'algebraic',
    pos(u, v, _p) {
      const x = (u - 0.5) * 3, y = (v - 0.5) * 3
      return { x, y, z: (x*x*x - 3*x*y*y) * 0.25 }
    },
    K(u, v, _p) {
      const x = (u - 0.5) * 3, y = (v - 0.5) * 3
      // K = -(36(x²+y²))² / (1 + 9(x²+y²)²)²  — approximately
      const r2 = x*x + y*y
      return -36 * r2 / Math.pow(1 + 9 * r2, 2)
    },
  },
  {
    id: 'klein', name: 'Klein Bottle', family: 'algebraic',
    pos(u, v, _p) {
      // Figure-8 immersion of the Klein bottle in R³
      const tu = u * TWO_PI, tv = v * TWO_PI
      const r  = 2.0
      const x  = (r + Math.cos(tu / 2) * Math.sin(tv) - Math.sin(tu / 2) * Math.sin(2 * tv)) * Math.cos(tu)
      const y  = (r + Math.cos(tu / 2) * Math.sin(tv) - Math.sin(tu / 2) * Math.sin(2 * tv)) * Math.sin(tu)
      const z  =      Math.sin(tu / 2) * Math.sin(tv) + Math.cos(tu / 2) * Math.sin(2 * tv)
      return { x, y, z }
    },
    K(_u, _v, _p) { return 0 },
  },
  {
    id: 'knotted_torus', name: 'Knotted Torus', family: 'torus',
    pos(u, v, _p) {
      // Torus knotted around itself: T(2,3)-like wrapping
      const tu = u * TWO_PI, tv = v * TWO_PI
      const R  = 1.4, r = 0.4
      const phiK = tv * 1.5   // 3 full winds per 2 turns of u
      const cx = (R + r * Math.cos(phiK)) * Math.cos(tu)
      const cy = (R + r * Math.cos(phiK)) * Math.sin(tu)
      const cz =      r * Math.sin(phiK)
      return { x: cx, y: cy, z: cz }
    },
    K(_u, _v, _p) { return 0 },
  },
]

// ── SurfacesMode ───────────────────────────────────────────────────────────

export class SurfacesMode {
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer
    this._time    = 0
    this._hopfAngle = 0
    this._tmpC    = new THREE.Color()
    this._tmpV    = new THREE.Vector3()

    this.params = {
      exhibit:    'surface',     // 'surface' | 'hopf' | 'morse'
      surfaceId:  'ring_torus',
      colorMode:  'curvature_K', // 'curvature_K' | 'uv' | 'normal' | 'solid'
      majorR:     1.4,
      minorR:     0.55,
      // Distortions
      twist:   0.0,
      inflate: 0.0,
      noise:   0.0,
      pinch:   0.0,
      // Morse
      morseT:    M_TMIN - 0.05,
      morseAnim: true,
      // Hopf
      hopfSpeed: 0.20,
    }

    this._configureCamera()
    this._buildLights()
    this._buildMesh()
    this._buildHopf()
    this._buildMorse()
    this._buildPane()
    this._setExhibit('surface')
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  _configureCamera() {
    if (!this.renderer) return
    const ctrl = this.renderer.controls
    this._saved = {
      position:     this.renderer.camera.position.clone(),
      target:       ctrl.target.clone(),
      autoRotate:   ctrl.autoRotate,
      enableRotate: ctrl.enableRotate,
      enablePan:    ctrl.enablePan,
      enableZoom:   ctrl.enableZoom,
      parallax:     this.renderer.parallaxEnabled,
    }
    this.renderer.camera.position.set(0, 1.2, 7.0)
    ctrl.target.set(0, 0, 0)
    ctrl.enableRotate  = true
    ctrl.enablePan     = false
    ctrl.enableZoom    = true
    ctrl.autoRotate    = true
    ctrl.autoRotateSpeed = 0.4
    this.renderer.parallaxEnabled = false
    ctrl.update()
  }

  _buildLights() {
    const amb  = new THREE.AmbientLight(0xffffff, 0.35)
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.90)
    const dir2 = new THREE.DirectionalLight(0x7ec8ff, 0.40)
    const dir3 = new THREE.DirectionalLight(0xe8c547, 0.20)
    dir1.position.set(4, 6, 5)
    dir2.position.set(-4, -2, -3)
    dir3.position.set(0, -6, 2)
    this._lightGroup = new THREE.Group()
    this._lightGroup.add(amb, dir1, dir2, dir3)
    this.scene.add(this._lightGroup)
  }

  // ── UV Mesh (shared, rebuilt on surface change) ───────────────────────────

  _buildMesh() {
    const pos = new Float32Array(SV * 3)
    const col = new Float32Array(SV * 3)
    const nrm = new Float32Array(SV * 3)
    const idx = []

    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        const a = i       * (S + 1) + j
        const b = i       * (S + 1) + j + 1
        const c = (i + 1) * (S + 1) + j
        const d = (i + 1) * (S + 1) + j + 1
        idx.push(a, b, c,  b, d, c)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
    geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3))
    geo.setIndex(idx)

    this._mesh = new THREE.Mesh(geo,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      }),
    )
    this._geo  = geo
    this._pos  = pos
    this._col  = col
    this._base = new Float32Array(SV * 3)  // undistorted positions
    this._Kv   = new Float32Array(SV)      // curvature per vertex

    this._surfaceGroup = new THREE.Group()
    this._surfaceGroup.add(this._mesh)
    this.scene.add(this._surfaceGroup)

    this._rebuildSurface()
  }

  _rebuildSurface() {
    const surf = SURFACES.find(s => s.id === this.params.surfaceId) ?? SURFACES[0]
    const p    = this.params
    const base = this._base
    const Kv   = this._Kv
    let Kmax   = 1e-9

    for (let i = 0; i <= S; i++) {
      const u = i / S
      for (let j = 0; j <= S; j++) {
        const v  = j / S
        const vi = i * (S + 1) + j
        const { x, y, z } = surf.pos(u, v, p)
        base[vi * 3 + 0] = x
        base[vi * 3 + 1] = y
        base[vi * 3 + 2] = z
        const K  = surf.K(u, v, p)
        Kv[vi]   = isFinite(K) ? K : 0
        if (Math.abs(Kv[vi]) > Kmax) Kmax = Math.abs(Kv[vi])
      }
    }

    this._Kmax = Kmax
    this._applyDistortionsAndColor()
  }

  // ── Distortions ───────────────────────────────────────────────────────────

  _applyDistortionsAndColor() {
    const { twist, inflate, noise, pinch } = this.params
    const base = this._base
    const pos  = this._pos
    const col  = this._col
    const Kv   = this._Kv
    const Kmax = this._Kmax

    // First pass: copy base + apply twist + pinch
    for (let vi = 0; vi < SV; vi++) {
      let x = base[vi * 3 + 0]
      let y = base[vi * 3 + 1]
      let z = base[vi * 3 + 2]

      // Twist: rotate around Y by angle proportional to y
      if (Math.abs(twist) > 0.001) {
        const angle = twist * y
        const cx = x * Math.cos(angle) - z * Math.sin(angle)
        const cz = x * Math.sin(angle) + z * Math.cos(angle)
        x = cx; z = cz
      }

      // Pinch: compress XZ toward axis near poles (|y| high)
      if (Math.abs(pinch) > 0.001) {
        const yNorm = Math.abs(y) / 2.5
        const scale = 1 - pinch * yNorm * yNorm
        x *= scale; z *= scale
      }

      pos[vi * 3 + 0] = x
      pos[vi * 3 + 1] = y
      pos[vi * 3 + 2] = z
    }

    // Recompute normals after geometric distortions
    this._geo.attributes.position.needsUpdate = true
    this._geo.computeVertexNormals()
    const nrm = this._geo.attributes.normal.array

    // Second pass: inflate + noise (along normal)
    if (Math.abs(inflate) > 0.001 || Math.abs(noise) > 0.001) {
      for (let vi = 0; vi < SV; vi++) {
        const nx = nrm[vi * 3 + 0]
        const ny = nrm[vi * 3 + 1]
        const nz = nrm[vi * 3 + 2]
        const px = pos[vi * 3 + 0]
        const py = pos[vi * 3 + 1]
        const pz = pos[vi * 3 + 2]

        const noiseSample = Math.abs(noise) > 0.001
          ? fbm(px * 1.4, py * 1.4, pz * 1.4) * noise
          : 0

        const d = inflate + noiseSample
        pos[vi * 3 + 0] = px + nx * d
        pos[vi * 3 + 1] = py + ny * d
        pos[vi * 3 + 2] = pz + nz * d
      }
      this._geo.attributes.position.needsUpdate = true
      this._geo.computeVertexNormals()
    }

    // Color pass
    const colorMode = this.params.colorMode
    for (let i = 0; i <= S; i++) {
      const u = i / S
      for (let j = 0; j <= S; j++) {
        const v  = j / S
        const vi = i * (S + 1) + j
        let   cr = C_TEAL.r, cg = C_TEAL.g, cb = C_TEAL.b

        if (colorMode === 'curvature_K') {
          kToColor(Kv[vi], this._Kmax, this._tmpC)
          cr = this._tmpC.r; cg = this._tmpC.g; cb = this._tmpC.b

        } else if (colorMode === 'uv') {
          this._tmpC.setHSL(u, 0.75, 0.60)
          cr = this._tmpC.r; cg = this._tmpC.g; cb = this._tmpC.b

        } else if (colorMode === 'normal') {
          const nx = nrm[vi * 3 + 0]
          const ny = nrm[vi * 3 + 1]
          const nz = nrm[vi * 3 + 2]
          cr = Math.abs(nx); cg = Math.abs(ny); cb = Math.abs(nz)

        } else {
          // solid — teal, lighting handles shading
          cr = C_TEAL.r; cg = C_TEAL.g; cb = C_TEAL.b
        }

        col[vi * 3 + 0] = cr
        col[vi * 3 + 1] = cg
        col[vi * 3 + 2] = cb
      }
    }

    this._geo.attributes.color.needsUpdate = true
    this._fitSurfaceToVolume()
  }

  _fitSurfaceToVolume() {
    const pos = this._pos
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (let vi = 0; vi < SV; vi++) {
      const x = pos[vi * 3 + 0]
      const y = pos[vi * 3 + 1]
      const z = pos[vi * 3 + 2]
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue

      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      this._mesh.position.set(0, 0, 0)
      this._mesh.scale.setScalar(1)
      this._fitInfo = null
      return
    }

    const cx = (minX + maxX) * 0.5
    const cy = (minY + maxY) * 0.5
    const cz = (minZ + maxZ) * 0.5
    let radiusSq = 0

    for (let vi = 0; vi < SV; vi++) {
      const x = pos[vi * 3 + 0]
      const y = pos[vi * 3 + 1]
      const z = pos[vi * 3 + 2]
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue

      const dx = x - cx
      const dy = y - cy
      const dz = z - cz
      radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz)
    }

    const radius = Math.sqrt(radiusSq)
    const fitScale = radius > 1e-6
      ? clamp(SURFACE_TARGET_RADIUS / radius, SURFACE_MIN_SCALE, SURFACE_MAX_SCALE)
      : 1

    this._mesh.scale.setScalar(fitScale)
    this._mesh.position.set(-cx * fitScale, -cy * fitScale, -cz * fitScale)
    this._fitInfo = {
      center: [cx, cy, cz],
      radius,
      scale: fitScale,
      bounds: {
        x: [minX, maxX],
        y: [minY, maxY],
        z: [minZ, maxZ],
      },
    }
  }

  // ── Hopf Fibration (from topology.js) ────────────────────────────────────

  _buildHopf() {
    const VERTS = H_N * H_PTS * 2
    const pos   = new Float32Array(VERTS * 3)
    const col   = new Float32Array(VERTS * 3)
    const geo   = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))

    const bandC = new THREE.Color()
    for (let b = 0; b < H_BANDS; b++) {
      hopfBandColor(b, bandC)
      for (let p = 0; p < H_PER; p++) {
        const fi   = b * H_PER + p
        const base = fi * H_PTS * 2 * 3
        for (let v = 0; v < H_PTS * 2; v++) {
          col[base + v * 3 + 0] = bandC.r
          col[base + v * 3 + 1] = bandC.g
          col[base + v * 3 + 2] = bandC.b
        }
      }
    }

    this._hopfTheta = new Float32Array(H_N)
    this._hopfPhi   = new Float32Array(H_N)
    for (let b = 0; b < H_BANDS; b++) {
      const theta = Math.PI * (0.06 + 0.82 * (b + 0.5) / H_BANDS)
      for (let p = 0; p < H_PER; p++) {
        const fi = b * H_PER + p
        this._hopfTheta[fi] = theta
        this._hopfPhi[fi]   = TWO_PI * p / H_PER
      }
    }

    this._hopfPos  = pos
    this._hopfGeo  = geo
    this._hopfMesh = new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({ vertexColors: true, depthWrite: false }),
    )
    this._hopfGroup = new THREE.Group()
    this._hopfGroup.add(this._hopfMesh)
    this.scene.add(this._hopfGroup)
  }

  _updateHopf(dt) {
    this._hopfAngle += dt * this.params.hopfSpeed
    const alpha = this._hopfAngle
    const ca    = Math.cos(alpha), sa = Math.sin(alpha)
    const pos   = this._hopfPos

    for (let fi = 0; fi < H_N; fi++) {
      const theta = this._hopfTheta[fi]
      const phi   = this._hopfPhi[fi]
      const ct2   = Math.cos(theta / 2)
      const st2   = Math.sin(theta / 2)
      const base  = fi * H_PTS * 2 * 3
      let px0 = 0, py0 = 0, pz0 = 0

      for (let k = 0; k <= H_PTS; k++) {
        const t  = (k / H_PTS) * TWO_PI
        const a0 = ct2 * Math.cos(t)
        const b0 = ct2 * Math.sin(t)
        const c0 = st2 * Math.cos(t - phi)
        const d0 = st2 * Math.sin(t - phi)

        const a = a0 * ca - b0 * sa
        const b = a0 * sa + b0 * ca
        const c = c0 * ca - d0 * sa
        const d = c0 * sa + d0 * ca

        const denom = 1 - d
        const s     = denom > 0.04 ? 1 / denom : 25
        const px = a * s, py = b * s, pz = c * s

        if (k > 0) {
          const si = base + (k - 1) * 2 * 3
          pos[si+0]=px0; pos[si+1]=py0; pos[si+2]=pz0
          pos[si+3]=px;  pos[si+4]=py;  pos[si+5]=pz
        }
        px0 = px; py0 = py; pz0 = pz
      }
    }
    this._hopfGeo.attributes.position.needsUpdate = true
  }

  // ── Morse Theory (from topology.js) ──────────────────────────────────────

  _buildMorse() {
    const N = M_TH, P = M_PH
    const VERTS = (N + 1) * (P + 1)
    const mPos  = new Float32Array(VERTS * 3)
    const mCol  = new Float32Array(VERTS * 3)
    const mIdx  = []

    for (let ti = 0; ti <= N; ti++) {
      for (let pi = 0; pi <= P; pi++) {
        const theta = (ti / N) * TWO_PI
        const phi   = (pi / P) * TWO_PI
        const vi    = ti * (P + 1) + pi
        const v     = mV(theta, phi)
        mPos[vi*3+0] = v.x; mPos[vi*3+1] = v.y; mPos[vi*3+2] = v.z
      }
    }
    for (let ti = 0; ti < N; ti++) {
      for (let pi = 0; pi < P; pi++) {
        const a = ti*(P+1)+pi, b = ti*(P+1)+pi+1
        const c = (ti+1)*(P+1)+pi, d = (ti+1)*(P+1)+pi+1
        mIdx.push(a,b,c, b,d,c)
      }
    }

    const mGeo = new THREE.BufferGeometry()
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3))
    mGeo.setAttribute('color',    new THREE.BufferAttribute(mCol, 3))
    mGeo.setIndex(mIdx)
    mGeo.computeVertexNormals()

    this._morseMesh = new THREE.Mesh(mGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )
    this._morseFVals = new Float32Array(VERTS)
    for (let ti = 0; ti <= N; ti++) {
      for (let pi = 0; pi <= P; pi++) {
        const theta = (ti/N)*TWO_PI, phi = (pi/P)*TWO_PI
        this._morseFVals[ti*(P+1)+pi] = mF(theta, phi)
      }
    }
    this._morseGeo  = mGeo
    this._morseMCol = mCol

    const lcPos1 = new Float32Array(LC_N * 3)
    const lcPos2 = new Float32Array(LC_N * 3)
    const lcGeo1 = new THREE.BufferGeometry()
    const lcGeo2 = new THREE.BufferGeometry()
    lcGeo1.setAttribute('position', new THREE.BufferAttribute(lcPos1, 3))
    lcGeo2.setAttribute('position', new THREE.BufferAttribute(lcPos2, 3))
    lcGeo1.setDrawRange(0, 0); lcGeo2.setDrawRange(0, 0)
    const lcMat = new THREE.LineBasicMaterial({ color: 0xf5f4eb, depthWrite: false })
    this._lcLine1 = new THREE.Line(lcGeo1, lcMat)
    this._lcLine2 = new THREE.Line(lcGeo2, lcMat.clone())
    this._lcPos1  = lcPos1; this._lcPos2 = lcPos2

    const critPts = [
      { pos: mV(0,       0),         color: 0xf5f4eb },
      { pos: mV(0,       Math.PI),   color: 0xe8c547 },
      { pos: mV(Math.PI, Math.PI),   color: 0xe8c547 },
      { pos: mV(Math.PI, 0),         color: 0x36a9ff },
    ]
    const sphGeo = new THREE.SphereGeometry(0.055, 10, 8)
    this._critGroup = new THREE.Group()
    critPts.forEach(({ pos, color }) => {
      const mesh = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color }))
      mesh.position.copy(pos)
      this._critGroup.add(mesh)
    })

    this._morseGroup = new THREE.Group()
    this._morseGroup.add(this._morseMesh, this._lcLine1, this._lcLine2, this._critGroup)
    this.scene.add(this._morseGroup)

    this._applyMorseColors(M_TMIN - 0.05)
  }

  _applyMorseColors(t) {
    const col   = this._morseMCol
    const fvals = this._morseFVals
    const N     = fvals.length
    const span  = M_TMAX - M_TMIN
    for (let vi = 0; vi < N; vi++) {
      const f     = fvals[vi]
      const below = f <= t
      const fade  = below ? 1.0 : 0.12 + 0.10 * (1 - Math.min(1, (f - t) / span))
      const src   = below ? C_TEAL : C_DIM
      col[vi*3+0] = src.r * fade
      col[vi*3+1] = src.g * fade
      col[vi*3+2] = src.b * fade
    }
    this._morseGeo.attributes.color.needsUpdate = true
    this._computeLevelCurve(t)
  }

  _computeLevelCurve(t) {
    const pos1 = this._lcPos1, pos2 = this._lcPos2
    let n1 = 0, n2 = 0
    for (let k = 0; k < LC_N; k++) {
      const phi = (k / LC_N) * TWO_PI
      const A   = M_R + M_r * Math.cos(phi)
      const val = t / A
      if (Math.abs(val) > 1) continue
      const theta1 = Math.acos(val)
      if (n1 < LC_N) {
        const v = mV(theta1, phi)
        pos1[n1*3+0]=v.x; pos1[n1*3+1]=v.y; pos1[n1*3+2]=v.z; n1++
      }
      if (n2 < LC_N) {
        const v = mV(TWO_PI - theta1, phi)
        pos2[n2*3+0]=v.x; pos2[n2*3+1]=v.y; pos2[n2*3+2]=v.z; n2++
      }
    }
    this._lcLine1.geometry.setDrawRange(0, n1)
    this._lcLine2.geometry.setDrawRange(0, n2)
    this._lcLine1.geometry.attributes.position.needsUpdate = true
    this._lcLine2.geometry.attributes.position.needsUpdate = true
  }

  // ── Exhibit switching ─────────────────────────────────────────────────────

  _setExhibit(name) {
    this.params.exhibit = name
    this._surfaceGroup.visible = (name === 'surface')
    this._hopfGroup.visible    = (name === 'hopf')
    this._morseGroup.visible   = (name === 'morse')
  }

  // ── Tweakpane ─────────────────────────────────────────────────────────────

  _buildPane() {
    this.pane = new Pane({ title: 'Surfaces' })

    // Exhibit selector
    this.pane.addBinding(this.params, 'exhibit', {
      label: 'exhibit',
      options: {
        'Surface Gallery': 'surface',
        'Hopf Fibration':  'hopf',
        'Morse Theory':    'morse',
      },
    }).on('change', ({ value }) => this._setExhibit(value))

    // ── Surface folder ───────────────────────────────────────────────────────
    const surfF = this.pane.addFolder({ title: 'Surface', expanded: true })

    // Build surface options grouped by family
    const surfOpts = {}
    SURFACES.forEach(s => { surfOpts[s.name] = s.id })
    surfF.addBinding(this.params, 'surfaceId', {
      label: 'shape', options: surfOpts,
    }).on('change', () => this._rebuildSurface())

    surfF.addBinding(this.params, 'colorMode', {
      label: 'color',
      options: {
        'Curvature K': 'curvature_K',
        'UV':          'uv',
        'Normal':      'normal',
        'Solid':       'solid',
      },
    }).on('change', () => this._applyDistortionsAndColor())

    surfF.addBinding(this.params, 'majorR', {
      label: 'major R', min: 0.5, max: 3.0, step: 0.05,
    }).on('change', () => this._rebuildSurface())

    surfF.addBinding(this.params, 'minorR', {
      label: 'minor r', min: 0.1, max: 1.4, step: 0.05,
    }).on('change', () => this._rebuildSurface())

    // ── Distortion folder ────────────────────────────────────────────────────
    const distF = this.pane.addFolder({ title: 'Distortions', expanded: true })
    distF.addBinding(this.params, 'twist',   { label: 'twist',   min: -2.0, max: 2.0,  step: 0.01 })
      .on('change', () => this._applyDistortionsAndColor())
    distF.addBinding(this.params, 'inflate', { label: 'inflate', min: -1.0, max: 1.5,  step: 0.01 })
      .on('change', () => this._applyDistortionsAndColor())
    distF.addBinding(this.params, 'noise',   { label: 'noise',   min:  0.0, max: 1.2,  step: 0.01 })
      .on('change', () => this._applyDistortionsAndColor())
    distF.addBinding(this.params, 'pinch',   { label: 'pinch',   min:  0.0, max: 1.0,  step: 0.01 })
      .on('change', () => this._applyDistortionsAndColor())

    // ── Hopf folder ──────────────────────────────────────────────────────────
    const hopfF = this.pane.addFolder({ title: 'Hopf Fibration', expanded: false })
    hopfF.addBinding(this.params, 'hopfSpeed', {
      label: 'spin speed', min: 0, max: 0.8, step: 0.01,
    })
    addGuideNotes(hopfF, [
      'Each circle is one fiber of η: S³ → S².',
      'Color = latitude band on S².',
      'Same color → fibers from same circle.',
    ])

    // ── Morse folder ─────────────────────────────────────────────────────────
    const morseF = this.pane.addFolder({ title: 'Morse Theory', expanded: false })
    morseF.addBinding(this.params, 'morseT', {
      label: 'height t',
      min: M_TMIN - 0.05, max: M_TMAX + 0.05, step: 0.005,
    }).on('change', ({ value }) => this._applyMorseColors(value))
    morseF.addBinding(this.params, 'morseAnim', { label: 'animate sweep' })
    addGuideNotes(morseF, [
      `Critical values: ±${M_TMAX.toFixed(2)}, ±${M_TS1.toFixed(2)}`,
      'Level curve topology changes at each.',
    ])

    animatePanel(this.pane)
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    this._time += dt

    if (this.params.exhibit === 'hopf') {
      this._updateHopf(dt)
    } else if (this.params.exhibit === 'morse' && this.params.morseAnim) {
      const span = (M_TMAX - M_TMIN) + 0.1
      this.params.morseT = M_TMIN + (this._time * 0.20) % span
      this.pane?.refresh()
      this._applyMorseColors(this.params.morseT)
    }
  }

  setAudio(audio) { this._audio = audio }

  onResize() {}

  aiContext() {
    const surf = SURFACES.find(s => s.id === this.params.surfaceId)
    return {
      mode:    'surfaces',
      exhibit: this.params.exhibit === 'surface' ? surf?.name : this.params.exhibit,
      params:  { ...this.params },
      view: this.params.exhibit === 'surface' && this._fitInfo ? {
        normalizedToExhibitVolume: true,
        originalRadius: this._fitInfo.radius,
        displayScale: this._fitInfo.scale,
        originalBounds: this._fitInfo.bounds,
      } : null,
    }
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  dispose() {
    if (this.renderer && this._saved) {
      const ctrl = this.renderer.controls
      this.renderer.camera.position.copy(this._saved.position)
      ctrl.target.copy(this._saved.target)
      ctrl.autoRotate      = this._saved.autoRotate
      ctrl.enableRotate    = this._saved.enableRotate
      ctrl.enablePan       = this._saved.enablePan
      ctrl.enableZoom      = this._saved.enableZoom
      this.renderer.parallaxEnabled = this._saved.parallax
      ctrl.update()
    }
    this._geo.dispose()
    this._mesh.material.dispose()
    this._hopfGeo.dispose()
    this._hopfMesh.material.dispose()
    this._morseGeo.dispose()
    this._morseMesh.material.dispose()
    this._lcLine1.geometry.dispose()
    this._lcLine2.geometry.dispose()
    this.pane?.dispose()
  }
}
