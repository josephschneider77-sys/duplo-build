let ctx: AudioContext | null = null

function context(): AudioContext | null {
  const AC = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

export function unlockAudio(): void {
  const audio = context()
  if (audio?.state === 'suspended') void audio.resume()
}

/** Soft candy pop for the clear burst — short, bright, not a crash. */
export function playBurst(): void {
  const audio = context()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const now = audio.currentTime
  const length = Math.floor(audio.sampleRate * 0.16)
  const buffer = audio.createBuffer(1, Math.max(1, length), audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const env = 1 - i / data.length
    data[i] = (Math.random() * 2 - 1) * env * env
  }
  const noise = audio.createBufferSource()
  noise.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(780, now)
  filter.frequency.exponentialRampToValueAtTime(1680, now + 0.1)
  filter.Q.value = 0.65
  const noiseGain = audio.createGain()
  noiseGain.gain.setValueAtTime(0.04, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(audio.destination)
  noise.start(now)
  noise.stop(now + 0.18)

  const chirps: Array<[number, number, number]> = [
    [380, 760, 0],
    [520, 1040, 0.045],
    [640, 1280, 0.09],
  ]
  for (const [startFreq, endFreq, offset] of chirps) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'triangle'
    const when = now + offset
    osc.frequency.setValueAtTime(startFreq, when)
    osc.frequency.exponentialRampToValueAtTime(endFreq, when + 0.11)
    gain.gain.setValueAtTime(0.045, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(when)
    osc.stop(when + 0.18)
  }
}

export function playPop(ok: boolean): void {
  const audio = context()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(ok ? 540 : 180, now)
  osc.frequency.exponentialRampToValueAtTime(ok ? 820 : 120, now + 0.09)
  gain.gain.setValueAtTime(0.07, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.12)
}