/**
 * newton.js — Newton's Fractal Explorer
 *
 * Newton's method applied to f(z) = z^n − 1 in the complex plane.
 * Every pixel is an initial guess; the colour depends on which root the
 * iteration converges to and how many steps it took.
 *
 *   z_{k+1} = z_k − f(z_k)/f'(z_k)
 *           = z_k − (z_k^n − 1) / (n · z_k^(n−1))
 *
 * The n-th roots of unity are the attractors. The boundaries between their
 * basins of attraction form a fractal — zooming into any boundary point
 * reveals the same infinitely complex interlacing of basins.
 *
 * Controls: scroll to zoom, drag to pan, Tweakpane for exponent / reset.
 */

import * as THREE       from 'three'
import { Pane }         from 'tweakpane'
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
  uniform vec2  uCenter;
  uniform float uZoom;
  uniform int   uN;
  uniform float uTime;
  uniform float uColorShift;
  uniform vec2  uC;           // constant term: solves z^n = uC  (default 1+0i)

  varying vec2 vUv;

  const float PI     = 3.14159265358979;
  const float TWO_PI = 6.28318530717959;

  // ── Complex arithmetic ────────────────────────────────────────────────────
  vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
  }
  vec2 cdiv(vec2 a, vec2 b) {
    float d = dot(b, b);
    return vec2(dot(a, b), a.y*b.x - a.x*b.y) / d;
  }
  // z^n via repeated multiplication (n ≤ 16)
  vec2 cpow(vec2 z, int n) {
    vec2 r = vec2(1.0, 0.0);
    for (int i = 0; i < 16; i++) {
      if (i >= n) break;
      r = cmul(r, z);
    }
    return r;
  }

  // ── Colorblind-safe palette — no red, no pure green ──────────────────────
  vec3 rootPalette(int idx) {
    if (idx == 0) return vec3(0.08, 0.47, 1.00);   // royal blue
    if (idx == 1) return vec3(0.00, 0.82, 0.91);   // cyan
    if (idx == 2) return vec3(0.91, 0.77, 0.08);   // amber
    if (idx == 3) return vec3(0.55, 0.70, 1.00);   // lavender
    if (idx == 4) return vec3(0.00, 0.63, 0.72);   // teal
    if (idx == 5) return vec3(0.72, 0.88, 1.00);   // pale blue
    if (idx == 6) return vec3(0.95, 0.88, 0.30);   // gold
    return              vec3(0.50, 0.78, 0.95);     // sky
  }

  void main() {
    // Complex-plane coordinate for this pixel
    vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
    vec2 z  = uCenter + uv * uZoom;

    const int   MAX_ITER = 64;
    const float THRESH2  = 1e-10;  // |z^n - 1|² threshold for convergence

    int   iter       = MAX_ITER;
    float finalAngle = 0.0;
    bool  converged  = false;

    for (int i = 0; i < 64; i++) {
      // Evaluate f(z) = z^n − 1  and  f'(z) = n·z^(n−1)
      // Compute z^(n-1) once; z^n = z^(n-1) · z  (halves the work)
      vec2 znm1 = cpow(z, uN - 1);
      vec2 fz   = cmul(znm1, z) - uC;   // f(z) = z^n − c

      // Convergence check BEFORE the step
      if (dot(fz, fz) < THRESH2) {
        iter       = i;
        finalAngle = atan(z.y, z.x);
        converged  = true;
        break;
      }

      // Guard: z near origin → f'(z) → 0, Newton undefined
      if (dot(znm1, znm1) < 1e-12) break;

      z -= cdiv(fz, float(uN) * znm1);
    }

    if (!converged) {
      // Boundary / non-convergent — near-black deep navy
      gl_FragColor = vec4(0.010, 0.018, 0.050, 1.0);
      return;
    }

    // Determine which root by angle of final z
    float angle = finalAngle + uColorShift + uTime * 0.025;
    if (angle < 0.0) angle += TWO_PI * 4.0;
    int rootIdx = int(mod(angle * float(uN) / TWO_PI, float(uN)));

    // Brightness: faster convergence → brighter (creates fractal texture)
    float speed      = 1.0 - float(iter) / float(MAX_ITER);
    float brightness = sqrt(speed);

    vec3 col = rootPalette(rootIdx) * brightness;

    // Subtle shimmer along the basin boundaries
    float shimmer = 0.96 + 0.04 * sin(uTime * 0.5 + finalAngle * float(uN));
    col *= shimmer;

    // Vignette
    vec2  vd   = vUv - 0.5;
    float vign = 1.0 - dot(vd, vd) * 0.5;
    col *= vign;

    // Cap to keep bloom at bay
    col = min(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
  }
`

// ---------------------------------------------------------------------------
// NewtonMode
// ---------------------------------------------------------------------------

export class NewtonMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer
    this._t       = 0

    this._center = new THREE.Vector2(0.0, 0.0)
    this._zoom   = 1.6

    this._dragging   = false
    this._dragStart  = { x: 0, y: 0 }
    this._dragCenter = new THREE.Vector2()

    this.params = {
      n:           3,
      colorShift:  0.0,
      interactive: false,   // cursor drives c in z^n = c
    }

    this._cDisplay = { re: '1.0000', im: '0.0000' }

    this.uniforms = {
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uCenter:     { value: this._center },
      uZoom:       { value: this._zoom },
      uN:          { value: this.params.n },
      uTime:       { value: 0 },
      uColorShift: { value: 0 },
      uC:          { value: new THREE.Vector2(1, 0) },
    }

    this._buildMesh()
    this._buildUI()
    this._bindEvents()

    if (renderer) {
      this._savedPos        = renderer.camera.position.clone()
      this._savedTarget     = renderer.controls.target.clone()
      this._savedAutoRotate = renderer.controls.autoRotate
      this._savedEnableRot  = renderer.controls.enableRotate
      this._savedEnablePan  = renderer.controls.enablePan
      this._savedBloom      = renderer.bloomPass.strength
      this._savedThreshold  = renderer.bloomPass.threshold

      renderer.controls.enabled       = false
      renderer.controls.autoRotate   = false
      renderer.controls.enableRotate = false
      renderer.controls.enablePan    = false
      renderer.parallaxEnabled       = false
      renderer.camera.position.set(0, 0, 1)
      renderer.camera.lookAt(0, 0, 0)
      renderer.scene.rotation.set(0, 0, 0)

      // Bloom off — palette peaks at ~0.92 and the basin colours are saturated
      renderer.bloomPass.strength  = 0
      renderer.bloomPass.threshold = 1
    }
  }

  _buildMesh() {
    const geo = new THREE.PlaneGeometry(2, 2)
    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms:       this.uniforms,
    })
    this._mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this._mesh)
  }

  _buildUI() {
    this.pane = new Pane({ title: "Newton's Fractal" })
    Object.assign(this.pane.element.style, {
      position: 'fixed', top: '60px', right: '16px', zIndex: '100', width: '260px',
    })
    animatePanel(this.pane)

    const polyFolder = this.pane.addFolder({ title: 'Polynomial  z^n − 1', expanded: true })

    // Exponent buttons
    for (const n of [3, 4, 5, 6, 7, 8]) {
      polyFolder.addButton({ title: `n = ${n}  (${n} roots)` }).on('click', () => {
        this.params.n = n
        this.uniforms.uN.value = n
        this._reset()
      })
    }

    // Interactive cursor mode — cursor sets c in z^n = c
    const liveFolder = this.pane.addFolder({ title: 'Cursor Mode', expanded: true })
    liveFolder.addBinding(this.params, 'interactive', { label: 'cursor drives c' })
      .on('change', ({ value }) => {
        if (!value) this.uniforms.uC.value.set(1, 0)  // reset to default on off
      })
    this._reDisplay = liveFolder.addBinding(this._cDisplay, 're', { label: 'c  Re', readonly: true, interval: 100 })
    this._imDisplay = liveFolder.addBinding(this._cDisplay, 'im', { label: 'c  Im', readonly: true, interval: 100 })

    const viewFolder = this.pane.addFolder({ title: 'View', expanded: true })
    viewFolder.addButton({ title: 'Reset view' }).on('click', () => this._reset())
    viewFolder.addBinding(this.params, 'colorShift', {
      label: 'colour shift', min: 0, max: Math.PI * 2, step: 0.01,
    }).on('change', ({ value }) => { this.uniforms.uColorShift.value = value })

    const guide = this.pane.addFolder({ title: 'Guide', expanded: true })
    addGuideNotes(guide, [
      'Scroll → zoom',
      'Drag → pan',
      'Each colour = one root',
      'Dark bands = fractal boundary',
      'Zoom any boundary for detail',
    ])
  }

  _bindEvents() {
    const el = this.renderer?.webgl.domElement ?? window

    this._onWheel = e => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.12 : 0.89
      // Zoom toward cursor
      const rect  = el.getBoundingClientRect()
      const ndcX  = ((e.clientX - rect.left) / rect.width)  * 2 - 1
      const ndcY  = (1 - (e.clientY - rect.top) / rect.height) * 2 - 1
      const aspect = window.innerWidth / window.innerHeight
      const wx    = this._center.x + ndcX * aspect * this._zoom
      const wy    = this._center.y + ndcY * this._zoom
      this._zoom  = Math.max(1e-6, Math.min(3.5, this._zoom * factor))
      this._center.x = wx - ndcX * aspect * this._zoom
      this._center.y = wy - ndcY * this._zoom
      this._syncUniforms()
    }

    this._onMousedown = e => {
      if (e.button !== 0) return
      this._dragging = true
      this._dragStart.x = e.clientX
      this._dragStart.y = e.clientY
      this._dragCenter.copy(this._center)
    }

    this._onMousemove = e => {
      if (!this._dragging) return
      const aspect = window.innerWidth / window.innerHeight
      const dx = -(e.clientX - this._dragStart.x) / window.innerHeight * 2 * this._zoom
      const dy =  (e.clientY - this._dragStart.y) / window.innerHeight * 2 * this._zoom
      this._center.x = this._dragCenter.x + dx * aspect
      this._center.y = this._dragCenter.y + dy
      this._syncUniforms()
    }

    this._onMouseup = () => { this._dragging = false }

    el.addEventListener('wheel',     this._onWheel,     { passive: false })
    el.addEventListener('mousedown', this._onMousedown)
    window.addEventListener('mousemove', this._onMousemove)
    window.addEventListener('mouseup',   this._onMouseup)
  }

  _syncUniforms() {
    this.uniforms.uCenter.value.copy(this._center)
    this.uniforms.uZoom.value = this._zoom
    this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
  }

  _reset() {
    this._center.set(0, 0)
    this._zoom = 1.6
    this._syncUniforms()
  }

  update(dt) {
    this._t += dt
    this.uniforms.uTime.value = this._t

    if (this.params.interactive && this.renderer) {
      // Map cursor NDC → complex-plane coordinate in current view
      const aspect = window.innerWidth / window.innerHeight
      const mx = this.renderer._mouse.x
      const my = this.renderer._mouse.y
      const cr = this._center.x + mx * aspect * this._zoom
      const ci = this._center.y + my * this._zoom
      this.uniforms.uC.value.set(cr, ci)
      this._cDisplay.re = cr.toFixed(4)
      this._cDisplay.im = (ci >= 0 ? '+' : '') + ci.toFixed(4) + 'i'
    }
  }

  onResize() {
    this._syncUniforms()
  }

  dispose() {
    const el = this.renderer?.webgl.domElement ?? window
    el.removeEventListener('wheel',     this._onWheel)
    el.removeEventListener('mousedown', this._onMousedown)
    window.removeEventListener('mousemove', this._onMousemove)
    window.removeEventListener('mouseup',   this._onMouseup)

    this.scene.remove(this._mesh)
    this._mesh.geometry.dispose()
    this._mesh.material.dispose()
    this.pane.dispose()

    if (this.renderer) {
      this.renderer.controls.enabled      = true
      this.renderer.controls.autoRotate   = this._savedAutoRotate
      this.renderer.controls.enableRotate = this._savedEnableRot
      this.renderer.controls.enablePan    = this._savedEnablePan
      this.renderer.parallaxEnabled       = true
      this.renderer.camera.position.copy(this._savedPos)
      this.renderer.controls.target.copy(this._savedTarget)
      this.renderer.bloomPass.strength    = this._savedBloom
      this.renderer.bloomPass.threshold   = this._savedThreshold
    }
  }
}
