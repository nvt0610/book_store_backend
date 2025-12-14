/**
 * @module helpers/nameHelper
 * Utility functions for consistent name normalization.
 * Ensures full_name, first_name, and last_name are synchronized and sanitized.
 */

/**
 * Normalize and sanitize name fields.
 * - Always trims input values.
 * - If only first_name or last_name is provided â†’ combine to full_name.
 * - If only full_name is provided â†’ split into first_name + last_name.
 * - Returns sanitized string values or null.
 *
 * @param {Object} input
 * @param {string} [input.full_name]
 * @param {string} [input.first_name]
 * @param {string} [input.last_name]
 * @returns {{ full_name: string|null, first_name: string|null, last_name: string|null }}
 */
export function normalizeName({ full_name, first_name, last_name }) {
  // Sanitize input (trim & convert empty string â†’ null)
  full_name = typeof full_name === "string" ? full_name.trim() : null;
  first_name = typeof first_name === "string" ? first_name.trim() : null;
  last_name = typeof last_name === "string" ? last_name.trim() : null;

  // Derive full_name if missing
  if (!full_name && (first_name || last_name)) {
    full_name = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
  }
  // Derive first_name & last_name if missing
  else if (full_name && (!first_name || !last_name)) {
    const parts = full_name.split(/\s+/).filter(Boolean);
    first_name = parts[0] || null;
    last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;
  }

  return { full_name, first_name, last_name };
}

export default { normalizeName };
