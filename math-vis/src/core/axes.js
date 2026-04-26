/**
 * axes.js
 *
 * 3D coordinate axes overlay — X, Y, Z with distinct colours.
 *
 * Colour choices (red-green colorblind safe — no red or green):
 *   X axis → electric blue  (#4488ff)
 *   Y axis → cyan           (#00ddff)
 *   Z axis → pale white     (#aaccff)
 *
 * Each axis has:
 *   - A line from -extent to +extent
 *   - A small arrowhead (two short lines) at the positive tip
 *   - Tick marks at regular intervals
 *
 * Rendered as THREE.LineSegments — sits in the scene and composites
 * naturally with the bloom pass. Low opacity so it grounds the visual
 * without fighting the main content.
 */

import * as THREE from 'three'

const EXTENT     = 1.2      // how far each axis extends
const TICK_STEP  = 0.25     // spacing between ticks
const TICK_SIZE  = 0.03     // half-length of tick marks
const ARROW_SIZE = 0.08     // length of arrowhead lines
const OPACITY    = 0.5      // overall axis opacity

// Colorblind-safe palette
const COLOURS = {
  x: new THREE.Color(0x4488ff),   // blue
  y: new THREE.Color(0x00ddff),   // cyan
  z: new THREE.Color(0xaaccff),   // pale blue-white
}

export class Axes {
  constructor(scene) {
    this.scene = scene
    this._groups = []
    this._build()
  }

  _build() {
    this._buildAxis('x', new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    this._buildAxis('y', new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
    this._buildAxis('z', new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
  }

  /**
   * Build one axis.
   * @param {string} name        'x' | 'y' | 'z'
   * @param {THREE.Vector3} dir  unit direction of this axis
   * @param {THREE.Vector3} perp any perpendicular vector (for tick marks)
   */
  _buildAxis(name, dir, perp) {
    const colour   = COLOURS[name]
    const positions = []

    // --- Main line ---
    const neg = dir.clone().multiplyScalar(-EXTENT)
    const pos = dir.clone().multiplyScalar( EXTENT)
    positions.push(...neg.toArray(), ...pos.toArray())

    // --- Arrowhead at positive tip ---
    // Two lines angled back from the tip
    const tip   = dir.clone().multiplyScalar(EXTENT)
    const back  = dir.clone().multiplyScalar(EXTENT - ARROW_SIZE)
    const side1 = back.clone().add(perp.clone().multiplyScalar( ARROW_SIZE * 0.6))
    const side2 = back.clone().add(perp.clone().multiplyScalar(-ARROW_SIZE * 0.6))
    positions.push(...tip.toArray(), ...side1.toArray())
    positions.push(...tip.toArray(), ...side2.toArray())

    // --- Tick marks ---
    let t = TICK_STEP
    while (t < EXTENT - ARROW_SIZE) {
      const centre = dir.clone().multiplyScalar(t)
      const t1 = centre.clone().add(perp.clone().multiplyScalar( TICK_SIZE))
      const t2 = centre.clone().add(perp.clone().multiplyScalar(-TICK_SIZE))
      positions.push(...t1.toArray(), ...t2.toArray())

      // Negative side ticks
      const cNeg = dir.clone().multiplyScalar(-t)
      const n1   = cNeg.clone().add(perp.clone().multiplyScalar( TICK_SIZE))
      const n2   = cNeg.clone().add(perp.clone().multiplyScalar(-TICK_SIZE))
      positions.push(...n1.toArray(), ...n2.toArray())

      t += TICK_STEP
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    const mat = new THREE.LineBasicMaterial({
      color:       colour,
      transparent: true,
      opacity:     OPACITY,
      depthTest:   true,
    })

    const lines = new THREE.LineSegments(geo, mat)
    this.scene.add(lines)
    this._groups.push(lines)
  }

  setVisible(visible) {
    this._groups.forEach(g => { g.visible = visible })
  }

  dispose() {
    this._groups.forEach(g => {
      this.scene.remove(g)
      g.geometry.dispose()
      g.material.dispose()
    })
    this._groups = []
  }
}
