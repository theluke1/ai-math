/**
 * wave.frag — water-ripple interference colour mapping
 *
 * Computes wave superposition per-pixel (all sources, all at once).
 * The signed amplitude drives a water-depth palette:
 *
 *   u = -1  (trough)  →  very dark navy   (deep water, no light)
 *   u =  0  (surface) →  medium ocean blue
 *   u = +1  (crest)   →  overbright white-cyan (sunlit peak → bloom)
 *
 * This reads as physical depth — troughs look like you're seeing down
 * into the water, crests look like sunlight catching the surface.
 */

#define MAX_SOURCES 5

uniform float uTime;
uniform float uFrequency;
uniform float uSpeed;
uniform float uDamping;
uniform float uAmplitude;
uniform int   uNumSources;
uniform vec2  uSources[MAX_SOURCES];
uniform float uAspect;

varying vec2 vUv;

// ---------------------------------------------------------------------------
// Water palette — maps signed amplitude [-1, +1] to colour
// ---------------------------------------------------------------------------

vec3 waterColour(float u) {
  // Remap [-1, 1] → [0, 1] for palette lookup
  float t = u * 0.5 + 0.5;

  vec3 deep    = vec3(0.00, 0.01, 0.08);   // very dark navy — deep trough
  vec3 mid     = vec3(0.02, 0.18, 0.55);   // medium ocean blue — zero crossing
  vec3 shallow = vec3(0.10, 0.65, 0.90);   // bright teal — rising crest
  vec3 crest   = vec3(1.60, 1.70, 1.80);   // overbright white-cyan — peak (bloom)

  if (t < 0.35) {
    return mix(deep, mid, t / 0.35);
  } else if (t < 0.65) {
    return mix(mid, shallow, (t - 0.35) / 0.30);
  } else {
    return mix(shallow, crest, (t - 0.65) / 0.35);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

void main() {
  // Convert UV [0,1] to aspect-corrected world space matching source coords
  vec2 pos = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);

  float omega = uFrequency * uSpeed;   // angular frequency ω = k·v
  float total = 0.0;

  for (int i = 0; i < MAX_SOURCES; i++) {
    if (i >= uNumSources) break;

    float r = length(pos - uSources[i]);
    float decay = exp(-uDamping * r);
    total += uAmplitude * decay * sin(uFrequency * r - omega * uTime);
  }

  // Normalise: with N sources and amplitude A, max possible = N·A
  // Divide by N so palette range is always [-1, +1]
  total /= float(uNumSources);

  // Soft clamp with tanh so very bright regions bloom without hard cutoff
  total = tanh(total * 1.4);

  vec3 colour = waterColour(total);
  gl_FragColor = vec4(colour, 1.0);
}
