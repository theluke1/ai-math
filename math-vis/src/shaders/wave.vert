/**
 * wave.vert — flat surface pass-through
 *
 * For the 2D wave interference mode the fragment shader does all the
 * computation per-pixel. This vertex shader just passes the UV coordinate
 * through so the fragment shader knows where on the plane each pixel sits.
 */

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
