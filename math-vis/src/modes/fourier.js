/**
 * fourier.js — Fourier Series Epicycle Visualizer
 *
 * N phasors chained tip-to-tail. Each phasor is a circle (orbit path) and
 * a rotating arm. The arm of phasor N starts where arm N-1 ended.
 * The tip of the last arm draws the waveform on the right in real time.
 * A connector line traces from the tip horizontally to the waveform's
 * leading edge, linking the epicycle motion to the curve being drawn.
 *
 * Math:
 *   Tip position = chainStart + Σᵢ Aᵢ · [cos(i·ωt), sin(i·ωt)]
 *   f(t) = tipY  (the Y component is the Fourier sum)
 *
 *   Square:   Aₙ = 4/(nπ)  [odd n]
 *   Sawtooth: Aₙ = 2(-1)^(n+1)/(nπ)
 *   Triangle: Aₙ = 8/(n²π²) [odd n, alternating sign]
 *   Sine:     A₁ = 1
 *
 * Camera: straight overhead, locked. No rotation — 2D visualization.
 */

import * as THREE from 'three'
import { gsap }         from 'gsap'
import { Pane }         from 'tweakpane'
import { animatePanel } from '../core/ui.js'

const CAM_Z        = 3.2
const MAX_HARMONICS = 16
const WAVEFORM_LEN  = 800

// Blue → cyan spectrum, one shade per harmonic (colorblind safe)
const HARMONIC_COLOURS = [
  0x4499ff, 0x00ccff, 0x0066ff, 0x00ffee,
  0x2266dd, 0x00aaff, 0x44ddff, 0x0055cc,
  0x66bbff, 0x0099ee, 0x33ccff, 0x1144cc,
  0x55aaff, 0x0077dd, 0x22bbff, 0x0033bb,
]

// ---------------------------------------------------------------------------
// Fourier coefficients Aₙ for harmonic n (1-indexed)
// ---------------------------------------------------------------------------

function fourierCoeff(waveform, n) {
  switch (waveform) {
    case 'square':
      return n % 2 === 1 ? (4 / (Math.PI * n)) : 0

    case 'sawtooth':
      return (2 / (Math.PI * n)) * (n % 2 === 0 ? -1 : 1)

    case 'triangle': {
      if (n % 2 === 0) return 0
      const k    = (n - 1) / 2
      const sign = k % 2 === 0 ? 1 : -1
      return sign * (8 / (Math.PI * Math.PI * n * n))
    }

    case 'sine':
      return n === 1 ? 1 : 0

    default:
      return 0
  }
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export class FourierMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer
    this.t        = 0

    this.params = {
      harmonics: 7,
      speed:     0.6,
      waveform:  'square',
    }

    // --- Camera: straight overhead, locked ---
    const cam  = renderer.camera
    const ctrl = renderer.controls
    this._savedCamPos    = cam.position.clone()
    this._savedTarget    = ctrl.target.clone()
    this._savedAutoRot   = ctrl.autoRotate
    this._savedEnableRot = ctrl.enableRotate

    cam.position.set(0, 0, CAM_Z)
    ctrl.target.set(0, 0, 0)
    ctrl.autoRotate   = false
    ctrl.enableRotate = false
    cam.updateProjectionMatrix()
    renderer.parallaxEnabled = false   // flat 2D view — no scene tilt

    // Waveform Y history (world-space values, not normalised)
    this._yBuf = new Float32Array(WAVEFORM_LEN)

    this._buildChain()
    this._buildTipDot()
    this._buildWaveform()
    this._buildConnector()
    this._buildDivider()
    this._buildUI()
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  _halfH()  { return CAM_Z * Math.tan(THREE.MathUtils.degToRad(30)) }
  _aspect() { return window.innerWidth / window.innerHeight }

  /** X position of the epicycle anchor (centre of the chain) */
  _chainX() { return -this._halfH() * this._aspect() * 0.42 }

  /**
   * Base radius: the fundamental phasor arm length in world units.
   * Scaled so the TOTAL chain radius (Σ|Aₙ/A₁| × baseR) fits within TARGET_R.
   */
  _baseRadius() {
    const n  = this.params.harmonics
    const A1 = Math.abs(fourierCoeff(this.params.waveform, 1)) || 1
    let   totalWeight = 0
    for (let i = 1; i <= n; i++) {
      totalWeight += Math.abs(fourierCoeff(this.params.waveform, i)) / A1
    }
    const TARGET_R = this._halfH() * 0.72
    return totalWeight > 0 ? TARGET_R / totalWeight : TARGET_R
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  _buildChain() {
    this._chainGroup = new THREE.Group()
    this._armLines   = []
    this._orbitLines = []

    for (let i = 0; i < MAX_HARMONICS; i++) {
      const col = HARMONIC_COLOURS[i % HARMONIC_COLOURS.length]

      // Arm: two vertices [start, tip] — positions updated each frame
      const armGeo = new THREE.BufferGeometry()
      armGeo.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(6), 3))
      const arm = new THREE.Line(armGeo,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.90 }))

      // Orbit circle: unit circle scaled to arm radius each frame via .scale
      const pts = []
      for (let a = 0; a <= 64; a++) {
        const θ = (a / 64) * Math.PI * 2
        pts.push(Math.cos(θ), Math.sin(θ), 0)
      }
      const orbitGeo = new THREE.BufferGeometry()
      orbitGeo.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(pts), 3))
      const orbit = new THREE.LineLoop(orbitGeo,
        new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.20 }))

      arm.visible   = i < this.params.harmonics
      orbit.visible = i < this.params.harmonics

      this._chainGroup.add(arm)
      this._chainGroup.add(orbit)
      this._armLines.push(arm)
      this._orbitLines.push(orbit)
    }

    this.scene.add(this._chainGroup)
  }

  _buildTipDot() {
    // Small bright dot at the chain tip so it's easy to follow
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3))
    this._tipDot = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, sizeAttenuation: true }))
    this.scene.add(this._tipDot)
  }

  _buildWaveform() {
    this._wavePosArr = new Float32Array(WAVEFORM_LEN * 3)
    const geo  = new THREE.BufferGeometry()
    const attr = new THREE.BufferAttribute(this._wavePosArr, 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', attr)
    this._waveformLine = new THREE.Line(geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }))
    this.scene.add(this._waveformLine)
  }

  _buildConnector() {
    // Horizontal line from chain tip → waveform leading edge
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(6), 3))
    this._connectorLine = new THREE.Line(geo,
      new THREE.LineBasicMaterial({ color: 0x445566, transparent: true, opacity: 0.55 }))
    this.scene.add(this._connectorLine)
  }

  _buildDivider() {
    const halfH = this._halfH()
    const geo   = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([0, -halfH, 0,  0, halfH, 0]), 3))
    this._divider = new THREE.Line(geo,
      new THREE.LineBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.45 }))
    this.scene.add(this._divider)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Fourier Series' })
    Object.assign(this.pane.element.style, {
      position: 'fixed',
      top:      '60px',
      right:    '16px',
      zIndex:   '100',
      width:    '260px',
    })
    animatePanel(this.pane)

    this.pane.addBinding(this.params, 'harmonics', {
      label: 'harmonics  N', min: 1, max: MAX_HARMONICS, step: 1,
    }).on('change', () => this._reset())

    this.pane.addBinding(this.params, 'speed', {
      label: 'speed', min: 0.05, max: 2.0, step: 0.05,
    })

    const wf = this.pane.addFolder({ title: 'Waveform', expanded: true })
    for (const name of ['square', 'sawtooth', 'triangle', 'sine']) {
      wf.addButton({ title: name }).on('click', () => {
        this.params.waveform = name
        this._reset()
      })
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------

  update(dt) {
    this.renderer.controls.autoRotate = false
    this.t += dt * this.params.speed

    const n      = this.params.harmonics
    const omega  = Math.PI * 2
    const A1     = Math.abs(fourierCoeff(this.params.waveform, 1)) || 1
    const baseR  = this._baseRadius()
    const halfH  = this._halfH()
    const halfW  = halfH * this._aspect()

    // --- Walk the chain ---
    let x = this._chainX()
    let y = 0

    for (let i = 0; i < MAX_HARMONICS; i++) {
      const visible = i < n
      this._armLines[i].visible   = visible
      this._orbitLines[i].visible = visible
      if (!visible) continue

      const harmN = i + 1
      const Araw  = fourierCoeff(this.params.waveform, harmN)
      const armR  = (Math.abs(Araw) / A1) * baseR
      const sign  = Araw < 0 ? -1 : 1
      const angle = harmN * omega * this.t

      const tipX = x + sign * armR * Math.cos(angle)
      const tipY = y + sign * armR * Math.sin(angle)

      // Orbit circle: centred at current chain position, scaled to arm radius
      this._orbitLines[i].position.set(x, y, 0)
      this._orbitLines[i].scale.set(armR, armR, 1)

      // Arm: straight line from chain position to tip
      const arr = this._armLines[i].geometry.attributes.position.array
      arr[0] = x;    arr[1] = y;    arr[2] = 0
      arr[3] = tipX; arr[4] = tipY; arr[5] = 0
      this._armLines[i].geometry.attributes.position.needsUpdate = true

      x = tipX
      y = tipY
    }

    // x, y = final chain tip in world space

    // --- Tip dot ---
    this._tipDot.geometry.attributes.position.array[0] = x
    this._tipDot.geometry.attributes.position.array[1] = y
    this._tipDot.geometry.attributes.position.needsUpdate = true

    // --- Waveform: shift history, insert new tip Y ---
    this._yBuf.copyWithin(1, 0, WAVEFORM_LEN - 1)
    this._yBuf[0] = y

    const xStart = 0.05
    const xEnd   = halfW * 0.96
    const waveW  = xEnd - xStart

    for (let i = 0; i < WAVEFORM_LEN; i++) {
      this._wavePosArr[i * 3]     = xStart + (i / (WAVEFORM_LEN - 1)) * waveW
      this._wavePosArr[i * 3 + 1] = this._yBuf[i]
      this._wavePosArr[i * 3 + 2] = 0
    }
    this._waveformLine.geometry.attributes.position.needsUpdate = true

    // --- Connector: tip → waveform leading edge ---
    const ca = this._connectorLine.geometry.attributes.position.array
    ca[0] = x;      ca[1] = y; ca[2] = 0
    ca[3] = xStart; ca[4] = y; ca[5] = 0
    this._connectorLine.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  _reset() {
    this.t = 0
    this._yBuf.fill(0)
    this._wavePosArr.fill(0)
    this._waveformLine.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose() {
    const cam  = this.renderer.camera
    const ctrl = this.renderer.controls
    cam.position.copy(this._savedCamPos)
    ctrl.target.copy(this._savedTarget)
    ctrl.autoRotate      = this._savedAutoRot
    ctrl.enableRotate    = this._savedEnableRot
    ctrl.autoRotateSpeed = 0.6
    cam.updateProjectionMatrix()
    this.renderer.parallaxEnabled = true

    this.scene.remove(this._chainGroup)
    this.scene.remove(this._tipDot)
    this.scene.remove(this._waveformLine)
    this.scene.remove(this._connectorLine)
    this.scene.remove(this._divider)

    this._armLines.forEach(l => { l.geometry.dispose(); l.material.dispose() })
    this._orbitLines.forEach(l => { l.geometry.dispose(); l.material.dispose() })
    this._tipDot.geometry.dispose()
    this._tipDot.material.dispose()
    this._waveformLine.geometry.dispose()
    this._waveformLine.material.dispose()
    this._connectorLine.geometry.dispose()
    this._connectorLine.material.dispose()
    this._divider.geometry.dispose()
    this._divider.material.dispose()
    this.pane.dispose()
  }
}
