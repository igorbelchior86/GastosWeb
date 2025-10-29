/**
 * Utilities for dealing with hashtag annotations in transaction descriptions.
 *
 * The parser is intentionally strict: it only considers hashtags that start
 * with `#`, followed by at least one letter/number, and stops at whitespace
 * or punctuation that is not a valid tag character. Supports common accents
 * via Unicode letter classes.
 */

// Accept two forms:
// 1) Simple hashtag: #mercado, #luz_agua (letters, numbers, underscore, dash)
// 2) Bracketed tag to allow spaces: #[Luz e água], #[Internet 1Gb]
// The second form captures everything until the closing bracket.
const HASHTAG_REGEX = /#(?:\[([^\]\n]+)\]|([\p{L}\p{N}_][\p{L}\p{N}_-]*))/u;

/**
 * Extract the first hashtag found in the provided text.
 *
 * @param {string} text Raw description typed by the user.
 * @returns {string|null} The hashtag including the `#` prefix, or null.
 */
export function extractFirstHashtag(text) {
  if (typeof text !== 'string' || !text.includes('#')) return null;
  const match = text.match(HASHTAG_REGEX);
  if (!match) return null;
  // If bracketed form matched, prefer group 1; otherwise use the whole match (group 0)
  if (match[1]) {
    const inner = String(match[1]).trim();
    if (!inner) return null;
    return `#${inner}`;
  }
  if (match[0]) return match[0];
  return null;
}
