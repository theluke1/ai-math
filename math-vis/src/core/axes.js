/**
 * axes.js
 *
 * 3D coordinate axes with HTML labels (CSS2DObjects) and a faint reference grid.
 *
 * Accepts an optional `renderer` parameter. When provided, CSS2DObjects are
 * attached so axis names (X / Y / Z) and tick values float at the correct
 * 3D positions in world space — rendered by the CSS2DRenderer layer above the
 * WebGL canvas. Without a renderer, falls back to geometry-only (no labels).
 *
 * Grid:
 *   A very faint 5×5 grid on the XY plane gives spatial context without
 *   competing with the main content. Opacity is low so it reads as a
 *   suggestion of space rather than a foreground element.
 *
 * Colour choices (red-green colorblind safe):
 *   X axis → electric blue  (#4488ff)
 *   Y axis → cyan           (#00ddff)
 *   Z axis → pale white     (#aaccff)
 */

import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

const EXTENT     = 2.5   // long enough to contain Lorenz z-axis (~1.9 world units)
const TICK_STEP  = 0.25
const TICK_SIZE  = 0.022
const ARROW_SIZE = 0.05   // smaller arrowheads at both axis ends
const OPACITY    = 0.45

const COLOURS = {
  x: { three: new THREE.Color(0x4488ff), css: '#4488ff' },
  y: { three: new THREE.Color(0x00ddff), css: '#00ddff' },
  z: { three: new THREE.Color(0xaaccff), css: '#aaccff' },
}

export class Axes {
  /**
   * @param {THREE.Scene} scene
   * @param {Renderer|null} renderer  pass the app renderer to enable CSS2D labels
   */
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer
    this._objects = []   // THREE objects (lines)
    this._labels  = []   // CSS2DObjects
    this._build()
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  _build() {
    this._buildAxis('x', new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    this._buildAxis('y', new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    this._buildAxis('z', new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
    this._buildGrid()
  }

  _buildAxis(name, dir, perp) {
    const col      = COLOURS[name]
    const positions = []

    // Main line
    positions.push(...dir.clone().multiplyScalar(-EXTENT).toArray())
    positions.push(...dir.clone().multiplyScalar( EXTENT).toArray())

    // Arrowhead at positive tip
    const tipPos  = dir.clone().multiplyScalar(EXTENT)
    const backPos = dir.clone().multiplyScalar(EXTENT - ARROW_SIZE)
    positions.push(...tipPos.toArray(), ...backPos.clone().add(perp.clone().multiplyScalar( ARROW_SIZE * 0.55)).toArray())
    positions.push(...tipPos.toArray(), ...backPos.clone().add(perp.clone().multiplyScalar(-ARROW_SIZE * 0.55)).toArray())

    // Arrowhead at negative tip (points in the −dir direction)
    const tipNeg  = dir.clone().multiplyScalar(-EXTENT)
    const backNeg = dir.clone().multiplyScalar(-EXTENT + ARROW_SIZE)
    positions.push(...tipNeg.toArray(), ...backNeg.clone().add(perp.clone().multiplyScalar( ARROW_SIZE * 0.55)).toArray())
    positions.push(...tipNeg.toArray(), ...backNeg.clone().add(perp.clone().multiplyScalar(-ARROW_SIZE * 0.55)).toArray())

    // Tick marks
    let t = TICK_STEP
    while (t < EXTENT - ARROW_SIZE) {
      const c  = dir.clone().multiplyScalar(t)
      const cn = dir.clone().multiplyScalar(-t)
      positions.push(...c.clone().add(perp.clone().multiplyScalar( TICK_SIZE)).toArray())
      positions.push(...c.clone().add(perp.clone().multiplyScalar(-TICK_SIZE)).toArray())
      positions.push(...cn.clone().add(perp.clone().multiplyScalar( TICK_SIZE)).toArray())
      positions.push(...cn.clone().add(perp.clone().multiplyScalar(-TICK_SIZE)).toArray())
      t += TICK_STEP
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({
      color: col.three, transparent: true, opacity: OPACITY, depthTest: true,
    })
    const lines = new THREE.LineSegments(geo, mat)
    this.scene.add(lines)
    this._objects.push(lines)

    // CSS2D axis letter label at the positive tip (only when renderer provided)
    if (this.renderer) {
      this._addLabel(
        name.toUpperCase(),
        dir.clone().multiplyScalar(EXTENT + 0.12),
        col.css,
        '11px',
        '500',
        0.80,
      )
    }
  }

  /**
   * Create a CSS2DObject div and attach it to the scene.
   */
  _addLabel(text, position, color, fontSize, fontWeight, opacity) {
    const div = document.createElement('div')
    div.textContent = text
    Object.assign(div.style, {
      fontFamily:   "'Inter', 'SF Mono', monospace",
      fontSize,
      fontWeight,
      color,
      opacity:       String(opacity),
      letterSpacing: '0.06em',
      userSelect:    'none',
      pointerEvents: 'none',
      textShadow:    `0 0 8px ${color}55`,
    })

    const obj = new CSS2DObject(div)
    obj.position.copy(position)
    this.scene.add(obj)
    this._labels.push(obj)
  }

  /**
   * Subtle grid on the XY plane.
   * Uses LineSegments — low opacity so it reads as background.
   */
  _buildGrid() {
    const step  = TICK_STEP
    const ext   = EXTENT
    const positions = []

    for (let v = -ext; v <= ext + 0.001; v += step) {
      const vr = Math.round(v / step) * step   // avoid float drift
      // Horizontal lines (along X)
      positions.push(-ext, vr, 0,  ext, vr, 0)
      // Vertical lines (along Y)
      positions.push(vr, -ext, 0,  vr,  ext, 0)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({
      color:       0x1a2a4a,
      transparent: true,
      opacity:     0.35,
      depthTest:   true,
    })
    const grid = new THREE.LineSegments(geo, mat)
    this.scene.add(grid)
    this._objects.push(grid)
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  setVisible(visible) {
    this._objects.forEach(o => { o.visible = visible })
    this._labels.forEach(l => { l.visible = visible })
  }

  dispose() {
    this._objects.forEach(o => {
      this.scene.remove(o)
      o.geometry.dispose()
      o.material.dispose()
    })
    this._labels.forEach(l => {
      this.scene.remove(l)
      if (l.element.parentNode) l.element.parentNode.removeChild(l.element)
    })
    this._objects = []
    this._labels  = []
  }
}
