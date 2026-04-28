/**
 * renderer.js
 *
 * Post-processing chain:
 *   RenderPass → UnrealBloom → ChromaticAberration → LensPass → OutputPass
 *
 * LensPass:
 *   A WebGL shader that magnifies the rendered scene inside the cursor ring.
 *   UV coordinates within the ring radius are remapped to sample from a
 *   zoomed-in region, creating a real magnifying-glass effect on the actual
 *   scene pixels. A prismatic edge split (rainbow rim) references the glass
 *   sphere photography from the visual reference.
 *
 *   Because this runs as a post-process pass, it magnifies everything —
 *   bloom, colour grading, geometry — not just the DOM, which CSS cannot do.
 *
 * Mouse parallax:
 *   When parallaxEnabled = true (3D modes), the scene tilts gently with mouse.
 *   2D modes set parallaxEnabled = false.
 */

import * as THREE from 'three'
import { OrbitControls }   from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass }      from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js'
import { CSS2DRenderer }   from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// ---------------------------------------------------------------------------
// Chromatic aberration — global screen-edge lens quality
// ---------------------------------------------------------------------------
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uStrength: { value: 0.0006 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec2  dir    = vUv - 0.5;
      float dist   = length(dir);
      vec2  offset = normalize(dir) * uStrength * dist * dist;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
}

// ---------------------------------------------------------------------------
// Lens pass — cursor magnification + prismatic glass rim
//
// Math:
//   To magnify by factor Z around cursor point C, we sample from:
//     uv_sample = C + (uv - C) / Z
//   This maps a larger neighbourhood of the source texture into the lens area.
//
//   The rim zone adds chromatic aberration along the edge normal —
//   R shifted outward, B shifted inward — replicating dispersion in glass.
// ---------------------------------------------------------------------------
const LensShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uCursor:   { value: new THREE.Vector2(0.5, 0.5) },  // UV space (0–1)
    uRadius:   { value: 0.04 },   // ring radius in normalised-height units
    uZoom:     { value: 2.5 },    // magnification factor inside the lens
    uAspect:   { value: 1.778 },  // window.innerWidth / window.innerHeight
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2  uCursor;
    uniform float uRadius;
    uniform float uZoom;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec2  delta = vUv - uCursor;

      // Aspect-correct distance so the lens is a perfect circle, not ellipse
      float dist = length(vec2(delta.x * uAspect, delta.y));

      vec2 sampleUv = vUv;

      if (dist < uRadius) {
        // Core lens: remap UVs toward cursor to magnify the scene.
        // Smooth the transition at the rim so there's no hard seam.
        float edge = smoothstep(uRadius, uRadius * 0.55, dist);  // 1 at centre, 0 at rim
        vec2 magnified = uCursor + delta / uZoom;
        sampleUv = mix(vUv, magnified, edge);
      }

      // Prismatic rim — thin band just inside the ring edge.
      // Splits R/G/B along the surface normal to simulate glass dispersion.
      float rimInner = uRadius * 0.78;
      float rimOuter = uRadius * 1.02;
      float rimT     = 1.0 - smoothstep(rimInner, rimOuter, dist);
      rimT *= smoothstep(0.0, rimInner * 0.3, dist);  // fade at centre
      rimT  = pow(rimT, 1.6);

      if (rimT > 0.001) {
        vec2 rimDir    = normalize(delta) / vec2(uAspect, 1.0);
        vec2 rimOffset = rimDir * 0.006 * rimT;
        float r = texture2D(tDiffuse, sampleUv + rimOffset).r;
        float g = texture2D(tDiffuse, sampleUv).g;
        float b = texture2D(tDiffuse, sampleUv - rimOffset).b;
        gl_FragColor = vec4(r, g, b, 1.0);
      } else {
        gl_FragColor = texture2D(tDiffuse, sampleUv);
      }
    }
  `,
}

// ---------------------------------------------------------------------------
// Film grain — animated photographic noise, heavier in darker areas
// ---------------------------------------------------------------------------
const FilmGrainShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uIntensity: { value: 0.032 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec4 c   = texture2D(tDiffuse, vUv);
      float g  = hash(vUv + fract(uTime * 1.37)) * 2.0 - 1.0;
      float lum = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb += g * uIntensity * (1.0 - lum * 0.65);
      gl_FragColor = c;
    }
  `,
}

// ---------------------------------------------------------------------------
// Click ripple — radial UV distortion that expands from the click point
// ---------------------------------------------------------------------------
const RippleShader = {
  uniforms: {
    tDiffuse:      { value: null },
    uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRippleTime:   { value: -1.0 },   // -1 = inactive
    uAspect:       { value: 1.778 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2  uRippleCenter;
    uniform float uRippleTime;
    uniform float uAspect;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      if(uRippleTime >= 0.0){
        vec2  delta = vUv - uRippleCenter;
        delta.x    *= uAspect;
        float dist  = length(delta);
        float front = uRippleTime * 1.55;
        float ring  = smoothstep(front-0.04, front, dist) * smoothstep(front+0.04, front, dist);
        float fade  = 1.0 - clamp(uRippleTime / 1.1, 0.0, 1.0);
        vec2  dir   = normalize(delta + 0.0001) / vec2(uAspect, 1.0);
        uv += dir * ring * 0.004 * fade;
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
}

// ---------------------------------------------------------------------------
// Velocity blur — directional streak in mouse-movement direction
// ---------------------------------------------------------------------------
const VelocityBlurShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uVelocity: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uVelocity;
    varying vec2 vUv;
    void main(){
      vec4 col = vec4(0.0);
      const int N = 8;
      vec2 step = uVelocity / float(N);
      for(int i=0; i<N; i++) col += texture2D(tDiffuse, vUv - step * float(i));
      gl_FragColor = col / float(N);
    }
  `,
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
export class Renderer {
  constructor() {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    )
    this.camera.position.set(1.2, -1.8, 2.2)
    this.camera.lookAt(0, 0, 0)

    this.webgl = new THREE.WebGLRenderer({
      antialias:       true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.webgl.setSize(window.innerWidth, window.innerHeight)
    this.webgl.toneMapping         = THREE.ACESFilmicToneMapping
    this.webgl.toneMappingExposure = 1.0
    document.body.appendChild(this.webgl.domElement)

    this.controls = new OrbitControls(this.camera, this.webgl.domElement)
    this.controls.enableDamping   = true
    this.controls.dampingFactor   = 0.06
    this.controls.autoRotate      = true
    this.controls.autoRotateSpeed = 0.6

    let _resumeTimer = null
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false
      if (_resumeTimer) clearTimeout(_resumeTimer)
    })
    this.controls.addEventListener('end', () => {
      _resumeTimer = setTimeout(() => { this.controls.autoRotate = true }, 4000)
    })

    // CSS2D label renderer
    this.css2d = new CSS2DRenderer()
    this.css2d.setSize(window.innerWidth, window.innerHeight)
    Object.assign(this.css2d.domElement.style, {
      position: 'absolute', top: '0', left: '0',
      pointerEvents: 'none', zIndex: '10',
    })
    document.body.appendChild(this.css2d.domElement)

    // Post-processing chain
    this.composer = new EffectComposer(this.webgl)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.0, 0.5, 0.2
    )
    this.composer.addPass(this.bloomPass)

    this.chromaPass = new ShaderPass(ChromaticAberrationShader)
    this.composer.addPass(this.chromaPass)

    // Lens pass sits after chroma so the magnified region also gets the
    // global aberration treatment — matches the glass sphere aesthetic.
    this.lensPass = new ShaderPass(LensShader)
    this.composer.addPass(this.lensPass)

    // Velocity blur — directional streak on fast cursor movement
    this.blurPass = new ShaderPass(VelocityBlurShader)
    this.composer.addPass(this.blurPass)

    // Ripple — click-triggered radial UV distortion
    this.ripplePass = new ShaderPass(RippleShader)
    this.composer.addPass(this.ripplePass)

    // Film grain — last layer, applied to the final pixel
    this.grainPass = new ShaderPass(FilmGrainShader)
    this.composer.addPass(this.grainPass)

    this.composer.addPass(new OutputPass())

    // Mouse tracking — two coordinate systems:
    //   _mouse:  NDC (-1→1), used for parallax tilt
    //   _cursor: UV  (0→1),  used for lens pass (y flipped for WebGL)
    this._mouse      = { x: 0, y: 0 }
    this._prevMouse  = { x: 0, y: 0 }
    this._mouseVel   = new THREE.Vector2()
    this._cursor     = { x: 0.5, y: 0.5 }
    this._parallax   = { x: 0, y: 0 }
    this.parallaxEnabled = true

    // Ripple state
    this._rippleTime = -1

    window.addEventListener('mousemove', e => {
      this._mouse.x  =  (e.clientX / window.innerWidth)  * 2 - 1
      this._mouse.y  = -((e.clientY / window.innerHeight) * 2 - 1)
      this._cursor.x = e.clientX / window.innerWidth
      this._cursor.y = 1 - e.clientY / window.innerHeight  // UV y=0 is bottom
    })

    // Set initial aspect and radius from ring size (28px radius)
    this._updateLensUniforms()
    window.addEventListener('resize', () => this._onResize())
  }

  /** Keep lens radius in sync with the 28px CSS ring and current viewport */
  _updateLensUniforms() {
    const RING_RADIUS_PX = 28
    this.lensPass.uniforms.uRadius.value = RING_RADIUS_PX / window.innerHeight
    this.lensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight
  }

  /**
   * Trigger a ripple distortion centred on the given screen position.
   * Called from main.js on canvas click.
   */
  triggerRipple(clientX, clientY) {
    this.ripplePass.uniforms.uRippleCenter.value.set(
      clientX / window.innerWidth,
      1 - clientY / window.innerHeight,   // flip Y for WebGL UV
    )
    this._rippleTime = 0
  }

  _onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.webgl.setSize(w, h)
    this.composer.setSize(w, h)
    this.bloomPass.resolution.set(w, h)
    this.css2d.setSize(w, h)
    this._updateLensUniforms()
    this.ripplePass.uniforms.uAspect.value = w / h
  }

  render() {
    this.controls.update()

    // Parallax tilt
    const lf = 0.04
    this._parallax.x += (this._mouse.x - this._parallax.x) * lf
    this._parallax.y += (this._mouse.y - this._parallax.y) * lf

    if (this.parallaxEnabled) {
      this.scene.rotation.y = this._parallax.x * 0.055
      this.scene.rotation.x = this._parallax.y * 0.035
    } else {
      this.scene.rotation.y += (0 - this.scene.rotation.y) * 0.1
      this.scene.rotation.x += (0 - this.scene.rotation.x) * 0.1
    }

    // Update lens cursor position every frame
    this.lensPass.uniforms.uCursor.value.set(this._cursor.x, this._cursor.y)

    // Mouse velocity → directional blur
    const mvx = this._mouse.x - this._prevMouse.x
    const mvy = this._mouse.y - this._prevMouse.y
    this._prevMouse.x = this._mouse.x
    this._prevMouse.y = this._mouse.y
    this._mouseVel.x += (mvx * 0.016 - this._mouseVel.x) * 0.18
    this._mouseVel.y += (mvy * 0.016 - this._mouseVel.y) * 0.18
    // Skip the blur pass entirely when mouse is still — saves one full-screen blit
    const velSq = this._mouseVel.lengthSq()
    this.blurPass.enabled = velSq > 1e-7
    if (this.blurPass.enabled) this.blurPass.uniforms.uVelocity.value.copy(this._mouseVel)

    // Film grain — advance time each frame
    this.grainPass.uniforms.uTime.value += 0.016

    // Ripple — advance and deactivate when finished
    if (this._rippleTime >= 0) {
      this._rippleTime += 0.016
      this.ripplePass.uniforms.uRippleTime.value = this._rippleTime
      if (this._rippleTime > 1.5) {
        this._rippleTime = -1
        this.ripplePass.uniforms.uRippleTime.value = -1
      }
    }

    this.composer.render()
    this.css2d.render(this.scene, this.camera)
  }

  get domElement() { return this.webgl.domElement }
  get resolution() { return new THREE.Vector2(window.innerWidth, window.innerHeight) }
}
