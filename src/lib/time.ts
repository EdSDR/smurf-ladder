const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function ago(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'never'
  const s = Math.round((ts - now) / 1000)
  const abs = Math.abs(s)
  if (abs < 60) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

export function daysSince(ts: number | null | undefined, now = Date.now()) {
  return ts ? Math.floor((now - ts) / 86_400_000) : null
}
