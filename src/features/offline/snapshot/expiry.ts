// R3 (Roberto, 2026-11-13): offline sales stop 7 days after the server last confirmed
// the session. Pending sales stay on the device either way.
export const OFFLINE_ACCESS_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export function offlineAccessEndsAt(confirmedAt: string) {
  return new Date(new Date(confirmedAt).getTime() + OFFLINE_ACCESS_DAYS * DAY_MS)
}

export function isOfflineAccessExpired(confirmedAt: string, now = new Date()) {
  return now.getTime() >= offlineAccessEndsAt(confirmedAt).getTime()
}

// Plain-language age for the desk: «de hoy», «de ayer», «de hace 3 días».
export function snapshotAge(confirmedAt: string, now = new Date()) {
  const days = Math.floor((now.getTime() - new Date(confirmedAt).getTime()) / DAY_MS)
  if (days <= 0) return 'de hoy'
  if (days === 1) return 'de ayer'
  return `de hace ${days} días`
}
