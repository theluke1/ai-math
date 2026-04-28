/**
 * pendulum.js — Double Pendulum
 *
 * A double pendulum is two pendulums chained end-to-end. Despite being a
 * purely deterministic mechanical system, it is chaotic: tiny differences in
 * initial angles lead to completely different trajectories.
 *
 * Equations of motion (Lagrangian mechanics):
 *
 *   Let θ₁, θ₂ be angles from vertical, m₁=m₂=1, L₁=L₂=1, g=9.81.
 *   The angular accelerations are coupled nonlinear ODEs:
 *
 *   Δθ = θ₁ - θ₂
 *
 *   θ₁'' = [ -g(2m₁+m₂)sinθ₁ - m₂·g·sin(θ₁-2θ₂)
 *             - 2sin(Δθ)·m₂·(θ₂'²·L₂ + θ₁'²·L₁·cos(Δθ)) ]
 *           / [ L₁·(2m₁+m₂-m₂·cos(2Δθ)) ]
 *
 *   θ₂'' = [ 2sin(Δθ)·(θ₁'²·L₁·(m₁+m₂) + g·(m₁+m₂)·cosθ₁
 *             + θ₂'²·L₂·m₂·cos(Δθ)) ]
 *           / [ L₂·(2m₁+m₂-m₂·cos(2Δθ)) ]
 *
 * Extensions:
 *   Damping   — linear drag −b·ω on each arm's angular velocity, dissipating energy.
 *   Driving   — periodic external torque F·cos(ωd·t) applied at the first pivot,
 *               which can sustain or destabilise the motion.
 *
 * Integrated with RK4 (time-aware, passing t to deriv for driving force).
 * Two pendulums run simultaneously (main + shadow), starting 0.001° apart —
 * visual proof of chaotic sensitivity.
 *
 * Rendering:
 *   - Two pivot rods drawn as Line (THREE.Line)
 *   - Bob positions drawn as Points with bloom glow
 *   - Trail ring buffer traces the tip of pendulum 2
 */

import * as THREE from 'three'
import { gsap }         from 'gsap'
import { Pane }         from 'tweakpane'
import { animatePanel } from '../core/ui.js'
import lissajousVert    from '../shaders/lissajous.vert'
import lissajousFrag    from '../shaders/lissajous.frag'

const TRAIL_LEN       = 4000
const STEPS_PER_FRAME = 12
const DT              = 0.003   // integration step in seconds
const SCALE           = 0.42   // pixel scale: 1 unit = 0.42 world units

const g = 9.81

// State vector: [θ1, ω1, θ2, ω2]
// p must contain: m1, m2, L1, L2, damping, drivingAmp, drivingFreq
// t is simulation time (needed for the time-dependent driving torque)
function deriv(s, p, t) {
  const [th1, w1, th2, w2] = s
  const { m1, m2, L1, L2, damping, drivingAmp, drivingFreq } = p
  const dth = th1 - th2
  const denom1 = L1 * (2 * m1 + m2 - m2 * Math.cos(2 * dth))
  const denom2 = L2 * (2 * m1 + m2 - m2 * Math.cos(2 * dth))

  // Lagrangian angular accelerations
  let a1 = (
    -g * (2 * m1 + m2) * Math.sin(th1)
    - m2 * g * Math.sin(th1 - 2 * th2)
    - 2 * Math.sin(dth) * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(dth))
  ) / denom1

  let a2 = (
    2 * Math.sin(dth) * (
      w1 * w1 * L1 * (m1 + m2)
      + g * (m1 + m2) * Math.cos(th1)
      + w2 * w2 * L2 * m2 * Math.cos(dth)
    )
  ) / denom2

  // Linear damping: −b·ω (removes energy; models air resistance / friction)
  a1 -= damping * w1
  a2 -= damping * w2

  // Periodic driving torque on first arm: F·cos(ωd·t)
  // Divided by (m1·L1²) to convert force→angular acceleration, but we
  // fold that into the user's amplitude so the slider feels intuitive.
  a1 += drivingAmp * Math.cos(drivingFreq * t)

  return [w1, a1, w2, a2]
}

// RK4 integrator — time-aware so the driving force uses the correct phase
// at each sub-step (k2 and k3 use t + h/2, k4 uses t + h).
function rk4(s, h, p, t) {
  const k1 = deriv(s, p, t)
  const k2 = deriv(s.map((v, i) => v + h * 0.5 * k1[i]), p, t + h * 0.5)
  const k3 = deriv(s.map((v, i) => v + h * 0.5 * k2[i]), p, t + h * 0.5)
  const k4 = deriv(s.map((v, i) => v + h * k3[i]), p, t + h)
  return s.map((v, i) => v + (h / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]))
}

// Convert state to bob positions in world space
function bobs(s, p) {
  const { L1, L2 } = p
  const x1 =  L1 * Math.sin(s[0]) * SCALE
  const y1 = -L1 * Math.cos(s[0]) * SCALE
  const x2 = x1 + L2 * Math.sin(s[2]) * SCALE
  const y2 = y1 - L2 * Math.cos(s[2]) * SCALE
  return { x1, y1, x2, y2 }
}

export class PendulumMode {
  constructor(scene, renderer) {
    this.scene    = scene
    this.renderer = renderer

    this.params = {
      m1: 1.0, m2: 1.0,
      L1: 1.0, L2: 1.0,
      theta1: 120,   // degrees
      theta2: 120,
      speed: 1.0,
      showShadow: true,
      // Damping & driving
      damping:     0.0,   // b — linear drag coefficient (0 = frictionless)
      drivingAmp:  0.0,   // F — peak torque amplitude
      drivingFreq: 2.0,   // ωd — driving angular frequency (rad/s)
    }

    // Simulation time (needed for time-dependent driving torque)
    this._simTime       = 0
    this._shadowSimTime = 0

    // Initial state in radians
    const th1 = this.params.theta1 * Math.PI / 180
    const th2 = this.params.theta2 * Math.PI / 180
    this._state       = [th1, 0, th2, 0]
    this._shadowState = [th1 + 0.001, 0, th2, 0]

    this._trail       = new Float32Array(TRAIL_LEN * 3)
    this._trailAges   = new Float32Array(TRAIL_LEN)
    this._shadowTrail = new Float32Array(TRAIL_LEN * 3)
    this._shadowAges  = new Float32Array(TRAIL_LEN)

    this._initTrails()
    this._buildRods()
    this._buildTrails()
    this._buildUI()

    // Locked camera — pendulum lives in XY plane
    const cam  = renderer.camera
    const ctrl = renderer.controls
    this._savedCamPos    = cam.position.clone()
    this._savedTarget    = ctrl.target.clone()
    this._savedAutoRot   = ctrl.autoRotate
    this._savedEnableRot = ctrl.enableRotate
    cam.position.set(0, 0.1, 2.8)
    ctrl.target.set(0, 0.1, 0)
    ctrl.autoRotate   = false
    ctrl.enableRotate = false
    cam.updateProjectionMatrix()
    renderer.parallaxEnabled = false
  }

  _initTrails() {
    const p = this._getPhysicsParams()
    const b = bobs(this._state, p)
    for (let i = 0; i < TRAIL_LEN; i++) {
      this._trail[i*3] = b.x2; this._trail[i*3+1] = b.y2; this._trail[i*3+2] = 0
      this._shadowTrail[i*3] = b.x2; this._shadowTrail[i*3+1] = b.y2; this._shadowTrail[i*3+2] = 0
      this._trailAges[i]  = Math.pow(1 - i / (TRAIL_LEN - 1), 1.5)
      this._shadowAges[i] = this._trailAges[i]
    }
  }

  _getPhysicsParams() {
    return {
      m1: this.params.m1, m2: this.params.m2,
      L1: this.params.L1, L2: this.params.L2,
      damping:     this.params.damping,
      drivingAmp:  this.params.drivingAmp,
      drivingFreq: this.params.drivingFreq,
    }
  }

  _buildRods() {
    // Rod geometry: pivot(0,0) → bob1 → bob2
    const rodPositions = new Float32Array([0,0,0, 0,0,0, 0,0,0])
    const rodGeo = new THREE.BufferGeometry()
    rodGeo.setAttribute('position', new THREE.BufferAttribute(rodPositions, 3))
    rodGeo.setUsage?.(THREE.DynamicDrawUsage)
    this._rodAttr = rodGeo.attributes.position
    this._rodAttr.usage = THREE.DynamicDrawUsage

    this._rodMesh = new THREE.Line(rodGeo, new THREE.LineBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.7,
    }))
    this.scene.add(this._rodMesh)

    // Shadow rod
    const shadowRodPositions = new Float32Array([0,0,0, 0,0,0, 0,0,0])
    const shadowRodGeo = new THREE.BufferGeometry()
    shadowRodGeo.setAttribute('position', new THREE.BufferAttribute(shadowRodPositions, 3))
    this._shadowRodAttr = shadowRodGeo.attributes.position
    this._shadowRodAttr.usage = THREE.DynamicDrawUsage

    this._shadowRodMesh = new THREE.Line(shadowRodGeo, new THREE.LineBasicMaterial({
      color: 0xe8c547, transparent: true, opacity: 0.35,
    }))
    this.scene.add(this._shadowRodMesh)

    // Bob dots — Points with additive glow
    const bobPositions = new Float32Array([0,0,0, 0,0,0])
    const bobGeo = new THREE.BufferGeometry()
    bobGeo.setAttribute('position', new THREE.BufferAttribute(bobPositions, 3))
    this._bobAttr = bobGeo.attributes.position
    this._bobAttr.usage = THREE.DynamicDrawUsage

    this._bobMesh = new THREE.Points(bobGeo, new THREE.PointsMaterial({
      color: 0x00ddff, size: 0.06, sizeAttenuation: true,
    }))
    this.scene.add(this._bobMesh)

    // Pivot dot
    const pivotGeo = new THREE.BufferGeometry()
    pivotGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0], 3))
    this._pivotMesh = new THREE.Points(pivotGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.04, sizeAttenuation: true,
    }))
    this.scene.add(this._pivotMesh)
  }

  _buildTrails() {
    // Main trail (cyan)
    const trailGeo = new THREE.BufferGeometry()
    const posAttr  = new THREE.BufferAttribute(this._trail, 3)
    const ageAttr  = new THREE.BufferAttribute(this._trailAges, 1)
    posAttr.usage  = THREE.DynamicDrawUsage
    trailGeo.setAttribute('position', posAttr)
    trailGeo.setAttribute('age', ageAttr)
    this._trailMesh = new THREE.Line(trailGeo, new THREE.ShaderMaterial({
      vertexShader: lissajousVert, fragmentShader: lissajousFrag,
      uniforms: { uColour: { value: new THREE.Color(0x00ddff) } },
      transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
    }))
    this._trailGeo     = trailGeo
    this._trailPosAttr = posAttr
    this.scene.add(this._trailMesh)

    // Shadow trail (amber)
    const shadowGeo    = new THREE.BufferGeometry()
    const shadowPos    = new THREE.BufferAttribute(this._shadowTrail, 3)
    const shadowAge    = new THREE.BufferAttribute(this._shadowAges, 1)
    shadowPos.usage    = THREE.DynamicDrawUsage
    shadowGeo.setAttribute('position', shadowPos)
    shadowGeo.setAttribute('age', shadowAge)
    this._shadowTrailMesh = new THREE.Line(shadowGeo, new THREE.ShaderMaterial({
      vertexShader: lissajousVert, fragmentShader: lissajousFrag,
      uniforms: { uColour: { value: new THREE.Color(0xe8c547) } },
      transparent: true, depthTest: false, blending: THREE.AdditiveBlending,
    }))
    this._shadowTrailGeo     = shadowGeo
    this._shadowTrailPosAttr = shadowPos
    this.scene.add(this._shadowTrailMesh)
  }

  _buildUI() {
    this.pane = new Pane({ title: 'Double Pendulum' })
    Object.assign(this.pane.element.style, {
      position: 'fixed', top: '60px', right: '16px',
      zIndex: '100', width: '260px',
    })

    const physFolder = this.pane.addFolder({ title: 'Physics', expanded: true })
    physFolder.addBinding(this.params, 'm1', { label: 'mass 1', min: 0.2, max: 3, step: 0.1 })
    physFolder.addBinding(this.params, 'm2', { label: 'mass 2', min: 0.2, max: 3, step: 0.1 })
    physFolder.addBinding(this.params, 'L1', { label: 'length 1', min: 0.3, max: 2, step: 0.05 })
    physFolder.addBinding(this.params, 'L2', { label: 'length 2', min: 0.3, max: 2, step: 0.05 })

    const initFolder = this.pane.addFolder({ title: 'Initial Angles (°)', expanded: true })
    initFolder.addBinding(this.params, 'theta1', { label: 'θ₁', min: 0, max: 180, step: 1 })
      .on('change', () => this._reset())
    initFolder.addBinding(this.params, 'theta2', { label: 'θ₂', min: 0, max: 180, step: 1 })
      .on('change', () => this._reset())

    const forceFolder = this.pane.addFolder({ title: 'Forces', expanded: true })
    forceFolder.addBinding(this.params, 'damping', {
      label: 'damping b', min: 0, max: 2.0, step: 0.01,
    })
    forceFolder.addBinding(this.params, 'drivingAmp', {
      label: 'drive amp F', min: 0, max: 5.0, step: 0.05,
    })
    forceFolder.addBinding(this.params, 'drivingFreq', {
      label: 'drive freq ω', min: 0.1, max: 10.0, step: 0.1,
    })

    this.pane.addBinding(this.params, 'speed', { label: 'speed', min: 0.1, max: 3.0, step: 0.1 })
    this.pane.addBinding(this.params, 'showShadow', { label: 'shadow pendulum' })
      .on('change', ({ value }) => {
        this._shadowRodMesh.visible  = value
        this._shadowTrailMesh.visible = value
      })

    animatePanel(this.pane)
  }

  _reset() {
    const th1 = this.params.theta1 * Math.PI / 180
    const th2 = this.params.theta2 * Math.PI / 180
    this._state       = [th1, 0, th2, 0]
    this._shadowState = [th1 + 0.001, 0, th2, 0]
    this._simTime       = 0
    this._shadowSimTime = 0
    this._initTrails()
    this._trailPosAttr.needsUpdate       = true
    this._shadowTrailPosAttr.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt) {
    this.renderer.controls.autoRotate = false
    const p     = this._getPhysicsParams()
    const steps = Math.max(1, Math.round(STEPS_PER_FRAME * this.params.speed))

    for (let s = 0; s < steps; s++) {
      this._state       = rk4(this._state,       DT, p, this._simTime)
      this._shadowState = rk4(this._shadowState, DT, p, this._shadowSimTime)
      this._simTime       += DT
      this._shadowSimTime += DT

      const b  = bobs(this._state, p)
      const bs = bobs(this._shadowState, p)

      // Push tip of bob2 to trail ring buffers
      this._trail.copyWithin(3, 0, (TRAIL_LEN - 1) * 3)
      this._trail[0] = b.x2; this._trail[1] = b.y2; this._trail[2] = 0

      this._shadowTrail.copyWithin(3, 0, (TRAIL_LEN - 1) * 3)
      this._shadowTrail[0] = bs.x2; this._shadowTrail[1] = bs.y2; this._shadowTrail[2] = 0
    }

    // Update rod vertices: pivot → bob1 → bob2
    const b  = bobs(this._state, p)
    const bs = bobs(this._shadowState, p)
    const ra = this._rodAttr.array
    ra[0]=0; ra[1]=0; ra[2]=0
    ra[3]=b.x1; ra[4]=b.y1; ra[5]=0
    ra[6]=b.x2; ra[7]=b.y2; ra[8]=0
    this._rodAttr.needsUpdate = true

    const sa = this._shadowRodAttr.array
    sa[0]=0; sa[1]=0; sa[2]=0
    sa[3]=bs.x1; sa[4]=bs.y1; sa[5]=0
    sa[6]=bs.x2; sa[7]=bs.y2; sa[8]=0
    this._shadowRodAttr.needsUpdate = true

    // Bob positions
    const ba = this._bobAttr.array
    ba[0]=b.x1; ba[1]=b.y1; ba[2]=0
    ba[3]=b.x2; ba[4]=b.y2; ba[5]=0
    this._bobAttr.needsUpdate = true

    this._trailPosAttr.needsUpdate       = true
    this._shadowTrailPosAttr.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose() {
    const cam  = this.renderer.camera
    const ctrl = this.renderer.controls
    cam.position.copy(this._savedCamPos)
    ctrl.target.copy(this._savedTarget)
    ctrl.autoRotate   = this._savedAutoRot
    ctrl.enableRotate = this._savedEnableRot
    cam.updateProjectionMatrix()
    this.renderer.parallaxEnabled = true

    const meshes = [
      this._rodMesh, this._shadowRodMesh, this._bobMesh,
      this._pivotMesh, this._trailMesh, this._shadowTrailMesh,
    ]
    meshes.forEach(m => {
      this.scene.remove(m)
      m.geometry.dispose()
      m.material.dispose?.()
    })
    this.pane.dispose()
  }
}
