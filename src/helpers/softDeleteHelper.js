/**
 * @module helpers/softDeleteHelper
 * Utility for building soft-delete aware WHERE clauses.
 *
 * Common usage:
 *   const { sql, params } = buildSoftDeleteScope("u", "active");
 *   // => { sql: "u.deleted_at IS NULL", params: [] }
 *
 * Modes:
 * - "active"   → deleted_at IS NULL
 * - "deleted"  → deleted_at IS NOT NULL
 * - "inactive" → status = 'INACTIVE'
 * - "all"      → no filter applied
 */

/**
 * Build a soft-delete scope clause.
 *
 * @param {string} [alias=""] - Optional table alias (e.g., "u")
 * @param {"active"|"deleted"|"inactive"|"all"} [mode="active"] - Filter mode
 * @returns {{ sql: string, params: any[] }}
 */
export function buildSoftDeleteScope(alias = "", mode = "active") {
  // Normalize alias safely
  const prefix = alias ? `${alias.trim()}.` : "";

  // Normalize mode input
  const normalizedMode = String(mode || "active").toLowerCase();

  switch (normalizedMode) {
    case "deleted":
      return { sql: `${prefix}deleted_at IS NOT NULL`, params: [] };

    case "inactive":
      // Optional helper mode when "status" column tracks logical inactivity
      return { sql: `${prefix}status = 'INACTIVE'`, params: [] };

    case "all":
      return { sql: "", params: [] };

    default:
      return { sql: `${prefix}deleted_at IS NULL`, params: [] };
  }
}

/**
 * Validate soft-delete mode input and default to "active" if invalid.
 *
 * @param {string} mode
 * @returns {"active"|"deleted"|"inactive"|"all"}
 */
export function normalizeSoftDeleteMode(mode) {
  const allowed = ["active", "deleted", "inactive", "all"];
  if (!allowed.includes(mode)) return "active";
  return mode;
}

export default { buildSoftDeleteScope, normalizeSoftDeleteMode };
