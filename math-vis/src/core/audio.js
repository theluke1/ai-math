/**
 * audio.js — FFT analyser for microphone OR audio file input
 *
 * Two sources:
 *   enable()         — live microphone (original behaviour)
 *   enableFromFile() — decode a WAV/MP3/OGG File object chosen by the user
 *
 * Both produce the same .bass / .mid / .treble / .overall properties each frame.
 *
 * Frequency bands (256-bin FFT, smoothed):
 *   bass   — 0–10%  of bins  (~0–1.2 kHz)
 *   mid    — 10–45% of bins  (~1.2–5.5 kHz)
 *   treble — 45–100% of bins
 */
export class AudioReactive {
  constructor() {
    this._ctx      = null
    this._analyser = null
    this._source   = null   // MediaStreamSource or BufferSource
    this._data     = null
    this.enabled   = false

    this.bass    = 0
    this.mid     = 0
    this.treble  = 0
    this.overall = 0
  }

  // ---------------------------------------------------------------------------
  // Microphone input
  // ---------------------------------------------------------------------------

  async enable() {
    if (this._ctx) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      this._ctx    = new (window.AudioContext || window.webkitAudioContext)()
      const src    = this._ctx.createMediaStreamSource(stream)
      this._analyser = this._setupAnalyser()
      src.connect(this._analyser)
      this._source = src
      this._data   = new Uint8Array(this._analyser.frequencyBinCount)
      this.enabled = true
    } catch (err) {
      console.warn('[AudioReactive] mic access denied', err)
    }
  }

  // ---------------------------------------------------------------------------
  // File input — accepts a File object from an <input type="file"> picker
  // ---------------------------------------------------------------------------

  /**
   * Load and play a local audio file (WAV, MP3, OGG …).
   * Plays looping so it drives the visualiser continuously.
   * @param {File} file — File object from input.files[0]
   */
  async enableFromFile(file) {
    // Close any existing context/source first
    await this._teardown()

    try {
      this._ctx      = new (window.AudioContext || window.webkitAudioContext)()
      this._analyser = this._setupAnalyser()

      const arrayBuf = await file.arrayBuffer()
      const audioBuf = await this._ctx.decodeAudioData(arrayBuf)

      const src  = this._ctx.createBufferSource()
      src.buffer = audioBuf
      src.loop   = true
      src.connect(this._analyser)
      this._analyser.connect(this._ctx.destination)
      src.start(0)

      this._source = src
      this._data   = new Uint8Array(this._analyser.frequencyBinCount)
      this.enabled = true
    } catch (err) {
      console.warn('[AudioReactive] file load failed', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update() {
    if (!this.enabled || !this._analyser) return
    this._analyser.getByteFrequencyData(this._data)
    const N = this._data.length
    const b = Math.floor(N * 0.10)
    const m = Math.floor(N * 0.45)

    let bass = 0, mid = 0, treble = 0
    for (let i = 0; i < b; i++) bass   += this._data[i]
    for (let i = b; i < m; i++) mid    += this._data[i]
    for (let i = m; i < N; i++) treble += this._data[i]

    this.bass    = bass   / (b       * 255)
    this.mid     = mid    / ((m - b) * 255)
    this.treble  = treble / ((N - m) * 255)
    this.overall = this.bass * 0.5 + this.mid * 0.35 + this.treble * 0.15
  }

  // ---------------------------------------------------------------------------
  // Toggle — works for both mic and file sources
  // ---------------------------------------------------------------------------

  async toggle() {
    if (this.enabled) {
      await this._teardown()
    } else {
      await this.enable()
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Float data accessors — used by SignalMode for high-resolution analysis
  // ---------------------------------------------------------------------------

  /** Fill and return Float32Array of dB values (−Infinity to 0) for the current frame. */
  getFrequencyData(out = null) {
    if (!this._analyser) return null
    if (out && out.length >= this._analyser.frequencyBinCount) {
      this._analyser.getFloatFrequencyData(out)
      return out
    }
    if (!this._floatFreqBuf || this._floatFreqBuf.length !== this._analyser.frequencyBinCount) {
      this._floatFreqBuf = new Float32Array(this._analyser.frequencyBinCount)
    }
    this._analyser.getFloatFrequencyData(this._floatFreqBuf)
    return this._floatFreqBuf
  }

  /** Fill and return Float32Array of normalised time-domain samples (−1 to 1). */
  getTimeDomainData(out = null) {
    if (!this._analyser) return null
    if (out && out.length >= this._analyser.fftSize) {
      this._analyser.getFloatTimeDomainData(out)
      return out
    }
    if (!this._floatTimeBuf || this._floatTimeBuf.length !== this._analyser.fftSize) {
      this._floatTimeBuf = new Float32Array(this._analyser.fftSize)
    }
    this._analyser.getFloatTimeDomainData(this._floatTimeBuf)
    return this._floatTimeBuf
  }

  /** Change the analyser FFT size at runtime (power-of-two, 32–32768). */
  setFftSize(n) {
    if (!this._analyser) return
    this._analyser.fftSize       = n
    this._data                   = new Uint8Array(this._analyser.frequencyBinCount)
    this._floatFreqBuf           = null
    this._floatTimeBuf           = null
  }

  get fftSize()           { return this._analyser?.fftSize           ?? 512 }
  get frequencyBinCount() { return this._analyser?.frequencyBinCount ?? 256 }
  get sampleRate()        { return this._ctx?.sampleRate             ?? 44100 }
  get analyser()          { return this._analyser }
  get context()           { return this._ctx }

  // ---------------------------------------------------------------------------

  _setupAnalyser() {
    const a = this._ctx.createAnalyser()
    a.fftSize = 512
    a.smoothingTimeConstant = 0.78
    return a
  }

  async _teardown() {
    this.enabled = false
    this.bass = this.mid = this.treble = this.overall = 0
    if (this._source?.stop) {
      try { this._source.stop() } catch (_) {}
    }
    this._source = null
    if (this._ctx) {
      await this._ctx.close()
      this._ctx      = null
      this._analyser = null
    }
  }

  dispose() {
    this._teardown()
  }
}
