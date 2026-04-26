/**
 * renderer.js
 *
 * WebGL renderer, perspective camera, OrbitControls, and bloom post-processing.
 *
 * Camera: PerspectiveCamera so 3D geometry looks correct with depth.
 *
 * Auto-rotation:
 *   The scene rotates slowly by default so the 3D structure is visible without
 *   the user having to do anything. When the user clicks and drags, auto-rotation
 *   pauses immediately. After 4 seconds of inactivity it resumes.
 *
 * OrbitControls:
 *   Left-drag  → rotate
 *   Right-drag → pan
 *   Scroll     → zoom
 *   enableDamping makes movement feel smooth and inertial.
 */

import * as THREE from 'three'
import { OrbitControls }   from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js'

export class Renderer {
  constructor() {
    // --- Scene ---
    this.scene = new THREE.Scene()

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      60,                                         // FOV degrees
      window.innerWidth / window.innerHeight,     // aspect ratio
      0.1,                                        // near clip
      100                                         // far clip
    )
    this.camera.position.set(1.2, -1.8, 2.2)
    this.camera.lookAt(0, 0, 0)

    // --- WebGL renderer ---
    this.webgl = new THREE.WebGLRenderer({
      antialias:        true,
      powerPreference:  'high-performance',
    })
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.webgl.setSize(window.innerWidth, window.innerHeight)
    this.webgl.toneMapping         = THREE.ACESFilmicToneMapping
    this.webgl.toneMappingExposure = 1.0
    document.body.appendChild(this.webgl.domElement)

    // --- OrbitControls ---
    this.controls = new OrbitControls(this.camera, this.webgl.domElement)
    this.controls.enableDamping   = true    // smooth inertial feel
    this.controls.dampingFactor   = 0.06
    this.controls.autoRotate      = true
    this.controls.autoRotateSpeed = 0.6     // degrees per frame at 60fps

    // Auto-rotate pauses when user interacts, resumes 4 seconds later
    let _resumeTimer = null
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      if (_resumeTimer) clearTimeout(_resumeTimer)
    })
    this.controls.addEventListener('end', () => {
      _resumeTimer = setTimeout(() => {
        this.controls.autoRotate = true
      }, 4000)
    })

    // --- Post-processing ---
    this.composer = new EffectComposer(this.webgl)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.0,    // strength
      0.5,    // radius
      0.2     // threshold — lower = more things bloom
    )
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())

    // --- Resize ---
    window.addEventListener('resize', () => this._onResize())
  }

  _onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.webgl.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloomPass.resolution.set(w, h)
  }

  /** Call once per frame — updates controls (needed for damping) then renders */
  render() {
    this.controls.update()
    this.composer.render()
  }

  get resolution() {
    return new THREE.Vector2(window.innerWidth, window.innerHeight)
  }
}
