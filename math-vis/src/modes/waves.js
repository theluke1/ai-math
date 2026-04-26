/**
 * waves.js — 2D wave interference mode
 *
 * Renders a flat quad whose colour is computed per-pixel in the fragment
 * shader. Wave superposition is: u(x,y,t) = Σ A · sin(k·r − ωt) · e^(-d·r)
 * The signed amplitude drives a water-depth colour palette (dark navy troughs,
 * bright white-cyan crests).
 *
 * Source placement:
 *   Left-click  → raycast onto the z=0 plane → place / drag source
 *   Right-click → remove nearest source
 *   Sources are shown as small glowing yellow markers (colorblind safe)
 *
 * Coordinate system:
 *   The flat PlaneGeometry(2,2) spans [-1,+1] in both axes.
 *   The fragment shader maps UV → world space via uAspect, so source
 *   positions in world coords map directly to shader coords.
 */

import * as THREE from 'three'
import { Pane }   from 'tweakpane'
import { Axes }   from '../core/axes.js'
import waveVert   from '../shaders/wave.vert'
import waveFrag   from '../shaders/wave.frag'

const MAX_SOURCES  = 5
const GRAB_RADIUS  = 0.12   // world-space click radius to grab an existing source

// Default: two sources in classic double-slit arrangement
const DEFAULT_SOURCES = () => [
  new THREE.Vector2(-0.5, 0.0),
  new THREE.Vector2( 0.5, 0.0),
]

export class WavesMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer

    this.sources  = DEFAULT_SOURCES()
    this._dragging    = null
    this._dragOffset  = new THREE.Vector2()

    // Raycaster + invisible z=0 plane for click-to-place
    this._raycaster   = new THREE.Raycaster()
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    this._rayTarget   = new THREE.Vector3()

    this.params = {
      frequency: 5.0,
      speed:     1.2,
      damping:   0.35,
      amplitude: 1.0,
    }

    this._buildMesh()
    this._buildMarkers()
    this._buildAxes()
    this._buildUI()
    this._bindEvents()
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  _buildMesh() {
    // Flat single-quad plane — fragment shader does all computation per-pixel
    const geo = new THREE.PlaneGeometry(2, 2)

    const aspect = window.innerWidth / window.innerHeight

    // Pad sources array to MAX_SOURCES for GLSL fixed-size uniform
    const srcUniforms = Array.from({ length: MAX_SOURCES }, (_, i) =>
      this.sources[i] ? this.sources[i].clone() : new THREE.Vector2(0, 0)
    )

    this.uniforms = {
      uTime:       { value: 0 },
      uFrequency:  { value: this.params.frequency },
      uSpeed:      { value: this.params.speed },
      uDamping:    { value: this.params.damping },
      uAmplitude:  { value: this.params.amplitude },
      uNumSources: { value: this.sources.length },
      uSources:    { value: srcUniforms },
      uAspect:     { value: aspect },
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader:   waveVert,
      fragmentShader: waveFrag,
      uniforms:       this.uniforms,
      side:           THREE.DoubleSide,
    })

    this.mesh = new THREE.Mesh(geo, mat)
    this.scene.add(this.mesh)
  }

  _buildMarkers() {
    // Small glowing spheres at each source position — yellow, colorblind safe
    this._markerGroup = new THREE.Group()
    this._markers     = []

    const sphereGeo = new THREE.SphereGeometry(0.025, 16, 16)
    const sphereMat = new THREE.MeshBasicMaterial({
      color:       0xffdd00,   // yellow — contrasts with blue/cyan wave
      transparent: true,
      opacity:     0.85,
    })

    // Vertical line (spike) — shows source location even when surface is displaced
    const lineMat = new THREE.LineBasicMaterial({
      color:       0xffdd00,
      transparent: true,
      opacity:     0.5,
    })

    for (let i = 0; i < MAX_SOURCES; i++) {
      const sphere = new THREE.Mesh(sphereGeo, sphereMat)
      const lineGeo = new THREE.BufferGeometry()
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(
        [0, 0, -0.1,  0, 0, 0.6], 3
      ))
      const line = new THREE.Line(lineGeo, lineMat)

      const marker = new THREE.Group()
      marker.add(sphere)
      marker.add(line)
      marker.visible = false

      this._markerGroup.add(marker)
      this._markers.push(marker)
    }

    this.scene.add(this._markerGroup)
    this._syncMarkers()
  }

  _buildAxes() {
    this.axes = new Axes(this.scene)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Wave Interference' })
    Object.assign(this.pane.element.style, {
      position: 'fixed', top: '16px', right: '16px',
      zIndex: '100', width: '260px',
    })

    this.pane.addBinding(this.params, 'frequency', {
      label: 'frequency  k', min: 1.0, max: 20.0, step: 0.1,
    }).on('change', ({ value }) => { this.uniforms.uFrequency.value = value })

    this.pane.addBinding(this.params, 'speed', {
      label: 'wave speed  v', min: 0.1, max: 5.0, step: 0.05,
    }).on('change', ({ value }) => { this.uniforms.uSpeed.value = value })

    this.pane.addBinding(this.params, 'damping', {
      label: 'damping', min: 0.0, max: 2.0, step: 0.01,
    }).on('change', ({ value }) => { this.uniforms.uDamping.value = value })

    this.pane.addBinding(this.params, 'amplitude', {
      label: 'amplitude  A', min: 0.1, max: 2.0, step: 0.05,
    }).on('change', ({ value }) => { this.uniforms.uAmplitude.value = value })

    // Presets
    const pre = this.pane.addFolder({ title: 'Presets', expanded: true })

    pre.addButton({ title: 'Single source' }).on('click', () => {
      this.sources = [new THREE.Vector2(0, 0)]
      this._syncSources(); this._syncMarkers()
    })
    pre.addButton({ title: 'Double slit' }).on('click', () => {
      this.sources = [new THREE.Vector2(-0.45, 0), new THREE.Vector2(0.45, 0)]
      this._syncSources(); this._syncMarkers()
    })
    pre.addButton({ title: 'Triangle' }).on('click', () => {
      this.sources = [
        new THREE.Vector2( 0.0,  0.5),
        new THREE.Vector2(-0.5, -0.4),
        new THREE.Vector2( 0.5, -0.4),
      ]
      this._syncSources(); this._syncMarkers()
    })
    pre.addButton({ title: '4-source grid' }).on('click', () => {
      this.sources = [
        new THREE.Vector2(-0.45,  0.45),
        new THREE.Vector2( 0.45,  0.45),
        new THREE.Vector2(-0.45, -0.45),
        new THREE.Vector2( 0.45, -0.45),
      ]
      this._syncSources(); this._syncMarkers()
    })
  }

  // ---------------------------------------------------------------------------
  // Interaction — raycast onto z=0 plane for source placement
  // ---------------------------------------------------------------------------

  _bindEvents() {
    const canvas = this.renderer.domElement
    this._onDown    = e => this._mouseDown(e)
    this._onMove    = e => this._mouseMove(e)
    this._onUp      = ()  => { this._dragging = null }
    this._onContext = e => { e.preventDefault(); this._rightClick(e) }

    canvas.addEventListener('mousedown',   this._onDown)
    canvas.addEventListener('mousemove',   this._onMove)
    canvas.addEventListener('mouseup',     this._onUp)
    canvas.addEventListener('contextmenu', this._onContext)
  }

  /** Convert mouse event → world XY position on the z=0 plane */
  _raycastGround(e) {
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth)  *  2 - 1,
      (e.clientY / window.innerHeight) * -2 + 1
    )
    this._raycaster.setFromCamera(mouse, this.renderer.camera)
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._rayTarget)
    return hit ? new THREE.Vector2(this._rayTarget.x, this._rayTarget.y) : null
  }

  _nearestSource(wp) {
    let best = -1, minD = GRAB_RADIUS
    this.sources.forEach((s, i) => {
      const d = wp.distanceTo(s)
      if (d < minD) { minD = d; best = i }
    })
    return best
  }

  _mouseDown(e) {
    if (e.button !== 0) return
    const wp  = this._raycastGround(e)
    if (!wp) return
    const hit = this._nearestSource(wp)
    if (hit >= 0) {
      this._dragging = hit
      this._dragOffset.copy(wp).sub(this.sources[hit])
    } else if (this.sources.length < MAX_SOURCES) {
      this.sources.push(wp.clone())
      this._dragging = this.sources.length - 1
      this._dragOffset.set(0, 0)
      this._syncSources()
      this._syncMarkers()
    }
  }

  _mouseMove(e) {
    if (this._dragging === null) return
    const wp = this._raycastGround(e)
    if (!wp) return
    this.sources[this._dragging].copy(wp).sub(this._dragOffset)
    this._syncSources()
    this._syncMarkers()
  }

  _rightClick(e) {
    const wp  = this._raycastGround(e)
    if (!wp) return
    const hit = this._nearestSource(wp)
    if (hit >= 0 && this.sources.length > 1) {
      this.sources.splice(hit, 1)
      this._syncSources()
      this._syncMarkers()
    }
  }

  // ---------------------------------------------------------------------------
  // Sync helpers
  // ---------------------------------------------------------------------------

  _syncSources() {
    this.uniforms.uNumSources.value = this.sources.length
    for (let i = 0; i < MAX_SOURCES; i++) {
      this.uniforms.uSources.value[i] = this.sources[i]
        ? this.sources[i].clone()
        : new THREE.Vector2(0, 0)
    }
  }

  _syncMarkers() {
    this._markers.forEach((m, i) => {
      if (i < this.sources.length) {
        m.position.set(this.sources[i].x, this.sources[i].y, 0)
        m.visible = true
      } else {
        m.visible = false
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Per-frame + resize + dispose
  // ---------------------------------------------------------------------------

  update(dt) {
    this.uniforms.uTime.value += dt
  }

  onResize() {
    // Flat plane stays the same — just update aspect so shader coordinates match
    this.uniforms.uAspect.value = window.innerWidth / window.innerHeight
  }

  dispose() {
    const canvas = this.renderer.domElement
    canvas.removeEventListener('mousedown',   this._onDown)
    canvas.removeEventListener('mousemove',   this._onMove)
    canvas.removeEventListener('mouseup',     this._onUp)
    canvas.removeEventListener('contextmenu', this._onContext)

    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.scene.remove(this._markerGroup)
    this.axes.dispose()
    this.pane.dispose()
  }
}
