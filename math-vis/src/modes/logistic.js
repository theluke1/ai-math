/**
 * logistic.js — Logistic Map bifurcation diagram
 *
 * The logistic map: x_{n+1} = r · x_n · (1 − x_n)
 *
 * Visualisation:
 *   • Bifurcation diagram — the full attractor for each r value [0, 4].
 *     For each r, iterate 500 times to discard transients, then plot 250
 *     iterates as aqua dots. The resulting scatter-plot reveals:
 *       r < 1        → population dies out (x → 0)
 *       1 < r < 3    → stable fixed point
 *       3 < r ≈ 3.57 → period-doubling cascade (2→4→8→…)
 *       r > 3.57     → chaos, with periodic windows
 *
 *   • Orbit indicator — amber dot jumping through the orbit values at the
 *     r under the cursor, making the dynamics legible.
 *
 *   • Hover column — faint vertical line at cursor r.
 *
 *   • Period readout — detects if the orbit is periodic (period 1, 2, 4 …)
 *     or chaotic, displayed in the control panel.
 *
 * World-space mapping:
 *   r [0, 4] → world X [-2.8, 2.8]
 *   x [0, 1] → world Y [-1.7, 1.7]
 */

import * as THREE from 'three'
import { Pane }          from 'tweakpane'
import { animatePanel, addGuideNotes }  from '../core/ui.js'

// ---------------------------------------------------------------------------
// Diagram generation
// ---------------------------------------------------------------------------

const N_R     = 720      // horizontal resolution (r-axis)
const DISCARD = 500      // transient iterations to skip
const PLOT    = 250      // iterations to plot per r value
const R_MIN   = 0.0
const R_MAX   = 4.0

// World-space coordinate transforms
const WX = r => (r / 4.0 - 0.5) * 5.6        // r [0,4] → x [-2.8, 2.8]
const WY = x => (x - 0.5) * 3.4              // x [0,1] → y [-1.7, 1.7]

/**
 * Build the full bifurcation diagram as a flat Float32Array of positions.
 * Returns {pos, count} — count may be < N_R*PLOT because r<1 is skipped.
 */
function buildDiagram(rMin = R_MIN, rMax = R_MAX) {
  const pos = new Float32Array(N_R * PLOT * 3)
  let idx   = 0

  for (let ri = 0; ri < N_R; ri++) {
    const r = rMin + (ri / (N_R - 1)) * (rMax - rMin)
    let x   = 0.5
    for (let i = 0; i < DISCARD; i++) x = r * x * (1 - x)
    for (let i = 0; i < PLOT; i++) {
      x = r * x * (1 - x)
      pos[idx * 3]     = WX(r)
      pos[idx * 3 + 1] = WY(x)
      pos[idx * 3 + 2] = 0.0
      idx++
    }
  }

  return { pos, count: idx }
}

/**
 * Compute orbit tail for a given r (after transients).
 * Returns an array of ORBIT_LEN x-values.
 */
const ORBIT_LEN = 128
function computeOrbit(r) {
  let x = 0.5
  for (let i = 0; i < 600; i++) x = r * x * (1 - x)
  const pts = new Array(ORBIT_LEN)
  for (let i = 0; i < ORBIT_LEN; i++) {
    x = r * x * (1 - x)
    pts[i] = x
  }
  return pts
}

/**
 * Detect period of an orbit tail.  Returns 1, 2, 4, 8, 16 or 'chaos'.
 */
function detectPeriod(pts) {
  const tail = pts.slice(ORBIT_LEN - 32)
  for (const p of [1, 2, 4, 8, 16]) {
    const half = tail.slice(-p * 2)
    let ok = true
    for (let i = 0; i < p; i++) {
      if (Math.abs(half[i] - half[i + p]) > 0.006) { ok = false; break }
    }
    if (ok) return p
  }
  return 'chaos'
}

// ---------------------------------------------------------------------------
// LogisticMode
// ---------------------------------------------------------------------------

export class LogisticMode {
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer

    this.params = {
      orbitSpeed: 5.0,
    }

    this._orbitT    = 0.0
    this._orbitR    = -99         // sentinel — triggers initial compute
    this._orbitPts  = []
    this._period    = '—'
    this._cursorR   = 3.5

    // UI display objects (Tweakpane monitors read these)
    this._display = { r: '3.5000', period: '—' }

    this._buildDiagram()
    this._buildHoverLine()
    this._buildOrbitDot()
    this._buildAxisLines()
    this._buildUI()

    // Lock camera — this is a 2D flat diagram
    if (renderer) {
      this._savedPos        = renderer.camera.position.clone()
      this._savedTarget     = renderer.controls.target.clone()
      this._savedAutoRotate = renderer.controls.autoRotate

      renderer.controls.enabled    = false
      renderer.controls.autoRotate = false   // prevent background rotation
      renderer.parallaxEnabled     = false
      renderer.camera.position.set(0, 0, 4.0)
      renderer.camera.lookAt(0, 0, 0)
      renderer.scene.rotation.set(0, 0, 0)   // snap out any residual parallax tilt

      // Disable bloom (flat 2D — no benefit, just washes out dots)
      this._savedBloom     = renderer.bloomPass.strength
      this._savedThreshold = renderer.bloomPass.threshold
      renderer.bloomPass.strength  = 0
      renderer.bloomPass.threshold = 1
    }
  }

  // ---------------------------------------------------------------------------
  // Build scene objects
  // ---------------------------------------------------------------------------

  _buildDiagram() {
    const { pos, count } = buildDiagram()

    this._diagGeo = new THREE.BufferGeometry()
    // Slice to actual count so draw call is exact
    this._diagGeo.setAttribute('position',
      new THREE.BufferAttribute(pos.subarray(0, count * 3), 3))

    this._diagMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x00d2e6) } },
      vertexShader: /* glsl */`
        void main() {
          gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.35;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        void main() {
          vec2  uv = gl_PointCoord * 2.0 - 1.0;
          float d  = dot(uv, uv);
          if (d > 1.0) discard;
          gl_FragColor = vec4(uColor, (1.0 - d) * 0.72);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })

    this._diagPoints = new THREE.Points(this._diagGeo, this._diagMat)
    this.scene.add(this._diagPoints)
  }

  _buildHoverLine() {
    // Thin vertical line that tracks cursor r — update X each frame
    const buf = new Float32Array([
      WX(3.5), WY(0) - 0.05, 0.01,
      WX(3.5), WY(1) + 0.05, 0.01,
    ])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0xe8c547, transparent: true, opacity: 0.28,
    })
    this._hoverLine    = new THREE.Line(geo, mat)
    this._hoverLineBuf = geo.attributes.position
    this.scene.add(this._hoverLine)
  }

  _buildOrbitDot() {
    // Animated amber dot cycling through orbit values at cursor r
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([0, 0, 0.02]), 3))

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */`
        void main() {
          gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 10.0;
        }
      `,
      fragmentShader: /* glsl */`
        void main() {
          vec2  uv = gl_PointCoord * 2.0 - 1.0;
          float d  = dot(uv, uv);
          if (d > 1.0) discard;
          // Amber gold — same as cursor dot colour
          gl_FragColor = vec4(1.0, 0.78, 0.08, (1.0 - d * d) * 0.95);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })

    this._orbitDot    = new THREE.Points(geo, mat)
    this._orbitDotBuf = geo.attributes.position
    this.scene.add(this._orbitDot)
  }

  _buildAxisLines() {
    // r-axis (horizontal, at x=0) and x-axis (vertical, at r=0)
    const buf = new Float32Array([
      WX(R_MIN) - 0.08, WY(0), 0,   WX(R_MAX) + 0.08, WY(0), 0,    // r axis
      WX(R_MIN) - 0.08, WY(0) - 0.05, 0,  WX(R_MIN) - 0.08, WY(1) + 0.05, 0, // x axis
    ])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0x2a4060, transparent: true, opacity: 0.50,
    })
    this._axisLines = new THREE.LineSegments(geo, mat)
    this.scene.add(this._axisLines)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Logistic Map' })
    Object.assign(this.pane.element.style, {
      position: 'fixed',
      top:      '60px',
      right:    '16px',
      zIndex:   '100',
      width:    '260px',
    })
    animatePanel(this.pane)

    // Live readouts
    const liveFolder = this.pane.addFolder({ title: 'Cursor', expanded: true })
    liveFolder.addBinding(this._display, 'r',      { label: 'r value', readonly: true, interval: 80 })
    liveFolder.addBinding(this._display, 'period', { label: 'orbit', readonly: true, interval: 80 })

    // Orbit animation speed
    const animFolder = this.pane.addFolder({ title: 'Animation', expanded: true })
    animFolder.addBinding(this.params, 'orbitSpeed', {
      label: 'orbit speed', min: 0.5, max: 16, step: 0.1,
    })

    // Guide
    const guide = this.pane.addFolder({ title: 'Guide', expanded: true })
    addGuideNotes(guide, [
      'Move cursor left → right to scan r',
      'r < 1 : population → 0',
      '1 < r < 3 : stable fixed point',
      'r = 3.0 : period-2 bifurcation',
      'r ≈ 3.45 : period-4',
      'r ≈ 3.54 : period-8',
      'r ≈ 3.57 : onset of chaos',
      'r ≈ 3.83 : period-3 window',
    ])
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update(dt) {
    // Map cursor NDC x to r value
    const ndcX = this.renderer?._mouse?.x ?? 0
    const r    = R_MIN + ((ndcX + 1) / 2) * (R_MAX - R_MIN)
    this._cursorR = r

    // Update hover line X
    const wx = WX(r)
    const buf = this._hoverLineBuf.array
    buf[0] = wx;  buf[3] = wx
    this._hoverLineBuf.needsUpdate = true

    // Recompute orbit when r changes meaningfully
    if (Math.abs(r - this._orbitR) > 0.004) {
      this._orbitPts = computeOrbit(r)
      this._orbitR   = r
      this._period   = detectPeriod(this._orbitPts)
      this._display.r      = r.toFixed(4)
      this._display.period = this._period === 'chaos'
        ? 'chaos'
        : `period-${this._period}`
    }

    // Advance orbit animation and place dot
    if (this._orbitPts.length > 0) {
      this._orbitT += dt * this.params.orbitSpeed
      const frame = Math.floor(this._orbitT) % this._orbitPts.length
      const xVal  = this._orbitPts[frame]
      this._orbitDotBuf.setXYZ(0, wx, WY(xVal), 0.02)
      this._orbitDotBuf.needsUpdate = true
    }
  }

  onResize() {}

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose() {
    ;[this._diagPoints, this._hoverLine, this._orbitDot, this._axisLines].forEach(o => {
      this.scene.remove(o)
      o.geometry.dispose()
      o.material.dispose()
    })
    this.pane.dispose()

    if (this.renderer) {
      this.renderer.controls.enabled    = true
      this.renderer.controls.autoRotate = this._savedAutoRotate
      this.renderer.parallaxEnabled     = true
      this.renderer.camera.position.copy(this._savedPos)
      this.renderer.controls.target.copy(this._savedTarget)
      this.renderer.bloomPass.strength  = this._savedBloom
      this.renderer.bloomPass.threshold = this._savedThreshold
    }
  }
}
