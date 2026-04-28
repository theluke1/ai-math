/**
 * grayscott.js — Gray-Scott Reaction-Diffusion System
 *
 * Two chemicals U and V diffuse and react on a discrete grid:
 *
 *   ∂u/∂t = Du·∇²u  −  u·v²  +  f·(1−u)
 *   ∂v/∂t = Dv·∇²v  +  u·v²  −  (f+k)·v
 *
 *   Du, Dv  — diffusion rates (U spreads faster than V)
 *   f       — feed rate (how fast U is replenished)
 *   k       — kill rate (how fast V is removed)
 *
 * Different (f, k) pairs produce qualitatively different pattern types:
 *   spots, stripes, mazes, worms, spirals, coral.
 *
 * Implementation:
 *   Ping-pong render targets — one WebGLRenderTarget holds the current state,
 *   the simulation shader reads it and writes the next state into a second
 *   target, then they swap. STEPS_PER_FRAME sub-steps run per animation frame
 *   so the patterns develop quickly without numerical instability.
 *
 *   Cursor interaction: holding the mouse over the canvas injects V
 *   concentration, seeding new patterns from scratch.
 */

import * as THREE from 'three'
import { Pane }          from 'tweakpane'
import { animatePanel, addGuideNotes }  from '../core/ui.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIM_W          = 512
const SIM_H          = 512
const STEPS_PER_FRAME = 12   // simulation sub-steps per rendered frame
const DU             = 0.2097
const DV             = 0.1050

const PRESETS = {
  'Spots':       { f: 0.0350, k: 0.0650 },
  'Worms':       { f: 0.0580, k: 0.0650 },
  'Maze':        { f: 0.0290, k: 0.0570 },
  'Mitosis':     { f: 0.0367, k: 0.0649 },
  'Coral':       { f: 0.0545, k: 0.0620 },
  'Fingerprint': { f: 0.0370, k: 0.0600 },
  'Chaos':       { f: 0.0260, k: 0.0510 },
}

// ---------------------------------------------------------------------------
// Simulation shader — one Euler step of the Gray-Scott PDE
// Reads from tState (R=u, G=v), writes next state as (R=u, G=v)
// ---------------------------------------------------------------------------

const SIM_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const SIM_FRAG = /* glsl */`
  precision highp float;

  uniform sampler2D tState;
  uniform vec2  uTexelSize;   // 1/SIM_W, 1/SIM_H
  uniform float uF;
  uniform float uK;
  uniform vec2  uCursor;      // UV of cursor (0-1)
  uniform float uPainting;    // 1 = mouse held, 0 = not

  varying vec2 vUv;

  void main() {
    float dx = uTexelSize.x;
    float dy = uTexelSize.y;

    // 9-point weighted Laplacian stencil (standard for Gray-Scott)
    vec2 c  = texture2D(tState, vUv).rg;
    vec2 n  = texture2D(tState, vUv + vec2( 0,  dy)).rg;
    vec2 s  = texture2D(tState, vUv + vec2( 0, -dy)).rg;
    vec2 e  = texture2D(tState, vUv + vec2( dx,  0)).rg;
    vec2 w  = texture2D(tState, vUv + vec2(-dx,  0)).rg;
    vec2 ne = texture2D(tState, vUv + vec2( dx,  dy)).rg;
    vec2 nw = texture2D(tState, vUv + vec2(-dx,  dy)).rg;
    vec2 se = texture2D(tState, vUv + vec2( dx, -dy)).rg;
    vec2 sw = texture2D(tState, vUv + vec2(-dx, -dy)).rg;

    vec2 lapl = -c
      + 0.20 * (n + s + e + w)
      + 0.05 * (ne + nw + se + sw);

    float u   = c.r;
    float v   = c.g;
    float uvv = u * v * v;

    float nextU = clamp(u + ${DU} * lapl.r - uvv + uF * (1.0 - u), 0.0, 1.0);
    float nextV = clamp(v + ${DV} * lapl.g + uvv - (uF + uK) * v,  0.0, 1.0);

    // Cursor painting — inject V near cursor position
    if (uPainting > 0.5) {
      float d = length(vUv - uCursor);
      if (d < 0.045) {
        float strength = (1.0 - d / 0.045) * 0.85;
        nextV = clamp(nextV + strength, 0.0, 1.0);
        nextU = clamp(nextU - strength * 0.5, 0.0, 1.0);
      }
    }

    gl_FragColor = vec4(nextU, nextV, 0.0, 1.0);
  }
`

// ---------------------------------------------------------------------------
// Display shader — maps (u,v) concentration to colour
// ---------------------------------------------------------------------------

const DISP_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const DISP_FRAG = /* glsl */`
  precision highp float;

  uniform sampler2D tState;
  uniform float uTime;

  varying vec2 vUv;

  void main() {
    vec2 state = texture2D(tState, vUv).rg;
    float v    = state.g;   // V = the "activator" that forms the visible pattern

    // Palette: navy → teal → amber (colorblind-safe)
    vec3 navy  = vec3(0.016, 0.047, 0.125);
    vec3 teal  = vec3(0.000, 0.627, 0.722);
    vec3 amber = vec3(0.910, 0.770, 0.080);

    vec3 col;
    if (v < 0.35) {
      col = mix(navy,  teal,  v / 0.35);
    } else {
      col = mix(teal,  amber, (v - 0.35) / 0.65);
    }

    // Very subtle time pulse so the pattern shimmers slightly
    col *= 0.94 + 0.06 * sin(uTime * 1.2 + v * 8.0);

    // Vignette
    vec2  vd   = vUv - 0.5;
    float vign = 1.0 - dot(vd, vd) * 0.35;
    col *= vign;

    gl_FragColor = vec4(col, 1.0);
  }
`

// ---------------------------------------------------------------------------
// Init shader — procedurally seeds the starting state
// ---------------------------------------------------------------------------

const INIT_FRAG = /* glsl */`
  precision highp float;

  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float u = 1.0;
    float v = 0.0;

    // Sparse seeding: 5×5 grid → 25 cells, ~20% get a seed → ~5 seeds total.
    // Spots and Mitosis need isolated blobs that can develop independently.
    // Too many overlapping seeds create a dense V field that the kill term
    // overwhelms, collapsing everything to v=0 within a few seconds.
    vec2 cell    = floor(vUv * 5.0);
    float r      = hash(cell + uSeed * 0.371);
    if (r > 0.80) {
      vec2 localUv = fract(vUv * 5.0);
      float d      = length(localUv - 0.5);
      if (d < 0.32) {
        // Strong V injection (0.5 peak) so the seed survives the initial transient
        v = 0.5 * (1.0 - d / 0.32);
        u = 1.0 - v;
      }
    }

    gl_FragColor = vec4(u, v, 0.0, 1.0);
  }
`

// ---------------------------------------------------------------------------
// GrayScottMode
// ---------------------------------------------------------------------------

export class GrayScottMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer
    this._t       = 0
    this._painting = false

    this.params = { ...PRESETS['Spots'] }

    this._buildRenderTargets()
    this._buildSimScene()
    this._buildDisplayMesh()
    this._initState()
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

      renderer.bloomPass.strength  = 0
      renderer.bloomPass.threshold = 1
    }
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  _buildRenderTargets() {
    const opts = {
      minFilter:     THREE.NearestFilter,
      magFilter:     THREE.NearestFilter,
      format:        THREE.RGBAFormat,
      type:          THREE.FloatType,
      depthBuffer:   false,
      stencilBuffer: false,
    }
    this._pingRT = new THREE.WebGLRenderTarget(SIM_W, SIM_H, opts)
    this._pongRT = new THREE.WebGLRenderTarget(SIM_W, SIM_H, opts)
  }

  _buildSimScene() {
    // Orthographic simulation scene — a quad that covers exactly [-1,1]
    this._simCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this._simScene = new THREE.Scene()

    this._simUniforms = {
      tState:     { value: null },
      uTexelSize: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uF:         { value: this.params.f },
      uK:         { value: this.params.k },
      uCursor:    { value: new THREE.Vector2(0.5, 0.5) },
      uPainting:  { value: 0.0 },
    }

    const simMat = new THREE.ShaderMaterial({
      vertexShader:   SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms:       this._simUniforms,
    })

    const simMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat)
    this._simScene.add(simMesh)
  }

  _buildDisplayMesh() {
    this._dispUniforms = {
      tState: { value: null },
      uTime:  { value: 0 },
    }
    const dispMat = new THREE.ShaderMaterial({
      vertexShader:   DISP_VERT,
      fragmentShader: DISP_FRAG,
      uniforms:       this._dispUniforms,
    })
    this._displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dispMat)
    this.scene.add(this._displayMesh)
  }

  _initState(seed = Math.random()) {
    // Render procedural initial conditions into pingRT
    const initUniforms = {
      uSeed: { value: seed },
    }
    const initMat  = new THREE.ShaderMaterial({
      vertexShader:   SIM_VERT,
      fragmentShader: INIT_FRAG,
      uniforms:       initUniforms,
    })
    const initMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), initMat)
    this._simScene.add(initMesh)

    const gl = this.renderer.webgl
    gl.setRenderTarget(this._pingRT)
    gl.render(this._simScene, this._simCam)
    gl.setRenderTarget(null)

    this._simScene.remove(initMesh)
    initMat.dispose()
  }

  // ---------------------------------------------------------------------------
  // Events — mouse held paints V concentration
  // ---------------------------------------------------------------------------

  _bindEvents() {
    this._onMousedown = e => { if (e.button === 0) this._painting = true  }
    this._onMouseup   = ()  => { this._painting = false }
    window.addEventListener('mousedown', this._onMousedown)
    window.addEventListener('mouseup',   this._onMouseup)
  }

  // ---------------------------------------------------------------------------
  // Per-frame update — run simulation steps, then update display
  // ---------------------------------------------------------------------------

  update(dt) {
    this._t += dt
    const gl          = this.renderer.webgl
    const savedClear  = gl.autoClear
    gl.autoClear = false

    // Update cursor UV from renderer's mouse tracker
    const mx = this.renderer._cursor.x
    const my = this.renderer._cursor.y
    this._simUniforms.uCursor.value.set(mx, my)
    this._simUniforms.uPainting.value = this._painting ? 1.0 : 0.0
    this._simUniforms.uF.value = this.params.f
    this._simUniforms.uK.value = this.params.k

    // Ping-pong simulation steps
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      this._simUniforms.tState.value = this._pingRT.texture
      gl.setRenderTarget(this._pongRT)
      gl.render(this._simScene, this._simCam)
      // Swap
      const tmp    = this._pingRT
      this._pingRT = this._pongRT
      this._pongRT = tmp
    }

    gl.setRenderTarget(null)
    gl.autoClear = savedClear

    // Feed current state to the display quad
    this._dispUniforms.tState.value = this._pingRT.texture
    this._dispUniforms.uTime.value  = this._t
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  _buildUI() {
    this.pane = new Pane({ title: 'Gray-Scott  (Reaction-Diffusion)' })
    Object.assign(this.pane.element.style, {
      position: 'fixed', top: '60px', right: '16px', zIndex: '100', width: '280px',
    })
    animatePanel(this.pane)

    const presetFolder = this.pane.addFolder({ title: 'Presets', expanded: true })
    for (const [label, vals] of Object.entries(PRESETS)) {
      presetFolder.addButton({ title: label }).on('click', () => {
        Object.assign(this.params, vals)
        // Must reinitialise — changing f/k mid-run often collapses the
        // existing pattern (V dies out) rather than transitioning to the
        // new morphology. A fresh seed lets the new parameters develop cleanly.
        this._initState(Math.random())
        this.pane.refresh()
      })
    }

    const paramFolder = this.pane.addFolder({ title: 'Parameters', expanded: true })
    paramFolder.addBinding(this.params, 'f', { label: 'feed rate  f', min: 0.01, max: 0.09, step: 0.0001 })
    paramFolder.addBinding(this.params, 'k', { label: 'kill rate  k', min: 0.04, max: 0.08, step: 0.0001 })

    const ctrlFolder = this.pane.addFolder({ title: 'Controls', expanded: true })
    ctrlFolder.addButton({ title: 'Reset / new seed' }).on('click', () => {
      this._initState(Math.random())
    })

    const guide = this.pane.addFolder({ title: 'Guide', expanded: true })
    addGuideNotes(guide, [
      'Hold mouse → paint V (seeds patterns)',
      'Change f/k → different morphologies',
      'f↑ k↓ → spots   f↑ k↑ → worms',
      'f↓ k↓ → maze    f↓ k↑ → chaos',
    ])
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  onResize() {}

  dispose() {
    window.removeEventListener('mousedown', this._onMousedown)
    window.removeEventListener('mouseup',   this._onMouseup)

    this.scene.remove(this._displayMesh)
    this._displayMesh.geometry.dispose()
    this._displayMesh.material.dispose()
    this._pingRT.dispose()
    this._pongRT.dispose()
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
