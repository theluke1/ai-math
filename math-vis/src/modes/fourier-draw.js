import * as THREE from 'three'
import { Pane } from 'tweakpane'
import { animatePanel } from '../core/ui.js'

const CAM_Z = 3.2
const SAMPLE_COUNT = 256
const MAX_TERMS = 128
const CIRCLE_SEGMENTS = 96

const HARMONIC_COLOURS = [
  0x4499ff, 0x00ccff, 0x0066ff, 0x00ffee,
  0x2266dd, 0x00aaff, 0x44ddff, 0x0055cc,
  0x66bbff, 0x0099ee, 0x33ccff, 0x1144cc,
]

function signedFrequency(k, n) {
  return k <= n / 2 ? k : k - n
}

export class FourierDrawMode {
  constructor(scene, renderer, options = {}) {
    this.scene = scene
    this.renderer = renderer
    this._onSwitch = options.onSwitch ?? null
    this._drawing = false
    this._rawPath = []
    this._samples = []
    this._coeffs = []
    this._trace = []
    this._time = 0

    this._raycaster = new THREE.Raycaster()
    this._pointer = new THREE.Vector2()
    this._drawPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    this._hit = new THREE.Vector3()

    this.params = {
      terms: 64,
      speed: 0.35,
      showEpicycles: true,
    }

    this._saveCamera()
    this._buildObjects()
    this._buildUI()
    this._bindPointer()
    this._loadPreset('heart')
  }

  _saveCamera() {
    const cam = this.renderer.camera
    const ctrl = this.renderer.controls
    this._saved = {
      pos: cam.position.clone(),
      target: ctrl.target.clone(),
      autoRotate: ctrl.autoRotate,
      enableRotate: ctrl.enableRotate,
      parallax: this.renderer.parallaxEnabled,
    }
    cam.position.set(0, 0, CAM_Z)
    ctrl.target.set(0, 0, 0)
    ctrl.autoRotate = false
    ctrl.enableRotate = false
    this.renderer.parallaxEnabled = false
    cam.updateProjectionMatrix()
    ctrl.update()
  }

  _buildObjects() {
    this._group = new THREE.Group()
    this.scene.add(this._group)

    this._ghostPos = new Float32Array((SAMPLE_COUNT + 1) * 3)
    this._tracePos = new Float32Array((SAMPLE_COUNT + 1) * 3)

    const ghostGeo = new THREE.BufferGeometry()
    ghostGeo.setAttribute('position', new THREE.BufferAttribute(this._ghostPos, 3))
    ghostGeo.setDrawRange(0, 0)
    this._ghostLine = new THREE.Line(ghostGeo, new THREE.LineBasicMaterial({
      color: 0xf5f4eb,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }))

    const traceGeo = new THREE.BufferGeometry()
    const traceAttr = new THREE.BufferAttribute(this._tracePos, 3)
    traceAttr.setUsage(THREE.DynamicDrawUsage)
    traceGeo.setAttribute('position', traceAttr)
    traceGeo.setDrawRange(0, 0)
    this._traceLine = new THREE.Line(traceGeo, new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }))

    this._armsGroup = new THREE.Group()
    this._armLines = []
    this._circles = []
    for (let i = 0; i < MAX_TERMS; i++) {
      const color = HARMONIC_COLOURS[i % HARMONIC_COLOURS.length]
      const armGeo = new THREE.BufferGeometry()
      armGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const arm = new THREE.Line(armGeo, new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }))

      const pts = []
      for (let j = 0; j <= CIRCLE_SEGMENTS; j++) {
        const a = (j / CIRCLE_SEGMENTS) * Math.PI * 2
        pts.push(Math.cos(a), Math.sin(a), 0)
      }
      const circleGeo = new THREE.BufferGeometry()
      circleGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      const circle = new THREE.LineLoop(circleGeo, new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }))

      arm.visible = false
      circle.visible = false
      this._armsGroup.add(circle, arm)
      this._armLines.push(arm)
      this._circles.push(circle)
    }

    this._tipDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )

    this._group.add(this._ghostLine, this._armsGroup, this._traceLine, this._tipDot)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Fourier Draw' })
    Object.assign(this.pane.element.style, {
      position: 'fixed',
      top: '60px',
      right: '16px',
      zIndex: '100',
      width: '260px',
    })
    animatePanel(this.pane)

    const shapeFolder = this.pane.addFolder({ title: 'Shape', expanded: true })
    shapeFolder.addBinding(this.params, 'terms', {
      label: 'terms  N',
      min: 1,
      max: MAX_TERMS,
      step: 1,
    })
    const motionFolder = this.pane.addFolder({ title: 'Motion', expanded: true })
    motionFolder.addBinding(this.params, 'speed', { label: 'speed', min: 0.05, max: 1.5, step: 0.05 })
    const colorFolder = this.pane.addFolder({ title: 'Color', expanded: true })
    colorFolder.addBinding(this.params, 'showEpicycles', { label: 'epicycles' })

    const presets = this.pane.addFolder({ title: 'Presets', expanded: true })
    for (const name of ['circle', 'figure-8', 'heart', 'star']) {
      presets.addButton({ title: name }).on('click', () => this._loadPreset(name))
    }
    presets.addButton({ title: 'series mode' }).on('click', () => this._onSwitch?.())
  }

  liveEquation() {
    const { terms, speed, showEpicycles } = this.params
    return [
      `$$z(t) = \\sum_{k=-${terms}}^{${terms}} c_k e^{i k t}$$`,
      `$$\\text{terms} = ${terms},\\quad \\text{speed} = ${speed.toFixed(2)},\\quad \\text{epicycles} = ${showEpicycles ? 'on' : 'off'}$$`,
    ].join('\n')
  }

  tooltips() {
    return {
      terms: 'Number of Fourier coefficients used to reconstruct the path.',
      speed: 'How quickly the reconstructed path is replayed.',
      epicycles: 'Show or hide the rotating circles that sum to the curve.',
      circle: 'Load a circular source path.',
      figure: 'Load a figure-eight source path.',
      heart: 'Load a heart-shaped source path.',
      star: 'Load a star-shaped source path.',
      series: 'Return to the waveform series view.',
    }
  }

  applyParams(params = {}) {
    Object.assign(this.params, params)
    this.pane?.refresh()
    this._time = 0
    this._clearTrace()
    return true
  }

  _bindPointer() {
    this._canvas = this.renderer.domElement ?? this.renderer.webgl?.domElement
    this._onDown = e => {
      if (!this._canvas || e.target !== this._canvas) return
      e.preventDefault()
      this._canvas.setPointerCapture?.(e.pointerId)
      this._drawing = true
      this._rawPath = []
      this._trace = []
      this._clearTrace()
      this._setDrawingCanvas(true)
      this._addPointerPoint(e)
    }
    this._onMove = e => {
      if (this._drawing) this._addPointerPoint(e)
    }
    this._onUp = e => {
      if (!this._drawing) return
      this._drawing = false
      this._canvas?.releasePointerCapture?.(e.pointerId)
      this._setDrawingCanvas(false)
      if (this._rawPath.length >= 3) this._preparePath(this._rawPath)
    }

    this._canvas?.addEventListener('pointerdown', this._onDown)
    window.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)
  }

  _worldFromPointer(e) {
    const rect = this._canvas.getBoundingClientRect()
    this._pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    )
    this._raycaster.setFromCamera(this._pointer, this.renderer.camera)
    this._raycaster.ray.intersectPlane(this._drawPlane, this._hit)
    return this._hit.clone()
  }

  _addPointerPoint(e) {
    const p = this._worldFromPointer(e)
    const last = this._rawPath[this._rawPath.length - 1]
    if (!last || last.distanceTo(p) > 0.015) {
      this._rawPath.push(p)
      this._writeGhost(this._rawPath)
    }
  }

  _setDrawingCanvas(active) {
    this._ghostLine.material.opacity = active ? 0.92 : 0.22
    this._traceLine.visible = !active
    this._tipDot.visible = !active
    this._armsGroup.visible = !active
    if (active) {
      this._trace = []
      this._clearTrace()
    }
  }

  _loadPreset(name) {
    const pts = []
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const t = (i / SAMPLE_COUNT) * Math.PI * 2
      let x, y
      if (name === 'circle') {
        x = Math.cos(t) * 0.7
        y = Math.sin(t) * 0.7
      } else if (name === 'figure-8') {
        x = Math.sin(t) * 0.95
        y = Math.sin(t * 2) * 0.48
      } else if (name === 'star') {
        const r = 0.46 + 0.24 * Math.cos(5 * t)
        x = r * Math.cos(t)
        y = r * Math.sin(t)
      } else {
        x = 0.06 * 16 * Math.pow(Math.sin(t), 3)
        y = 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
      }
      pts.push(new THREE.Vector3(x, y, 0))
    }
    this._preparePath(pts)
  }

  _preparePath(path) {
    const samples = this._normalisePath(this._resampleEven(path, SAMPLE_COUNT))
    this._samples = samples
    this._coeffs = this._computeDft(samples)
    this._time = 0
    this._lastT = 0
    this._trace = []
    this._writeGhost(samples)
    this._clearTrace()
    this._setDrawingCanvas(false)
  }

  _resampleEven(path, count) {
    const pts = path.map(p => p.clone())
    if (pts.length < 2) return pts
    if (pts[0].distanceTo(pts[pts.length - 1]) > 0.001) pts.push(pts[0].clone())

    const distances = [0]
    let total = 0
    for (let i = 1; i < pts.length; i++) {
      total += pts[i].distanceTo(pts[i - 1])
      distances.push(total)
    }

    const out = []
    for (let i = 0; i < count; i++) {
      const target = (i / count) * total
      let j = 1
      while (j < distances.length - 1 && distances[j] < target) j++
      const a = pts[j - 1]
      const b = pts[j]
      const span = Math.max(1e-6, distances[j] - distances[j - 1])
      out.push(a.clone().lerp(b, (target - distances[j - 1]) / span))
    }
    return out
  }

  _normalisePath(path) {
    const center = new THREE.Vector3()
    for (const p of path) center.add(p)
    center.multiplyScalar(1 / path.length)

    let maxR = 0
    for (const p of path) maxR = Math.max(maxR, p.distanceTo(center))
    const scale = maxR > 0 ? 0.95 / maxR : 1
    return path.map(p => p.clone().sub(center).multiplyScalar(scale))
  }

  _computeDft(samples) {
    const N = samples.length
    const coeffs = []
    for (let k = 0; k < N; k++) {
      let re = 0
      let im = 0
      for (let n = 0; n < N; n++) {
        const phi = (-Math.PI * 2 * k * n) / N
        const x = samples[n].x
        const y = samples[n].y
        re += x * Math.cos(phi) - y * Math.sin(phi)
        im += x * Math.sin(phi) + y * Math.cos(phi)
      }
      re /= N
      im /= N
      coeffs.push({
        freq: signedFrequency(k, N),
        re,
        im,
        amp: Math.hypot(re, im),
        phase: Math.atan2(im, re),
      })
    }
    return coeffs.sort((a, b) => b.amp - a.amp)
  }

  _eval(t, updateEpicycles = false) {
    let x = 0
    let y = 0
    const terms = Math.min(this.params.terms, this._coeffs.length, MAX_TERMS)

    for (let i = 0; i < MAX_TERMS; i++) {
      const visible = this.params.showEpicycles && i < terms
      this._armLines[i].visible = visible
      this._circles[i].visible = visible
    }

    for (let i = 0; i < terms; i++) {
      const c = this._coeffs[i]
      const startX = x
      const startY = y
      const angle = Math.PI * 2 * c.freq * t + c.phase
      x += c.amp * Math.cos(angle)
      y += c.amp * Math.sin(angle)

      if (updateEpicycles) {
        const arm = this._armLines[i]
        const circle = this._circles[i]
        circle.position.set(startX, startY, 0)
        circle.scale.set(c.amp, c.amp, 1)

        const arr = arm.geometry.attributes.position.array
        arr[0] = startX; arr[1] = startY; arr[2] = 0
        arr[3] = x;      arr[4] = y;      arr[5] = 0
        arm.geometry.attributes.position.needsUpdate = true
      }
    }
    return new THREE.Vector3(x, y, 0)
  }

  _writeGhost(path) {
    const n = Math.min(path.length, SAMPLE_COUNT)
    for (let i = 0; i < n; i++) {
      const p = path[i]
      this._ghostPos[i * 3] = p.x
      this._ghostPos[i * 3 + 1] = p.y
      this._ghostPos[i * 3 + 2] = 0
    }
    if (n > 1) {
      this._ghostPos[n * 3] = path[0].x
      this._ghostPos[n * 3 + 1] = path[0].y
      this._ghostPos[n * 3 + 2] = 0
    }
    this._ghostLine.geometry.setDrawRange(0, n > 1 ? n + 1 : n)
    this._ghostLine.geometry.attributes.position.needsUpdate = true
  }

  _writeTrace() {
    const n = Math.min(this._trace.length, SAMPLE_COUNT + 1)
    for (let i = 0; i < n; i++) {
      const p = this._trace[i]
      this._tracePos[i * 3] = p.x
      this._tracePos[i * 3 + 1] = p.y
      this._tracePos[i * 3 + 2] = 0.01
    }
    this._traceLine.geometry.setDrawRange(0, n)
    this._traceLine.geometry.attributes.position.needsUpdate = true
  }

  _clearTrace() {
    this._tracePos.fill(0)
    this._traceLine.geometry.setDrawRange(0, 0)
    this._traceLine.geometry.attributes.position.needsUpdate = true
  }

  update(dt) {
    this.renderer.controls.autoRotate = false
    if (!this._coeffs.length || this._drawing) return

    this._time += dt * this.params.speed
    const t = this._time % 1
    if (t < (this._lastT ?? 0)) this._trace = []
    this._lastT = t

    const tip = this._eval(t, true)
    this._tipDot.position.copy(tip)
    this._trace.push(tip)
    if (this._trace.length > SAMPLE_COUNT + 1) this._trace.shift()
    this._writeTrace()
  }

  equationContext() {
    return {
      title: 'Fourier Draw',
      equation: 'z(t) = Σ cₙ e^{i2πfₙt}',
      equationHtml: [
        '<span class="math-var">z</span>(<span class="math-var">t</span>) = ',
        '<span class="math-sum"><span class="math-sum__top">N</span><span class="math-sum__symbol">∑</span><span class="math-sum__bottom">n = 1</span></span>',
        '<span class="math-var">c</span><sub>n</sub> e<sup>i2π<span class="math-var">f</span><sub>n</sub><span class="math-var">t</span></sup>',
      ].join(''),
      rows: [
        ['samples', `${this._samples.length || SAMPLE_COUNT}`],
        ['terms', `${Math.min(this.params.terms, this._coeffs.length || MAX_TERMS)}`],
        ['coefficients', 'c_n = (1/N) sum z_k e^(-i2πnk/N)'],
        ['state', this._drawing ? 'drawing input path' : 'epicycles replaying path'],
      ],
    }
  }

  dispose() {
    this._canvas?.removeEventListener('pointerdown', this._onDown)
    window.removeEventListener('pointermove', this._onMove)
    window.removeEventListener('pointerup', this._onUp)
    this.scene.remove(this._group)
    this._group.traverse(obj => {
      obj.geometry?.dispose?.()
      obj.material?.dispose?.()
    })
    this.pane.dispose()

    const cam = this.renderer.camera
    const ctrl = this.renderer.controls
    cam.position.copy(this._saved.pos)
    ctrl.target.copy(this._saved.target)
    ctrl.autoRotate = this._saved.autoRotate
    ctrl.enableRotate = this._saved.enableRotate
    this.renderer.parallaxEnabled = this._saved.parallax
    cam.updateProjectionMatrix()
    ctrl.update()
  }
}
