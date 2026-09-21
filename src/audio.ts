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