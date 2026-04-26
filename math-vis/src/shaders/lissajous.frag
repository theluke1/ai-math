/**
 * lissajous.frag
 *
 * Fragment shader for the Lissajous trail.
 *
 * Colour logic:
 *   - Newest (vAge ≈ 1): near-white, overbright so the bloom pass makes it glow hard
 *   - Mid trail:         electric cyan (uColour)
 *   - Oldest (vAge ≈ 0): transparent — nothing rendered
 *
 * The material uses AdditiveBlending in lissajous.js, so where the trail
 * crosses itself the colours add together and get brighter — this produces
 * the phosphor/oscilloscope look naturally without any extra logic here.
 *
 * uColour is in linear colour space. Values above 1.0 are intentional —
 * they push pixels past the bloom threshold so UnrealBloomPass picks them up.
 */

uniform vec3 uColour;
varying float vAge;

void main() {
  // Power curve: trail stays bright for longer, then drops off sharply near the tail
  float fade = pow(vAge, 1.8);

  // Leading tip: flash toward white-cyan (overbright → triggers bloom hard)
  // Rest of trail: the base uColour
  // pow(vAge, 6.0) is very narrow — only the very newest points go white
  vec3 tipColour = vec3(1.4, 1.4, 1.4);
  vec3 colour = mix(uColour, tipColour, pow(vAge, 6.0));

  // Output: colour scaled by fade, alpha = fade (for AdditiveBlending)
  gl_FragColor = vec4(colour * fade, fade);
}
