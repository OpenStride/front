import type { Sample } from '@/types/activity'

export function makeSamples(options: { km?: number; secPerKm?: number } = {}): Sample[] {
  const km = options.km ?? 1
  const secPerKm = options.secPerKm ?? 300 // 5 min par km
  const totalSeconds = Math.floor(km * secPerKm)
  const speed = 1000 / secPerKm // m/s
  const out: Sample[] = [] as Sample[]
  let distance = 0
  let elevation = 100
  for (let t = 0; t <= totalSeconds; t++) {
    // distance linéaire
    distance = speed * t
    // variation douce d'altitude
    if (t % 60 === 0 && t !== 0) elevation += (t / 60) % 2 === 0 ? 5 : -3
    out.push({
      time: t,
      distance,
      elevation,
      heartRate: 140 + Math.round(Math.sin(t / 15) * 8),
      cadence: 160 + Math.round(Math.sin(t / 10) * 5),
      speed
    } as Sample)
  }
  return out
}
