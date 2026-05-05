/**
 * lissajous.frag
 *
 * Fragment shader for the Lissajous trail.
 *
 * Colour logic:
 *   - Newest (vAge ≈ 1): near-white, but not overbright. Keeping this below
 *     bloom-hot values prevents camera-angle shimmer on thin WebGL lines.
 *   - Mid trail:         electric cyan (uColour)
 *   - Oldest (vAge ≈ 0): transparent — nothing rendered
 *
 * The material uses normal alpha blending so the trail stays visually stable
 * as the camera moves. Bloom still catches bright pixels, but the shader no
 * longer depends on overbright additive spikes.
 */

uniform vec3 uColour;
varying float vAge;

void main() {
  // Power curve: trail stays bright for longer, then drops off sharply near the tail
  float fade = max(pow(vAge, 1.55), 0.10);

  // Leading tip: flash toward white-cyan without exceeding 1.0.
  // Rest of trail: the base uColour
  // pow(vAge, 6.0) is very narrow — only the very newest points go white
  vec3 tipColour = vec3(0.95, 0.98, 1.0);
  vec3 colour = mix(uColour, tipColour, pow(vAge, 6.0));

  // Output: colour scaled by fade, alpha = fade.
  gl_FragColor = vec4(colour * fade, fade);
}
