import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

const SIZE = 4.8
const HALF = SIZE / 2
const STEP = 0.6
const DEFAULT_OPACITY = {
  grid: 0.12,
  cube: 0.30,
  axis: 0.18,
}
const AXIS_COLOUR = 0x5f7898

export class SpatialVolume {
  constructor(scene) {
    this.scene = scene
    this.visible = true
    this.group = new THREE.Group()
    this.group.name = 'SpatialVolume'
    this.group.visible = true

    this._materials = []
    this._labels = []
    this._gridMaterial = null
    this._cubeMaterial = null
    this._axisMaterials = []
    this._axisLines = []
    this._build()
    this.scene.add(this.group)
  }

  _makeLineMaterial(color, opacity) {
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    })
    this._materials.push(mat)
    return mat
  }

  _build() {
    this._buildGridPlanes()
    this._buildCubeEdges()
    this._buildAxisLines()
    this._buildLabels()
  }

  _buildGridPlanes() {
    // Full 3D lattice — lines parallel to each axis at every grid intersection
    const steps = []
    for (let v = -HALF; v <= HALF + 0.001; v += STEP) {
      steps.push(Math.round(v / STEP) * STEP)
    }

    const positions = []
    for (const a of steps) {
      for (const b of steps) {
        // Lines parallel to X (at y=a, z=b)
        positions.push(-HALF, a, b,  HALF, a, b)
        // Lines parallel to Y (at x=a, z=b)
        positions.push(a, -HALF, b,  a, HALF, b)
        // Lines parallel to Z (at x=a, y=b)
        positions.push(a, b, -HALF,  a, b, HALF)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this._gridMaterial = this._makeLineMaterial(0x5f7898, DEFAULT_OPACITY.grid)
    const grid = new THREE.LineSegments(geo, this._gridMaterial)
    this.group.add(grid)
  }

  _buildCubeEdges() {
    const h = HALF
    const corners = [
      [-h, -h, -h], [ h, -h, -h], [ h,  h, -h], [-h,  h, -h],
      [-h, -h,  h], [ h, -h,  h], [ h,  h,  h], [-h,  h,  h],
    ]
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ]
    const positions = []
    edges.forEach(([a, b]) => {
      positions.push(...corners[a], ...corners[b])
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this._cubeMaterial = this._makeLineMaterial(0xcce7ff, DEFAULT_OPACITY.cube)
    const cube = new THREE.LineSegments(geo, this._cubeMaterial)
    this.group.add(cube)
  }

  _buildAxisLines() {
    const axes = [
      { pts: [-HALF, 0, 0, HALF, 0, 0] },
      { pts: [0, -HALF, 0, 0, HALF, 0] },
      { pts: [0, 0, -HALF, 0, 0, HALF] },
    ]

    axes.forEach(axis => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(axis.pts, 3))
      const mat = this._makeLineMaterial(AXIS_COLOUR, DEFAULT_OPACITY.axis)
      this._axisMaterials.push(mat)
      const line = new THREE.LineSegments(geo, mat)
      this._axisLines.push(line)
      this.group.add(line)
    })
  }

  _buildLabels() {
    const labels = [
      ['XYZ SPACE', new THREE.Vector3(-HALF, HALF + 0.2, -HALF), '#a8c9c8'],
    ]

    labels.forEach(([text, position, color]) => {
      const el = document.createElement('div')
      el.textContent = text
      Object.assign(el.style, {
        color,
        fontFamily: "'Electrolize', 'SF Mono', monospace",
        fontSize: '9px',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        opacity: '0.58',
        pointerEvents: 'none',
        textShadow: `0 0 10px ${color}88`,
        userSelect: 'none',
      })

      const label = new CSS2DObject(el)
      label.position.copy(position)
      this.group.add(label)
      this._labels.push(label)
    })
  }

  attach(scene = this.scene) {
    if (this.group.parent !== scene) scene.add(this.group)
  }

  setVisible(visible) {
    this.visible = visible
    this.group.visible = visible
  }

  setOpacity({ grid = DEFAULT_OPACITY.grid, cube = DEFAULT_OPACITY.cube, axis = DEFAULT_OPACITY.axis } = {}) {
    if (this._gridMaterial) this._gridMaterial.opacity = grid
    if (this._cubeMaterial) this._cubeMaterial.opacity = cube
    this._axisMaterials.forEach(mat => { mat.opacity = axis })
  }

  setAxisLabelsVisible(visible) {
    this._labels.forEach(label => { label.visible = visible })
  }

  setCenterAxesVisible(visible) {
    this._axisLines.forEach(line => { line.visible = visible })
  }

  setSize(size = SIZE) {
    const scale = size / SIZE
    this.group.scale.setScalar(scale)
  }

  update() {
    // The spatial frame stays fixed in world space. Camera orbit supplies motion.
  }

  dispose() {
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
    })
    this._materials.forEach(mat => mat.dispose())
    this._labels.forEach(label => {
      if (label.element.parentNode) label.element.parentNode.removeChild(label.element)
    })
    this.scene.remove(this.group)
  }
}
