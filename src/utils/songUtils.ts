// ── Song utility helpers ──────────────────────────────────────────────────

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Checks if a song is currently an active Future Line-Up song.
 * A song is ONLY in Future Line-Up if:
 * 1. `isFutureLineup` is explicitly `true`
 * 2. It was created LESS THAN 7 DAYS (1 week) ago.
 * 
 * If a song is >= 7 days old (or has invalid/missing date), it is automatically untagged.
 */
export function isSongFutureLineup(song: { isFutureLineup?: boolean; created_at?: string } | null | undefined): boolean {
  if (!song || song.isFutureLineup !== true) return false;
  if (!song.created_at) return false;

  const createdTime = new Date(song.created_at).getTime();
  if (isNaN(createdTime) || createdTime <= 0) return false;

  // Auto-expire once the song is 7 days or older
  if (Date.now() - createdTime >= SEVEN_DAYS_MS) {
    return false;
  }
  return true;
}
