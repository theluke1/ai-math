/**
 * cursor-trail.js
 *
 * Canvas-overlay particle trail that follows the cursor.
 * Spawns glowing amber/aqua sparks along the cursor path; each fades
 * as it drifts outward, creating an organic comet-tail effect.
 *
 * Rendered on a transparent <canvas> sitting above the WebGL surface
 * (z-index 9000) so it composites with bloom without interfering.
 */

export function initCursorTrail() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;top:0;left:0;pointer-events:none;z-index:9000;'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  function resize() {
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const particles = []
  let lastX = -1000, lastY = -1000

  window.addEventListener('mousemove', e => {
    const dx   = e.clientX - lastX
    const dy   = e.clientY - lastY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 3) return

    // More particles for faster movement
    const count = Math.min(5, Math.floor(dist / 5) + 1)
    for (let i = 0; i < count; i++) {
      const amber = Math.random() < 0.65
      particles.push({
        x:     e.clientX + (Math.random() - 0.5) * 14,
        y:     e.clientY + (Math.random() - 0.5) * 14,
        vx:    (Math.random() - 0.5) * 2.8,
        vy:    (Math.random() - 0.5) * 2.8 - 0.7,
        life:  0.65 + Math.random() * 0.55,
        size:  Math.random() * 2.2 + 0.6,
        amber,
      })
    }
    lastX = e.clientX
    lastY = e.clientY

    if (particles.length > 180) particles.splice(0, particles.length - 180)
  })

  function tick() {
    requestAnimationFrame(tick)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= 0.026
      if (p.life <= 0) { particles.splice(i, 1); continue }
      p.x  += p.vx
      p.y  += p.vy
      p.vx *= 0.93
      p.vy *= 0.93

      const r = Math.max(0.2, p.size * p.life)
      const a = p.life * 0.72

      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = p.amber
        ? `rgba(232,197,71,${a})`
        : `rgba(168,201,200,${a})`
      ctx.fill()
    }
  }
  tick()
}
