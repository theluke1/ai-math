/**
 * lissajous.vert
 *
 * Vertex shader for the Lissajous trail.
 *
 * Three.js provides `position` and the matrix uniforms automatically.
 * We add `age` as a custom per-vertex attribute set in lissajous.js:
 *   age = 1.0 → newest point (brightest)
 *   age = 0.0 → oldest point (fully transparent)
 *
 * vAge is passed to the fragment shader where it drives colour and opacity.
 */

attribute float age;
varying float vAge;

void main() {
  vAge = age;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
