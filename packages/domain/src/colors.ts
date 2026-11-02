function hueOf(hex: string): number | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return null
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** The hue furthest from every colour already in use. */
export function suggestColor(existing: string[]): string {
  const hues = existing.map(hueOf).filter((h): h is number => h !== null)
  let best = 0
  let bestDistance = -1
  for (let h = 0; h < 360; h += 15) {
    const distance = Math.min(360, ...hues.map((u) => Math.min(Math.abs(h - u), 360 - Math.abs(h - u))))
    if (distance > bestDistance) {
      best = h
      bestDistance = distance
    }
  }
  return hslToHex(best, 0.65, 0.5)
}
