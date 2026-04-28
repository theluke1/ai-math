/**
 * mandelbrot.frag
 *
 * Mandelbrot / Julia set renderer.
 *
 * Iteration:  z_{n+1} = z_n² + c
 * Mandelbrot: z_0 = 0,        c = pixel position
 * Julia:      z_0 = pixel,    c = uJuliaC  (fixed, driven by cursor)
 *
 * Smooth escape time (eliminates integer banding):
 *   t_smooth = iter - log2( log2(|z|) ) + 1.0
 *   Normalised, sqrt-mapped, then fract()-cycled for repeating colour bands.
 *
 * Palette — designed for ZERO BLOOM rendering (bloom is disabled in this mode).
 * All stops are ≤ 0.72 luminance so the post-process chain does not interfere.
 * Colours are fully saturated so the fractal reads as vivid without needing
 * HDR overbright tricks:
 *
 *   0.00 → deep navy-black   (#040c20)
 *   0.22 → vivid royal blue  (#1060c0)
 *   0.48 → rich teal         (#00a0b8)
 *   0.72 → warm amber        (#b88010)
 *   1.00 → dusty warm grey   (#8c7e58)  ← no white; palette wraps via fract
 *
 * Interior → near-black navy.  Output capped at 0.52 to stay clear of any
 * residual bloom from adjacent geometry.
 */

precision highp float;

uniform vec2  uResolution;
uniform vec2  uCenter;
uniform float uZoom;
uniform int   uMaxIter;
uniform float uTime;
uniform float uJuliaMode;   // 1.0 = Julia, 0.0 = Mandelbrot
uniform vec2  uJuliaC;
uniform float uColorShift;

varying vec2 vUv;

// ---------------------------------------------------------------------------
// Palette — 5-stop gradient, peak luminance ≤ 0.72
// ---------------------------------------------------------------------------
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);

  vec3 c0 = vec3(0.016, 0.047, 0.125);  // deep navy-black
  vec3 c1 = vec3(0.063, 0.376, 0.753);  // vivid royal blue
  vec3 c2 = vec3(0.000, 0.627, 0.722);  // rich teal
  vec3 c3 = vec3(0.722, 0.502, 0.031);  // warm amber
  vec3 c4 = vec3(0.549, 0.494, 0.345);  // dusty warm  (no white)

  if (t < 0.22) return mix(c0, c1, t / 0.22);
  if (t < 0.48) return mix(c1, c2, (t - 0.22) / 0.26);
  if (t < 0.72) return mix(c2, c3, (t - 0.48) / 0.24);
                return mix(c3, c4, (t - 0.72) / 0.28);
}

void main() {
  // Map UV [0,1] → aspect-corrected complex-plane coordinates
  vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);

  vec2 c    = uCenter + uv * uZoom;
  vec2 z    = (uJuliaMode > 0.5) ? c       : vec2(0.0);
  vec2 seed = (uJuliaMode > 0.5) ? uJuliaC : c;

  int   iter = 0;
  float len2 = 0.0;

  // Loop cap of 1024 lets uMaxIter grow as the user zooms deeper.
  // uMaxIter is auto-computed in JS from zoom level so this only costs
  // what the current depth actually needs.
  for (int i = 0; i < 1024; i++) {
    if (i >= uMaxIter) break;
    z    = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + seed;
    len2 = dot(z, z);
    if (len2 > 256.0) { iter = i; break; }
    iter = i + 1;
  }

  // Interior — deep navy, slightly lighter than pure black so it reads as a
  // solid shape rather than a void.
  if (iter == uMaxIter) {
    gl_FragColor = vec4(0.012, 0.024, 0.063, 1.0);
    return;
  }

  // Smooth continuous escape time → normalised [0,1]
  float sl = float(iter) - log2(log2(sqrt(len2))) + 1.0;
  float t  = sqrt(clamp(sl / float(uMaxIter), 0.0, 1.0));

  // fract() repeats the palette → multiple colour bands at each zoom level,
  // each band a scaled copy of the others (visual demonstration of self-similarity).
  t = fract(t + uColorShift + uTime * 0.010);

  vec3 col = palette(t);

  // Subtle vignette — draws the eye to the fractal centre
  vec2  vign_uv = vUv - 0.5;
  float vign    = 1.0 - dot(vign_uv, vign_uv) * 0.55;
  col *= vign;

  // Hard cap — keeps every pixel below bloom threshold even at extreme zoom.
  // Bloom is disabled in this mode but guard against edge cases.
  col = min(col, vec3(0.52));

  gl_FragColor = vec4(col, 1.0);
}
