/**
 * axes.js
 *
 * 3D coordinate axes with tick marks and CSS2D letter labels.
 *
 * These are lightweight local axes for modes that need their own reference.
 * Spatial modes normally hide them and use SpatialVolume as the single XYZ frame.
 *
 * Always-visible local axes with arrowheads and labels on both sides.
 * SpatialVolume supplies the optional surrounding cube/grid, but these axes
 * remain the mathematical reference for the graphed function.
 */

import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

const EXTENT     = 2.5   // long enough to contain Lorenz z-axis (~1.9 world units)
const TICK_STEP  = 0.25
const TICK_SIZE  = 0.028
const ARROW_SIZE = 0.05
const OPACITY    = 0.78

const COLOURS = {
  x: { three: new THREE.Color(0x4499ff), css: '#66b7ff' },
  y: { three: new THREE.Color(0x00e5ff), css: '#66f2ff' },
  z: { three: new THREE.Color(0xe8c547), css: '#f2d675' },
}

export class Axes {
  /**
   * @param {THREE.Scene} scene
   * @param {Renderer|null} renderer  pass the app renderer to enable CSS2D labels
   */
  constructor(scene, renderer = null) {
    this.scene    = scene
    this.renderer = renderer

    this._group = new THREE.Group()
    scene.add(this._group)

    this._labels = []   // CSS2DObjects (need manual DOM cleanup on dispose)
    this._build()
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  _build() {
    this._buildAxis('x', new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    this._buildAxis('y', new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    this._buildAxis('z', new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
  }

  _buildAxis(name, dir, perp) {
    const col       = COLOURS[name]
    const positions = []

    // Main axis line — full extent in both directions
    positions.push(...dir.clone().multiplyScalar(-EXTENT).toArray())
    positions.push(...dir.clone().multiplyScalar( EXTENT).toArray())

    // Arrowhead at positive tip
    const tipPos  = dir.clone().multiplyScalar(EXTENT)
    const backPos = dir.clone().multiplyScalar(EXTENT - ARROW_SIZE)
    positions.push(...tipPos.toArray(), ...backPos.clone().add(perp.clone().multiplyScalar( ARROW_SIZE * 0.55)).toArray())
    positions.push(...tipPos.toArray(), ...backPos.clone().add(perp.clone().multiplyScalar(-ARROW_SIZE * 0.55)).toArray())

    // Arrowhead at negative tip
    const tipNeg  = dir.clone().multiplyScalar(-EXTENT)
    const backNeg = dir.clone().multiplyScalar(-EXTENT + ARROW_SIZE)
    positions.push(...tipNeg.toArray(), ...backNeg.clone().add(perp.clone().multiplyScalar( ARROW_SIZE * 0.55)).toArray())
    positions.push(...tipNeg.toArray(), ...backNeg.clone().add(perp.clone().multiplyScalar(-ARROW_SIZE * 0.55)).toArray())

    // Tick marks on both sides of origin
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

    const geo  = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat  = new THREE.LineBasicMaterial({
      color: col.three,
      transparent: true,
      opacity: OPACITY,
      depthTest: true,
      depthWrite: false,
      linewidth: 2,
    })
    this._group.add(new THREE.LineSegments(geo, mat))

    // CSS2D axis letters at both tips (only when renderer is provided)
    if (this.renderer) {
      this._addLabel(
        `+${name.toUpperCase()}`,
        dir.clone().multiplyScalar(EXTENT + 0.12),
        col.css,
      )
      this._addLabel(
        `-${name.toUpperCase()}`,
        dir.clone().multiplyScalar(-EXTENT - 0.12),
        col.css,
      )
    }
  }

  _addLabel(text, position, color) {
    const div = document.createElement('div')
    div.textContent = text
    Object.assign(div.style, {
      fontFamily:   "'Electrolize', 'SF Mono', monospace",
      fontSize:     '11px',
      fontWeight:   '700',
      color,
      opacity:      '0.92',
      letterSpacing: '0.06em',
      userSelect:   'none',
      pointerEvents: 'none',
      textShadow:   `0 0 6px ${color}66`,
    })

    const obj = new CSS2DObject(div)
    obj.position.copy(position)
    this._group.add(obj)
    this._labels.push(obj)
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  setVisible(visible) {
    this._group.visible = visible
    this._labels.forEach(label => {
      label.visible = visible
      label.element.style.display = visible ? '' : 'none'
    })
  }

  dispose() {
    // Traverse group to dispose geometries and materials
    this._group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    })
    // Remove CSS2D DOM elements from the page
    this._labels.forEach(l => {
      if (l.element.parentNode) l.element.parentNode.removeChild(l.element)
    })
    this.scene.remove(this._group)
    this._labels = []
  }
}
