/**
 * WorshipFlow Text Formatting Utilities
 *
 * CSS `text-transform: capitalize` has a known bug where it capitalizes the
 * character immediately after an apostrophe (e.g. "Eagle'S Wings").
 * These helpers fix that at the JS/render layer so display is always correct
 * regardless of how data was entered.
 */

/**
 * Safe title-case: capitalizes the first letter of each true word.
 * Unlike CSS `capitalize`, this does NOT capitalize after apostrophes.
 *
 * Examples:
 *   "eagle's wings"  → "Eagle's Wings"   ✅
 *   "Eagle'S Wings"  → "Eagle's Wings"   ✅ (fixes bad stored data)
 *   "i'll fly away"  → "I'll Fly Away"   ✅
 */
export function toSafeTitle(str: string): string {
  if (!str) return str;
  // Split on spaces only — never split on apostrophe
  return str
    .split(" ")
    .map(word => {
      if (!word) return word;
      // Lowercase the whole word first, then uppercase only the very first char
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Sentence-case: only capitalizes the first character of the entire string.
 * Use for UI labels rendered with Tailwind `capitalize` replaced by JS.
 */
export function toSentenceCase(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
