/**
 * mandelbrot.js — Mandelbrot & Julia Set Explorer
 *
 * The Mandelbrot set is the set of complex numbers c for which the iteration
 *   z_{n+1} = z_n² + c,   z_0 = 0
 * remains bounded. It lives in the complex plane: real axis → x, imaginary → y.
 *
 * Every point IN the set (|z| never escapes past 2) is coloured black/dark.
 * Every point OUTSIDE is coloured by how quickly it escaped — smooth colouring
 * uses a fractional escape time so colour bands are continuous, not stepped.
 *
 * Julia sets:
 *   Fix c and let z_0 = pixel position.
 *   Every c gives a different Julia set — the shape of a Julia set at c
 *   directly reflects the local structure of the Mandelbrot set at that c.
 *   Clicking "Julia Mode" toggles this, and moving the cursor in Julia mode
 *   drives uJuliaC from the mouse position, so you see the Julia set
 *   corresponding to wherever the cursor is on the Mandelbrot set.
 *
 * Rendering:
 *   Single full-screen PlaneGeometry with a ShaderMaterial.
 *   All iteration happens per-pixel in the fragment shader on the GPU.
 *   Camera is locked orthographic-style (no orbit) — pan/zoom are uniforms.
 *
 * Controls:
 *   Scroll          → zoom in/out at cursor position
 *   Left drag       → pan
 *   Tweakpane       → iterations, Julia mode, reset
 */

import * as THREE from 'three'
import { gsap }         from 'gsap'
import { Pane }         from 'tweakpane'
import { animatePanel } from '../core/ui.js'
import mandelbrotVert   from '../shaders/mandelbrot.vert'
import mandelbrotFrag   from '../shaders/mandelbrot.frag'

const CAM_Z = 1   // orthographic-style: camera far back, plane fills view

// ---------------------------------------------------------------------------
// Auto-pilot waypoints — verified mathematically interesting locations that
// demonstrate self-similarity: zooming in reveals the same structure repeating.
//
// Each waypoint zooms in to `zoom` (log-scale tween) while simultaneously
// ramping maxIter so fine boundary detail stays sharp at high magnification.
// After holding at depth, the camera zooms back out and flies to the next.
// ---------------------------------------------------------------------------
const WAYPOINTS = [
  // Seahorse Valley — spiral arms curl around mini-mandelbrots
  { cx: -0.7435,        cy:  0.1314,       zoom: 0.0028,  label: 'Seahorse Valley'   },
  // Deep into seahorse — the same spiral structure repeats smaller
  { cx: -0.7490,        cy:  0.1060,       zoom: 0.00022, label: 'Seahorse Spiral'   },
  // Elephant Valley — trunk-like tendrils, bulb copies embedded in them
  { cx: -0.7269,        cy:  0.1889,       zoom: 0.0040,  label: 'Elephant Valley'   },
  // Triple spiral — three interleaved arms, each a scaled copy of the whole
  { cx: -0.1592,        cy:  1.0317,       zoom: 0.00075, label: 'Triple Spiral'     },
  // Mini-Mandelbrot — a complete copy of the entire set, embedded in the boundary
  { cx: -1.7548776662,  cy:  0.0001430,    zoom: 0.00018, label: 'Mini-Mandelbrot'   },
  // Feather detail — fine filaments branch off the main cardioid boundary
  { cx: -0.7746,        cy:  0.1342,       zoom: 0.00015, label: 'Feather Filaments' },
]

export class MandelbrotMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer
    this.t        = 0

    // Complex plane viewport state
    this._center  = new THREE.Vector2(-0.5, 0.0)
    this._zoom    = 1.8   // complex-plane units visible (height)

    // Drag state
    this._dragging  = false
    this._dragStart = { x: 0, y: 0 }
    this._dragCenter = new THREE.Vector2()

    // Julia cursor tracking (only active in Julia mode)
    this._juliaC     = new THREE.Vector2(-0.7, 0.27)
    this._mouseWorld = new THREE.Vector2()

    this.params = {
      quality:    1.0,    // multiplier on the auto-computed iteration count
      juliaMode:  false,
      colorShift: 0.0,
    }

    this._autoPilotActive = false
    this._autoPilotTl     = null
    this._wpIndex         = 0

    // Camera override — locked straight-on, no orbit
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
    ctrl.enablePan    = false
    cam.updateProjectionMatrix()
    renderer.parallaxEnabled = false
    renderer.scene.rotation.set(0, 0, 0)   // snap out residual parallax tilt

    // Bloom threshold is 0.2 — the fractal palette peaks at 0.72 which would
    // cause the entire exterior to bloom white.  Disable it for this mode.
    this._savedBloomStrength  = renderer.bloomPass.strength
    this._savedBloomThreshold = renderer.bloomPass.threshold
    renderer.bloomPass.strength  = 0
    renderer.bloomPass.threshold = 1   // belt-and-suspenders

    this._buildMesh()
    this._buildUI()
    this._bindEvents()
  }

  // -------------------------------------------------------------------------
  // Mesh — full-screen quad
  // -------------------------------------------------------------------------

  _buildMesh() {
    const aspect = window.innerWidth / window.innerHeight
    // Plane sized to exactly fill the camera frustum at CAM_Z
    const h = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(30))
    const w = h * aspect

    this.geometry = new THREE.PlaneGeometry(w, h)
    this.uniforms  = {
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uCenter:     { value: this._center.clone() },
      uZoom:       { value: this._zoom },
      uMaxIter:    { value: 128 },
      uTime:       { value: 0 },
      uJuliaMode:  { value: false },
      uJuliaC:     { value: this._juliaC.clone() },
      uColorShift: { value: 0 },
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader:   mandelbrotVert,
      fragmentShader: mandelbrotFrag,
      uniforms:       this.uniforms,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.scene.add(this.mesh)
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  _buildUI() {
    this.pane = new Pane({ title: 'Mandelbrot / Julia' })
    Object.assign(this.pane.element.style, {
      position: 'fixed', top: '60px', right: '16px',
      zIndex: '100', width: '260px',
    })

    this.pane.addBinding(this.params, 'quality', {
      label: 'detail quality', min: 0.5, max: 3.0, step: 0.1,
    })
    // Iterations are now auto-computed each frame from zoom level × quality.
    // A read-only display shows the live value.
    this._iterDisplay = { iter: 128 }
    this.pane.addBinding(this._iterDisplay, 'iter', {
      label: 'iterations (auto)', readonly: true,
      format: v => String(Math.round(v)),
    })

    this.pane.addBinding(this.params, 'juliaMode', {
      label: 'julia mode',
    }).on('change', ({ value }) => {
      this.uniforms.uJuliaMode.value = value
    })

    this.pane.addBinding(this.params, 'colorShift', {
      label: 'colour shift', min: 0, max: 1, step: 0.01,
    }).on('change', ({ value }) => { this.uniforms.uColorShift.value = value })

    this.pane.addButton({ title: 'Reset view' }).on('click', () => {
      this._stopAutoPilot()
      this._resetView()
    })

    this._autoPilotBtn = this.pane.addButton({ title: '▶  Auto-pilot  (self-similarity tour)' })
      .on('click', () => {
        if (this._autoPilotActive) {
          this._stopAutoPilot()
          this._autoPilotBtn.title = '▶  Auto-pilot  (self-similarity tour)'
        } else {
          this._startAutoPilot()
          this._autoPilotBtn.title = '⏹  Stop auto-pilot'
        }
      })

    const infoFolder = this.pane.addFolder({ title: 'About', expanded: false })
    infoFolder.addBinding(
      { text: 'z → z² + c' }, 'text',
      { label: 'iteration', readonly: true }
    )

    animatePanel(this.pane)
  }

  // -------------------------------------------------------------------------
  // Auto-pilot — self-similarity tour through famous Mandelbrot locations
  //
  // Each step uses a logarithmic zoom (tweening Math.log(zoom)) so the zoom
  // feels evenly paced to the eye regardless of depth.  maxIter ramps up
  // alongside so fine filaments stay sharp at high magnification.
  // -------------------------------------------------------------------------

  _startAutoPilot() {
    this._autoPilotActive = true
    this._wpIndex         = 0
    this._runWaypoint()
  }

  _stopAutoPilot() {
    this._autoPilotActive = false
    if (this._autoPilotTl) { this._autoPilotTl.kill(); this._autoPilotTl = null }
    // Iteration count is auto-computed from zoom — no manual restore needed.
  }

  _runWaypoint() {
    if (!this._autoPilotActive) return
    const wp  = WAYPOINTS[this._wpIndex % WAYPOINTS.length]
    this._wpIndex++

    // Proxy for logarithmic zoom tween — gives the exponential "falling in"
    // sensation that fractal zoom videos use.
    const logProxy = { v: Math.log(this._zoom) }

    const tl = gsap.timeline({ onComplete: () => this._runWaypoint() })

    // 1. Zoom back out to default view
    tl.to(this,         { _zoom: 1.8, duration: 1.8, ease: 'power2.inOut',
                          onUpdate: () => this._syncUniforms() }, 0)
    tl.to(this._center, { x: -0.5, y: 0, duration: 1.8, ease: 'power2.inOut',
                          onUpdate: () => this._syncUniforms() }, 0)

    // 2. Fly to waypoint centre
    tl.to(this._center, { x: wp.cx, y: wp.cy, duration: 2.2, ease: 'power2.inOut',
                          onUpdate: () => this._syncUniforms() }, 1.8)

    // 3. Zoom in — _syncUniforms() auto-computes iterations from the new zoom value
    tl.add(() => { logProxy.v = Math.log(this._zoom) }, 2.0)
    tl.to(logProxy,     { v: Math.log(wp.zoom), duration: 9, ease: 'power2.inOut',
                          onUpdate: () => { this._zoom = Math.exp(logProxy.v); this._syncUniforms() } }, 2.8)

    // 4. Hold at full depth
    tl.to({}, { duration: 3.5 })

    this._autoPilotTl = tl
  }

  // -------------------------------------------------------------------------
  // Events — scroll to zoom, drag to pan
  // -------------------------------------------------------------------------

  _bindEvents() {
    this._onWheel = e => {
      e.preventDefault()
      // Manual interaction cancels auto-pilot
      if (this._autoPilotActive) {
        this._stopAutoPilot()
        this._autoPilotBtn.title = '▶  Auto-pilot  (self-similarity tour)'
      }
      const factor = e.deltaY > 0 ? 1.15 : 0.87

      // Zoom toward cursor: shift centre so cursor stays fixed
      const mx = (e.clientX / window.innerWidth  - 0.5) * 2
      const my = (e.clientY / window.innerHeight - 0.5) * (-2)
      const aspect = window.innerWidth / window.innerHeight
      const hw = this._zoom * aspect * 0.5
      const hh = this._zoom * 0.5
      const worldX = this._center.x + mx * hw
      const worldY = this._center.y + my * hh

      const newZoom = this._zoom * factor

      // Clamp: max zoom-out shows the full Mandelbrot set with border.
      // Min zoom is limited by float32 precision (~7 significant digits).
      const ZOOM_MAX = 4.0
      const ZOOM_MIN = 5e-7
      this._zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))

      this._center.x = worldX - mx * this._zoom * aspect * 0.5
      this._center.y = worldY - my * this._zoom * 0.5
      this._syncUniforms()
    }

    this._onMouseDown = e => {
      if (e.button !== 0) return
      if (this._autoPilotActive) {
        this._stopAutoPilot()
        this._autoPilotBtn.title = '▶  Auto-pilot  (self-similarity tour)'
      }
      this._dragging   = true
      this._dragStart  = { x: e.clientX, y: e.clientY }
      this._dragCenter.copy(this._center)
    }

    this._onMouseMove = e => {
      // Track world position for Julia C parameter
      const mx = (e.clientX / window.innerWidth  - 0.5) * 2
      const my = (e.clientY / window.innerHeight - 0.5) * (-2)
      const aspect = window.innerWidth / window.innerHeight
      this._mouseWorld.set(
        this._center.x + mx * this._zoom * aspect * 0.5,
        this._center.y + my * this._zoom * 0.5,
      )
      if (this.params.juliaMode) {
        this._juliaC.copy(this._mouseWorld)
        this.uniforms.uJuliaC.value.copy(this._juliaC)
      }

      if (!this._dragging) return
      const dx = (e.clientX - this._dragStart.x) / window.innerHeight
      const dy = (e.clientY - this._dragStart.y) / window.innerHeight
      this._center.x = this._dragCenter.x - dx * this._zoom
      this._center.y = this._dragCenter.y + dy * this._zoom
      this._syncUniforms()
    }

    this._onMouseUp = () => { this._dragging = false }

    window.addEventListener('wheel',     this._onWheel,     { passive: false })
    window.addEventListener('mousedown', this._onMouseDown)
    window.addEventListener('mousemove', this._onMouseMove)
    window.addEventListener('mouseup',   this._onMouseUp)
  }

  _syncUniforms() {
    this.uniforms.uCenter.value.copy(this._center)
    this.uniforms.uZoom.value = this._zoom

    // Auto-compute iteration count from zoom depth.
    // Formula: quality × (80 × ln(defaultZoom / zoom) + 128), clamped [128, 1024].
    // At zoom=1.8 (full set) this gives 128. Every 10× zoom adds ~184 iterations.
    // This ensures detail stays sharp as the user zooms in without manual tuning.
    const depthFactor = Math.log(1.8 / Math.max(this._zoom, 1e-7))
    const autoIter    = Math.max(128, Math.min(1024,
      Math.round(this.params.quality * (80 * depthFactor + 128))
    ))
    this.uniforms.uMaxIter.value = autoIter
    if (this._iterDisplay) this._iterDisplay.iter = autoIter
  }

  _resetView() {
    gsap.to(this, {
      _zoom: 1.8,
      duration: 0.8,
      ease: 'power3.inOut',
      onUpdate: () => this._syncUniforms(),
    })
    gsap.to(this._center, {
      x: -0.5, y: 0,
      duration: 0.8,
      ease: 'power3.inOut',
      onUpdate: () => this._syncUniforms(),
    })
  }

  // -------------------------------------------------------------------------
  // Update / resize / dispose
  // -------------------------------------------------------------------------

  update(dt) {
    this.t += dt
    this.uniforms.uTime.value = this.t
    this.renderer.controls.autoRotate = false
    // Keep auto-iteration display live even when zoom isn't changing
    this._syncUniforms()
  }

  onResize() {
    const aspect = window.innerWidth / window.innerHeight
    const h = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(30))
    const w = h * aspect
    this.geometry.dispose()
    this.geometry = new THREE.PlaneGeometry(w, h)
    this.mesh.geometry = this.geometry
    this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
  }

  dispose() {
    this._stopAutoPilot()
    window.removeEventListener('wheel',     this._onWheel)
    window.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mousemove', this._onMouseMove)
    window.removeEventListener('mouseup',   this._onMouseUp)

    const cam  = this.renderer.camera
    const ctrl = this.renderer.controls
    cam.position.copy(this._savedCamPos)
    ctrl.target.copy(this._savedTarget)
    ctrl.autoRotate   = this._savedAutoRot
    ctrl.enableRotate = this._savedEnableRot
    ctrl.enablePan    = true
    cam.updateProjectionMatrix()
    this.renderer.parallaxEnabled        = true
    this.renderer.bloomPass.strength     = this._savedBloomStrength
    this.renderer.bloomPass.threshold    = this._savedBloomThreshold

    this.scene.remove(this.mesh)
    this.geometry.dispose()
    this.material.dispose()
    this.pane.dispose()
  }
}
