/**
 * particles.js — Background particle field (3D cube)
 *
 * XY motion: 2D curl noise (4 trig calls per particle) — divergence-free
 * flow so particles loop without sinking or spreading.
 *
 * Z motion: cheap sinusoidal drift with a per-particle phase offset —
 * gives genuine 3D volume at near-zero extra cost vs the old 3D curl noise
 * which required 12 trig calls per particle.
 *
 * Count reduced 1800+600 → 1200+400 for another ~33% CPU saving.
 */

import * as THREE from 'three'

// ---------------------------------------------------------------------------
// 2-D value noise + curl  (4 trig calls per particle)
// ---------------------------------------------------------------------------

function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function valueNoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return (
    hash2(ix,     iy    ) * (1 - ux) * (1 - uy) +
    hash2(ix + 1, iy    ) *      ux  * (1 - uy) +
    hash2(ix,     iy + 1) * (1 - ux) *      uy  +
    hash2(ix + 1, iy + 1) *      ux  *      uy
  )
}

function curlNoise2D(x, y, t, scale = 0.50) {
  const eps = 0.012
  const n   = (px, py) => valueNoise2(px * scale + t * 0.17, py * scale + t * 0.09)
  return {
    vx:  (n(x, y + eps) - n(x, y - eps)) / (2 * eps),
    vy: -(n(x + eps, y) - n(x - eps, y)) / (2 * eps),
  }
}

// ---------------------------------------------------------------------------
// Particle shader — perspective-attenuated glowing discs, additive blend
// ---------------------------------------------------------------------------

const VERT = /* glsl */`
  attribute float aAlpha;
  varying  float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mvPos  = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    float dist  = max(-mvPos.z, 0.5);
    gl_PointSize = clamp(4.2 / dist, 1.0, 7.0);
  }
`
const FRAG = /* glsl */`
  uniform vec3  uColor;
  varying float vAlpha;
  void main() {
    vec2  uv = gl_PointCoord * 2.0 - 1.0;
    float d  = dot(uv, uv);
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor, (1.0 - d) * vAlpha * 0.35);
  }
`

// ---------------------------------------------------------------------------
// BackgroundParticles
// ---------------------------------------------------------------------------

const N_BLUE  = 1200
const N_AMBER =  400
const N_TOTAL = N_BLUE + N_AMBER
const BOUNDS  = 2.2

export class BackgroundParticles {
  constructor(scene) {
    this.scene   = scene
    this._t      = 0

    this._pos    = new Float32Array(N_TOTAL * 3)
    this._alpha  = new Float32Array(N_TOTAL)
    this._zPhase = new Float32Array(N_TOTAL)  // unique Z drift phase per particle

    for (let i = 0; i < N_TOTAL; i++) {
      this._pos[i * 3]     = (Math.random() - 0.5) * BOUNDS * 2
      this._pos[i * 3 + 1] = (Math.random() - 0.5) * BOUNDS * 2
      this._pos[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS * 2
      this._alpha[i]       = 0.25 + Math.random() * 0.65
      this._zPhase[i]      = Math.random() * Math.PI * 2
    }

    const geoBlue  = this._makeGeo(0,      N_BLUE)
    const matBlue  = this._makeMat(0x00d2e6)
    this._pointsBlue = new THREE.Points(geoBlue, matBlue)
    scene.add(this._pointsBlue)

    const geoAmber  = this._makeGeo(N_BLUE, N_AMBER)
    const matAmber  = this._makeMat(0xe8c547)
    this._pointsAmber = new THREE.Points(geoAmber, matAmber)
    scene.add(this._pointsAmber)

    this._posAttrBlue  = geoBlue.attributes.position
    this._posAttrAmber = geoAmber.attributes.position
  }

  _makeGeo(offset, count) {
    const geo     = new THREE.BufferGeometry()
    const posView = new Float32Array(this._pos.buffer,   offset * 3 * 4, count * 3)
    const alpView = new Float32Array(this._alpha.buffer, offset     * 4, count)
    const posAttr = new THREE.BufferAttribute(posView, 3)
    const alpAttr = new THREE.BufferAttribute(alpView, 1)
    posAttr.usage = THREE.DynamicDrawUsage
    geo.setAttribute('position', posAttr)
    geo.setAttribute('aAlpha',   alpAttr)
    return geo
  }

  _makeMat(color) {
    return new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms:       { uColor: { value: new THREE.Color(color) } },
      transparent:    true,
      depthTest:      false,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
    })
  }

  update(dt, cursorNDC) {
    this._t += dt

    const cx = cursorNDC.x * BOUNDS
    const cy = cursorNDC.y * BOUNDS

    for (let i = 0; i < N_TOTAL; i++) {
      const bi = i * 3
      const px = this._pos[bi]
      const py = this._pos[bi + 1]

      // XY: 2D curl noise (4 hash calls total — fast)
      const { vx, vy } = curlNoise2D(px, py, this._t)

      // Z: sinusoidal drift with per-particle phase — looks 3D, costs one Math.sin
      const vz = Math.sin(this._zPhase[i] + this._t * 0.35 + px * 0.8 + py * 0.5) * 0.18

      // XY cursor repulsion
      const dx  = px - cx
      const dy  = py - cy
      const rep = 0.16 / (dx * dx + dy * dy + 0.10)

      this._pos[bi]     += (vx * 0.36 + dx * rep) * dt
      this._pos[bi + 1] += (vy * 0.36 + dy * rep) * dt
      this._pos[bi + 2] +=  vz * dt

      if (this._pos[bi]     >  BOUNDS) this._pos[bi]     = -BOUNDS
      if (this._pos[bi]     < -BOUNDS) this._pos[bi]     =  BOUNDS
      if (this._pos[bi + 1] >  BOUNDS) this._pos[bi + 1] = -BOUNDS
      if (this._pos[bi + 1] < -BOUNDS) this._pos[bi + 1] =  BOUNDS
      if (this._pos[bi + 2] >  BOUNDS) this._pos[bi + 2] = -BOUNDS
      if (this._pos[bi + 2] < -BOUNDS) this._pos[bi + 2] =  BOUNDS
    }

    this._posAttrBlue.needsUpdate  = true
    this._posAttrAmber.needsUpdate = true
  }

  setVisible(v) {
    this._pointsBlue.visible  = v
    this._pointsAmber.visible = v
  }

  dispose() {
    ;[this._pointsBlue, this._pointsAmber].forEach(p => {
      this.scene.remove(p)
      p.geometry.dispose()
      p.material.dispose()
    })
  }
}
