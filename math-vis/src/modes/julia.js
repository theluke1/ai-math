/**
 * julia.js — Julia / Mandelbrot linked explorer
 *
 * Split-screen: left half = Mandelbrot set (c varies per pixel, z₀ = 0)
 *               right half = Julia set (z₀ = pixel, c = uC fixed)
 *
 * The golden dot on the Mandelbrot side marks the current c value.
 * Hovering the left half updates c continuously — the Julia set morphs
 * in real time, showing how each point in the Mandelbrot set parameterises
 * a completely different Julia geometry.
 *
 * Click the Mandelbrot side to pin c so both halves can be zoomed
 * independently. Click again to unpin.
 *
 * Architecture: single PlaneGeometry(2,2) with one shader that partitions
 * by UV.x — no second render target or scissor needed.
 */

import * as THREE from 'three'
import { Pane }   from 'tweakpane'
import { animatePanel, addGuideNotes } from '../core/ui.js'

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  precision highp float;

  uniform vec2  uResolution;
  uniform vec2  uMandCenter;
  uniform float uMandZoom;
  uniform vec2  uJuliaCenter;
  uniform float uJuliaZoom;
  uniform vec2  uC;
  uniform int   uMaxIter;
  uniform float uTime;
  uniform float uColorShift;

  varying vec2 vUv;

  // ── Palette ─────────────────────────────────────────────────────────────────
  // Same 5-stop gradient as mandelbrot.frag. Peak ≤ 0.52 to stay under bloom.
  vec3 palette(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.016, 0.047, 0.125);
    vec3 c1 = vec3(0.063, 0.376, 0.753);
    vec3 c2 = vec3(0.000, 0.627, 0.722);
    vec3 c3 = vec3(0.722, 0.502, 0.031);
    vec3 c4 = vec3(0.549, 0.494, 0.345);
    if (t < 0.22) return mix(c0, c1, t / 0.22);
    if (t < 0.48) return mix(c1, c2, (t - 0.22) / 0.26);
    if (t < 0.72) return mix(c2, c3, (t - 0.48) / 0.24);
                  return mix(c3, c4, (t - 0.72) / 0.28);
  }

  // ── Smooth escape time ───────────────────────────────────────────────────────
  // Runs at most uMaxIter steps (cap 1024 for WebGL 1 compatibility).
  // Returns sqrt-normalised t ∈ (0,1] if escaped, −1.0 if in set.
  float escapeT(vec2 z0, vec2 seed) {
    vec2  z    = z0;
    float len2 = 0.0;
    for (int i = 0; i < 1024; i++) {
      if (i >= uMaxIter) return -1.0;
      z    = vec2(z.x*z.x - z.y*z.y + seed.x, 2.0*z.x*z.y + seed.y);
      len2 = dot(z, z);
      if (len2 > 256.0) {
        float sl = float(i) - log2(log2(sqrt(len2))) + 1.0;
        return sqrt(clamp(sl / float(uMaxIter), 0.0, 1.0));
      }
    }
    return -1.0;
  }

  void main() {
    vec2  uv         = vUv;
    float halfAspect = uResolution.x * 0.5 / uResolution.y;

    // ── Divider ─────────────────────────────────────────────────────────────────
    float divPx = abs(uv.x - 0.5) * uResolution.x;
    if (divPx < 1.5) {
      gl_FragColor = vec4(0.18, 0.38, 0.60, 1.0);
      return;
    }

    bool  isLeft = uv.x < 0.5;
    float t;

    if (isLeft) {
      // Mandelbrot — c = complex pixel coord, z₀ = 0
      vec2 local = vec2(uv.x * 4.0 - 1.0, uv.y * 2.0 - 1.0);
      vec2 c     = uMandCenter + local * vec2(halfAspect, 1.0) * uMandZoom;
      t = escapeT(vec2(0.0), c);
    } else {
      // Julia — z₀ = complex pixel coord, c = uC (fixed)
      vec2 local = vec2((uv.x - 0.5) * 4.0 - 1.0, uv.y * 2.0 - 1.0);
      vec2 z     = uJuliaCenter + local * vec2(halfAspect, 1.0) * uJuliaZoom;
      t = escapeT(z, uC);
    }

    vec3 col;
    if (t < 0.0) {
      col = vec3(0.012, 0.024, 0.063);  // in set — deep navy
    } else {
      col = palette(fract(t + uColorShift + uTime * 0.008));
    }

    // ── c indicator dot (Mandelbrot side only) ───────────────────────────────
    if (isLeft) {
      // Convert uC to UV coords within the left half
      vec2 cNDC  = (uC - uMandCenter) / (vec2(halfAspect, 1.0) * uMandZoom);
      vec2 cUV   = vec2((cNDC.x + 1.0) * 0.25, (cNDC.y + 1.0) * 0.5);
      float dist = length((uv - cUV) * uResolution);
      float pulse = 0.72 + 0.28 * sin(uTime * 4.5);

      // Amber filled core
      if (dist < 3.5) {
        col = mix(col, vec3(0.91, 0.77, 0.08) * pulse, 1.0 - dist / 3.5);
      }
      // Cyan ring
      float ringR = 7.0;
      float ringW = 1.8;
      if (dist > ringR - ringW && dist < ringR + ringW) {
        float f = 1.0 - abs(dist - ringR) / ringW;
        col = mix(col, vec3(0.00, 0.78, 0.92), f * 0.80);
      }
    }

    // ── Per-half vignette ─────────────────────────────────────────────────────
    vec2 localUV = isLeft
      ? vec2(uv.x * 2.0, uv.y)
      : vec2((uv.x - 0.5) * 2.0, uv.y);
    col *= 1.0 - dot(localUV - 0.5, localUV - 0.5) * 0.48;

    col = min(col, vec3(0.52));
    gl_FragColor = vec4(col, 1.0);
  }
`

// ---------------------------------------------------------------------------
// Presets — famous Julia set c values
// ---------------------------------------------------------------------------

const PRESETS = [
  { label: 'Elephant Valley',  c: [-0.7269,  0.1889] },
  { label: 'Douady Rabbit',    c: [-0.1226,  0.7449] },
  { label: 'Spiral Arms',      c: [-0.7,     0.27  ] },
  { label: 'Siegel Disk',      c: [-0.7615,  0.0893] },
  { label: 'Islands',          c: [ 0.285,   0.01  ] },
  { label: 'San Marco Dragon', c: [-0.75,    0.0   ] },
  { label: 'Dendrite',         c: [ 0.0,    -0.8   ] },
]

// ---------------------------------------------------------------------------
// JuliaMode
// ---------------------------------------------------------------------------

export class JuliaMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer
    this._t       = 0

    // Each half has independent view state
    this._mandCenter  = new THREE.Vector2(-0.5, 0.0)
    this._mandZoom    = 1.4
    this._juliaCenter = new THREE.Vector2(0.0,  0.0)
    this._juliaZoom   = 1.4

    // c drives the Julia set — updated from cursor unless pinned
    this._c      = new THREE.Vector2(-0.7269, 0.1889)
    this._pinned = false

    // Drag tracking
    this._dragging   = false
    this._hasDragged = false
    this._dragSide   = null   // 'mand' | 'julia'
    this._dragStart  = { x: 0, y: 0 }
    this._dragCenter = new THREE.Vector2()

    // Display object for Tweakpane readonly bindings
    this._cDisplay = { re: '-0.7269', im: '+0.1889i' }

    // ── Lock renderer to 2D ─────────────────────────────────────────────────
    if (renderer) {
      this._savedCamPos    = renderer.camera.position.clone()
      this._savedTarget    = renderer.controls.target.clone()
      this._savedAutoRot   = renderer.controls.autoRotate
      this._savedEnableRot = renderer.controls.enableRotate
      this._savedBloomStr  = renderer.bloomPass.strength
      this._savedBloomThr  = renderer.bloomPass.threshold

      renderer.controls.enabled      = false
      renderer.controls.autoRotate   = false
      renderer.controls.enableRotate = false
      renderer.controls.enablePan    = false
      renderer.parallaxEnabled       = false
      renderer.camera.position.set(0, 0, 1)
      renderer.camera.lookAt(0, 0, 0)
      renderer.scene.rotation.set(0, 0, 0)
      renderer.bloomPass.strength    = 0
      renderer.bloomPass.threshold   = 1
    }

    this._buildMesh()
    this._buildLabels()
    this._buildUI()
    this._bindEvents()
  }

  // -------------------------------------------------------------------------
  // Mesh
  // -------------------------------------------------------------------------

  _buildMesh() {
    const geo = new THREE.PlaneGeometry(2, 2)
    this.uniforms = {
      uResolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uMandCenter:  { value: this._mandCenter.clone() },
      uMandZoom:    { value: this._mandZoom },
      uJuliaCenter: { value: this._juliaCenter.clone() },
      uJuliaZoom:   { value: this._juliaZoom },
      uC:           { value: this._c.clone() },
      uMaxIter:     { value: 220 },
      uTime:        { value: 0 },
      uColorShift:  { value: 0 },
    }
    this._mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms:       this.uniforms,
    }))
    this.scene.add(this._mesh)
  }

  // -------------------------------------------------------------------------
  // Side labels (DOM)
  // -------------------------------------------------------------------------

  _buildLabels() {
    const css = `
      position: fixed;
      bottom: 18px;
      font-family: 'Electrolize', monospace;
      font-size: 10px;
      letter-spacing: 0.20em;
      text-transform: uppercase;
      color: rgba(140, 175, 215, 0.35);
      pointer-events: none;
      user-select: none;
      z-index: 50;
      transform: translateX(-50%);
    `
    this._leftLabel = document.createElement('div')
    this._leftLabel.textContent = 'Mandelbrot'
    this._leftLabel.style.cssText = css + 'left: 25%;'
    document.body.appendChild(this._leftLabel)

    this._rightLabel = document.createElement('div')
    this._rightLabel.textContent = 'Julia'
    this._rightLabel.style.cssText = css + 'left: 75%;'
    document.body.appendChild(this._rightLabel)
  }

  // -------------------------------------------------------------------------
  // Tweakpane UI
  // -------------------------------------------------------------------------

  _buildUI() {
    this.pane = new Pane({ title: 'Julia Explorer' })
    Object.assign(this.pane.element.style, {
      position: 'fixed', top: '60px', right: '16px', zIndex: '100', width: '260px',
    })
    animatePanel(this.pane)

    // ── c readout ────────────────────────────────────────────────────────────
    const cFolder = this.pane.addFolder({ title: 'c  (complex parameter)', expanded: true })
    this._reBinding = cFolder.addBinding(this._cDisplay, 're', { label: 'Re', readonly: true })
    this._imBinding = cFolder.addBinding(this._cDisplay, 'im', { label: 'Im', readonly: true })
    this._pinBtn = cFolder.addButton({ title: 'Pin c  (lock Julia shape)' })
      .on('click', () => this._togglePin())

    // ── Famous Julia sets ─────────────────────────────────────────────────────
    const presetsFolder = this.pane.addFolder({ title: 'Famous Julia Sets', expanded: true })
    PRESETS.forEach(({ label, c }) => {
      presetsFolder.addButton({ title: label }).on('click', () => {
        this._c.set(c[0], c[1])
        this.uniforms.uC.value.copy(this._c)
        this._pinned   = true
        this._pinBtn.title = 'Unpin c  (live cursor)'
        this._updateCDisplay()
        this._resetJulia()
      })
    })

    // ── View controls ─────────────────────────────────────────────────────────
    const viewFolder = this.pane.addFolder({ title: 'View', expanded: false })
    viewFolder.addBinding(this.uniforms.uMaxIter, 'value', {
      label: 'iterations', min: 80, max: 600, step: 10,
    })
    viewFolder.addBinding(this.uniforms.uColorShift, 'value', {
      label: 'colour shift', min: 0, max: 1, step: 0.01,
    })
    viewFolder.addButton({ title: 'Reset Mandelbrot' }).on('click', () => this._resetMand())
    viewFolder.addButton({ title: 'Reset Julia' }).on('click', () => this._resetJulia())

    // ── Guide ─────────────────────────────────────────────────────────────────
    const guide = this.pane.addFolder({ title: 'Guide', expanded: true })
    addGuideNotes(guide, [
      'Hover left → Julia reshapes live',
      'Click left → pin c, zoom freely',
      'Scroll / drag → zoom each half',
      'c inside Mandelbrot → connected Julia',
      'c outside Mandelbrot → Cantor dust',
    ])
  }

  // -------------------------------------------------------------------------
  // Input events
  // -------------------------------------------------------------------------

  _bindEvents() {
    this._onWheel = e => {
      e.preventDefault()
      const isLeft     = e.clientX < window.innerWidth / 2
      const factor     = e.deltaY > 0 ? 1.15 : 0.87
      const halfAspect = (window.innerWidth * 0.5) / window.innerHeight

      if (isLeft) {
        // NDC within left half: u∈[0,0.5] → ndc = u*4-1
        const ndcX = (e.clientX / window.innerWidth) * 4.0 - 1.0
        const ndcY = (1 - e.clientY / window.innerHeight) * 2.0 - 1.0
        const wx   = this._mandCenter.x + ndcX * halfAspect * this._mandZoom
        const wy   = this._mandCenter.y + ndcY * this._mandZoom
        this._mandZoom = Math.max(5e-7, Math.min(4.0, this._mandZoom * factor))
        this._mandCenter.x = wx - ndcX * halfAspect * this._mandZoom
        this._mandCenter.y = wy - ndcY * this._mandZoom
      } else {
        // NDC within right half: u∈[0.5,1] → ndc = u*4-3
        const ndcX = (e.clientX / window.innerWidth) * 4.0 - 3.0
        const ndcY = (1 - e.clientY / window.innerHeight) * 2.0 - 1.0
        const wx   = this._juliaCenter.x + ndcX * halfAspect * this._juliaZoom
        const wy   = this._juliaCenter.y + ndcY * this._juliaZoom
        this._juliaZoom = Math.max(5e-7, Math.min(4.0, this._juliaZoom * factor))
        this._juliaCenter.x = wx - ndcX * halfAspect * this._juliaZoom
        this._juliaCenter.y = wy - ndcY * this._juliaZoom
      }
      this._syncUniforms()
    }

    this._onMousedown = e => {
      if (e.button !== 0) return
      this._dragging   = true
      this._hasDragged = false
      this._dragSide   = e.clientX < window.innerWidth / 2 ? 'mand' : 'julia'
      this._dragStart  = { x: e.clientX, y: e.clientY }
      this._dragCenter.copy(this._dragSide === 'mand' ? this._mandCenter : this._juliaCenter)
    }

    this._onMousemove = e => {
      const isLeft     = e.clientX < window.innerWidth / 2
      const halfAspect = (window.innerWidth * 0.5) / window.innerHeight

      // Update c from cursor when hovering Mandelbrot side and not pinned
      if (isLeft && !this._pinned) {
        const ndcX = (e.clientX / window.innerWidth) * 4.0 - 1.0
        const ndcY = (1 - e.clientY / window.innerHeight) * 2.0 - 1.0
        this._c.set(
          this._mandCenter.x + ndcX * halfAspect * this._mandZoom,
          this._mandCenter.y + ndcY * this._mandZoom,
        )
        this.uniforms.uC.value.copy(this._c)
        this._updateCDisplay()
      }

      if (!this._dragging) return

      const pixDx = e.clientX - this._dragStart.x
      const pixDy = e.clientY - this._dragStart.y
      if (Math.abs(pixDx) > 4 || Math.abs(pixDy) > 4) this._hasDragged = true

      // Scale: 1 pixel = 2 * zoom / screenHeight complex units (same for both halves)
      if (this._dragSide === 'mand') {
        const sc = 2 * this._mandZoom / window.innerHeight
        this._mandCenter.x = this._dragCenter.x - pixDx * sc
        this._mandCenter.y = this._dragCenter.y + pixDy * sc
      } else {
        const sc = 2 * this._juliaZoom / window.innerHeight
        this._juliaCenter.x = this._dragCenter.x - pixDx * sc
        this._juliaCenter.y = this._dragCenter.y + pixDy * sc
      }
      this._syncUniforms()
    }

    this._onMouseup = e => {
      const wasLeft = this._dragSide === 'mand'
      if (this._dragging && !this._hasDragged && wasLeft) {
        // Pure click on Mandelbrot side → toggle pin
        this._togglePin()
      }
      this._dragging = false
    }

    window.addEventListener('wheel',     this._onWheel,     { passive: false })
    window.addEventListener('mousedown', this._onMousedown)
    window.addEventListener('mousemove', this._onMousemove)
    window.addEventListener('mouseup',   this._onMouseup)
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  _togglePin() {
    this._pinned      = !this._pinned
    this._pinBtn.title = this._pinned
      ? 'Unpin c  (live cursor)'
      : 'Pin c  (lock Julia shape)'
  }

  _syncUniforms() {
    this.uniforms.uMandCenter.value.copy(this._mandCenter)
    this.uniforms.uMandZoom.value = this._mandZoom
    this.uniforms.uJuliaCenter.value.copy(this._juliaCenter)
    this.uniforms.uJuliaZoom.value = this._juliaZoom
    this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
  }

  _resetMand() {
    this._mandCenter.set(-0.5, 0.0)
    this._mandZoom = 1.4
    this._syncUniforms()
  }

  _resetJulia() {
    this._juliaCenter.set(0.0, 0.0)
    this._juliaZoom = 1.4
    this._syncUniforms()
  }

  _updateCDisplay() {
    this._cDisplay.re = this._c.x.toFixed(4)
    this._cDisplay.im = (this._c.y >= 0 ? '+' : '') + this._c.y.toFixed(4) + 'i'
    this._reBinding?.refresh()
    this._imBinding?.refresh()
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  update(dt) {
    this._t += dt
    this.uniforms.uTime.value = this._t
  }

  onResize() {
    this._syncUniforms()
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose() {
    window.removeEventListener('wheel',     this._onWheel)
    window.removeEventListener('mousedown', this._onMousedown)
    window.removeEventListener('mousemove', this._onMousemove)
    window.removeEventListener('mouseup',   this._onMouseup)

    this._leftLabel.remove()
    this._rightLabel.remove()

    this.scene.remove(this._mesh)
    this._mesh.geometry.dispose()
    this._mesh.material.dispose()
    this.pane.dispose()

    if (this.renderer) {
      this.renderer.controls.enabled      = true
      this.renderer.controls.autoRotate   = this._savedAutoRot
      this.renderer.controls.enableRotate = this._savedEnableRot
      this.renderer.controls.enablePan    = true
      this.renderer.parallaxEnabled       = true
      this.renderer.camera.position.copy(this._savedCamPos)
      this.renderer.controls.target.copy(this._savedTarget)
      this.renderer.bloomPass.strength    = this._savedBloomStr
      this.renderer.bloomPass.threshold   = this._savedBloomThr
    }
  }
}
