/**
 * ask.js — Netlify Edge Function  /ask  endpoint
 *
 * Runs on Netlify's Deno-based edge runtime.
 * Uses the Groq API (free tier) — OpenAI-compatible, streams SSE deltas.
 *
 * Free tier: ~6,000 req/day on llama-3.3-70b-versatile, no billing required.
 * Get a free key at https://console.groq.com → API Keys
 *
 * Set GROQ_API_KEY in Netlify dashboard → Site configuration → Env vars.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_BODY_CHARS     = 60_000
const MAX_QUESTION_CHARS = 1_200
const MAX_CONTEXT_CHARS  = 22_000
const GROQ_MODEL_DEFAULT = 'llama3-70b-8192'
const MAX_TOKENS         = 1_200
const GROQ_URL           = 'https://api.groq.com/openai/v1/chat/completions'

// ── Teaching prompt ────────────────────────────────────────────────────────

const TEACHING_PROMPT = `
You are the AI professor for Mathematical Systems Studio, a beautiful interactive visualisation of pure mathematics. Your student sees a live 3-D visualisation and can interact with its parameters in real time.

Write with the clarity and precision of a university mathematics textbook. Always use $...$ for inline math and $$...$$ for display equations (LaTeX notation). Define every symbol the first time it appears.

For every normal explanation, organize the answer as study notes with Markdown headings. Use short paragraphs and visible steps instead of a wall of text. Prefer this structure unless the student asks for something else:

## 1. Direct Answer
Answer the question in 2 or 3 sentences.

## 2. Equation
Show the central equation in $$...$$ and define the symbols that matter for this question.

## 3. What You Are Seeing
Connect the equation to the live visual: axes, color, trail, surface, symmetry, or motion.

## 4. Try This
Give one concrete parameter experiment the student can run immediately.

For full lesson requests, use 5 to 7 short sections. For variable guide requests, use bullets under each symbol. For real-world example requests, use labeled examples and explain the visual connection.

─────────────────────────────────────────────────────────────────────────────
MODE-SPECIFIC KNOWLEDGE

Surfaces
  Gaussian curvature K measures how a surface curves in two independent directions simultaneously.
  Domain-colour key: blue = saddle (K < 0), yellow = dome (K > 0), cream = flat / cylindrical (K ≈ 0).
  Gauss–Bonnet: ∬K dA = 2πχ — total curvature equals 2π times the Euler characteristic.
  Distortions: twist rotates each horizontal slice by an angle proportional to y; inflate pushes vertices along their surface normals; noise adds fractal (fBm) displacement along normals; pinch compresses the surface inward near the poles.
  Hopf fibration η: S³ → S² — every point on S² has a circle (fiber) as its pre-image; the entire 3-sphere decomposes into these circles with no two touching.
  Morse theory: the level sets {f = t} of the height function on a torus change topological type at exactly four critical values corresponding to the max, two saddles, and the min.

Knots
  Torus knot T(p, q) winds p times around the longitude of a torus and q times through its hole.
  If gcd(p, q) = 1 the curve is a single knot; if gcd(p, q) = g > 1 the curve is a torus link with g components.
  The parallel transport frame avoids the spinning artefacts of the Frenet–Serret frame near inflection points by transporting the normal vector along the curve without unnecessary rotation.
  Writhe = sinusoidal normal perturbation — it adds a wobble but does not change the knot type.
  Borromean rings: three circles that are pairwise unlinked yet collectively linked — removing any one ring frees the other two.

Complex Analysis
  Domain colouring: hue = arg(f(z)) / 2π (full colour wheel = one full rotation of the argument), height = |f(z)| clamped to prevent infinite spikes.
  Poles create upward spikes; colour cycles 360° around each pole in the positive direction.
  Zeros touch the floor; colour cycles in the opposite direction.
  Branch cuts are lines of colour discontinuity — they mark where the multi-valued function's sheet was cut to make it single-valued.
  The Riemann sphere realises ℂ ∪ {∞} as a compact geometric object via stereographic projection from the north pole (which corresponds to ∞).
  A multi-sheeted Riemann surface shows all branches of a function simultaneously; √z has 2 sheets, log z has infinitely many.

Attractors
  The system is deterministic — the same initial condition always produces the same trajectory.
  Chaos = sensitive dependence: two trajectories starting arbitrarily close diverge exponentially.
  The attractor is the limiting set the system keeps returning to regardless of starting point.

Fourier
  Each epicycle represents one frequency component; its radius is the amplitude, its rotation speed is the frequency.
  Adding more terms adds detail; near a sharp jump the partial sum overshoots by ~9% (Gibbs phenomenon) no matter how many terms are added.

Lissajous
  The curve closes if and only if the frequency ratio a : b is rational.
  Phase δ = π/2 produces an ellipse; δ = 0 produces a straight line.

Rose Curves
  r = cos(kθ) produces k petals if k is odd, 2k petals if k is even.
  The 3-D lift adds z = cos(mθ), creating spherical-harmonic–like shapes.
─────────────────────────────────────────────────────────────────────────────

Style rules:
- Sound like a patient, eloquent professor who genuinely loves this subject.
- Use precise language but define every term on first use.
- Prefer concrete geometric descriptions over purely abstract ones.
- Never mention internal implementation details (Three.js, BufferGeometry, shader code, etc.).
- Give at most one real-world application, only when it genuinely fits the question.
- If lessonContext is provided, treat it as trusted exhibit notes from the project author and use it to shape the explanation.
`.trim()

// ── Helpers ────────────────────────────────────────────────────────────────

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  })
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function compactContext(body) {
  const intent = body.intent ?? 'explain'

  if (intent === 'params' || intent === 'equation') {
    return {
      mode:        body.mode,
      requestKind: body.requestKind,
      equation:    body.equation,
      params:      body.params,
      extra: body.extra ? {
        exhibit:   body.extra.exhibit ?? null,
        attractor: body.extra.attractor ?? null,
        function:  body.extra.function ?? null,
        note:      body.extra.note ?? null,
      } : null,
      schema: body.schema,
    }
  }

  const context = {
    mode:          body.mode,
    requestKind:   body.requestKind,
    equation:      body.equation,
    params:        body.params,
    extra:         body.extra,
    lessonContext: body.lessonContext,
    schema:        body.schema,
  }
  const encoded = JSON.stringify(context)
  if (encoded.length <= MAX_CONTEXT_CHARS) return context

  return {
    mode:          body.mode,
    requestKind:   body.requestKind,
    equation:      body.equation,
    params:        body.params,
    lessonContext: body.lessonContext,
    extra: {
      note:           'Context shortened — exceeded size limit.',
      exhibit:        body.extra?.exhibit,
      equations:      body.extra?.equations,
      interpretation: body.extra?.interpretation,
      axes:           body.extra?.axes,
    },
    schema: body.schema,
  }
}

// ── Groq streaming ─────────────────────────────────────────────────────────
// Groq uses the OpenAI-compatible SSE format:
//   data: {"choices":[{"delta":{"content":"..."},"finish_reason":null}]}
//   data: [DONE]

async function streamGroq(body, apiKey, groqModel) {
  const phaseInstr = body.requestKind === 'auto'
    ? '\n\nRespond using EXACTLY these three markers, each on its own line, with nothing before the first:\n[INTUITION]\n[EQUATIONS]\n[BEHAVIOR]'
    : ''

  const userMessage = [
    `Student question: ${body.question}${phaseInstr}`,
    '',
    'Current visualisation context (JSON):',
    JSON.stringify(compactContext(body), null, 2),
  ].join('\n')

  // Build conversation history in OpenAI format (user/assistant roles)
  const priorMessages = (body.conversationHistory ?? []).map(m => ({
    role:    m.role === 'model' ? 'assistant' : 'user',
    content: String(m.content).slice(0, 4000),
  }))

  // Enforce strictly alternating user/assistant, starting with user
  const safeMessages = []
  for (const msg of priorMessages) {
    const expected = safeMessages.length % 2 === 0 ? 'user' : 'assistant'
    if (msg.role === expected) safeMessages.push(msg)
  }

  const baseTokens = ['lesson', 'variables', 'examples'].includes(body.requestKind)
    ? 2400
    : MAX_TOKENS
  const maxTokens = body.responseLimit
    ? Math.min(Math.max(body.responseLimit, 160), baseTokens)
    : baseTokens

  const upstream = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       groqModel,
      max_tokens:  maxTokens,
      temperature: 0.7,
      stream:      true,
      messages: [
        { role: 'system', content: TEACHING_PROMPT },
        ...safeMessages,
        { role: 'user',   content: userMessage },
      ],
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const message = await upstream.text()
    console.error('[ask] Groq error', upstream.status, message)
    return json({ error: 'Groq request failed', message, status: upstream.status }, { status: 502 })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader()
      let   buffer = ''

      const handleLine = line => {
        if (!line.startsWith('data:')) return
        const dataText = line.slice(5).trim()
        if (!dataText || dataText === '[DONE]') {
          if (dataText === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
          return
        }

        try {
          const payload = JSON.parse(dataText)
          const delta   = payload.choices?.[0]?.delta
          const text    = delta?.content
          if (text) {
            controller.enqueue(encoder.encode(
              sse('delta', { type: 'delta', delta: text }),
            ))
          }
          if (payload.choices?.[0]?.finish_reason === 'stop') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
        } catch {
          // Malformed JSON — skip silently
        }
      }

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) handleLine(line.trimEnd())
        }
        if (buffer.trim()) handleLine(buffer.trimEnd())
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        controller.enqueue(encoder.encode(
          sse('error', {
            type:    'error',
            message: err instanceof Error ? err.message : 'Stream failed',
          }),
        ))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      ...CORS_HEADERS,
    },
  })
}

// ── Edge Function handler ──────────────────────────────────────────────────

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return json({ ok: true, endpoint: '/ask', method: 'POST required' }, { status: 405 })
  }

  const apiKey = (typeof Netlify !== 'undefined' ? Netlify.env.get('GROQ_API_KEY') : null)
    ?? Deno.env.get('GROQ_API_KEY')
  const groqModel = (typeof Netlify !== 'undefined' ? Netlify.env.get('GROQ_MODEL') : null)
    ?? Deno.env.get('GROQ_MODEL')
    ?? GROQ_MODEL_DEFAULT
  if (!apiKey) {
    return json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
  }

  let body
  try {
    const bodyText = await request.text()
    if (bodyText.length > MAX_BODY_CHARS) {
      return json({ error: 'Request too large' }, { status: 413 })
    }
    body = JSON.parse(bodyText)
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.question || typeof body.question !== 'string') {
    return json({ error: 'Missing question' }, { status: 400 })
  }
  body.question = body.question.trim().slice(0, MAX_QUESTION_CHARS)

  return streamGroq(body, apiKey, groqModel)
}
