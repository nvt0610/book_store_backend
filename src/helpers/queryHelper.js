/**
 * @module helpers/queryHelper
 * Safe dynamic SQL query builder for PostgreSQL.
 * Protects against SQL injection by whitelisting columns and parameterizing values.
 * Supports flexible filters, search, and sorting logic.
 */

/**
 * Escape wildcard characters for LIKE/ILIKE patterns in PostgreSQL.
 * - Escapes '%' and '_' with a backslash.
 * - Blocks wildcard-only input (e.g., '%' or '__') by returning null.
 *
 * @param {string} value
 * @returns {string|null} Escaped pattern or null if invalid
 */
function escapeLikePattern(value) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Block wildcard-only patterns
  if (/^[%_]+$/.test(trimmed)) {
    return null;
  }

  // Escape special wildcard characters
  return trimmed.replace(/([%_])/g, "\\$1");
}

/**
 * Verify if a column is allowed (prevent SQL injection).
 * 
 * @param {string} column
 * @param {string[]} whitelist
 * @returns {boolean}
 */
function isAllowed(column, whitelist = []) {
  return whitelist.includes(column);
}

/**
 * Build a global text search query like: (col1 ILIKE $x OR col2 ILIKE $x)
 * 
 * @param {Object} opts
 * @param {string} opts.q - Search term
 * @param {string[]} opts.columns - Columns to search
 * @param {string} [opts.alias] - Optional table alias
 * @returns {{ sql: string, params: any[] }}
 */
export function buildGlobalSearch({ q, columns = [], alias }) {
  if (!q || !columns.length) return { sql: "", params: [] };

  const escaped = escapeLikePattern(q);
  if (escaped == null) return { sql: "", params: [] };

  const colPrefix = alias ? `${alias}.` : "";
  const params = columns.map(() => `%${escaped}%`);
  const colExprs = columns.map(
    (_, idx) => `${colPrefix}${columns[idx]} ILIKE $% ESCAPE '\\'`
  );

  return {
    sql: `(${colExprs.join(" OR ")})`,
    params,
  };
}

/**
 * Operator handlers map â€” each returns { sql, params }.
 * Supports scalar and array-based operators.
 */
const opHandlers = {
  eq: (col, v) => ({ sql: `${col} = $%`, params: [v] }),
  ne: (col, v) => ({ sql: `${col} <> $%`, params: [v] }),
  gt: (col, v) => ({ sql: `${col} > $%`, params: [v] }),
  gte: (col, v) => ({ sql: `${col} >= $%`, params: [v] }),
  lt: (col, v) => ({ sql: `${col} < $%`, params: [v] }),
  lte: (col, v) => ({ sql: `${col} <= $%`, params: [v] }),

  in: (col, v) => {
    const arr = Array.isArray(v) ? v : [v];
    if (!arr.length) return { sql: "1=0", params: [] };
    const placeholders = arr.map(() => "$%").join(",");
    return { sql: `${col} IN (${placeholders})`, params: arr };
  },

  notIn: (col, v) => {
    const arr = Array.isArray(v) ? v : [v];
    if (!arr.length) return { sql: "1=1", params: [] }; // no-op
    const placeholders = arr.map(() => "$%").join(",");
    return { sql: `${col} NOT IN (${placeholders})`, params: arr };
  },

  between: (col, v) => {
    if (!Array.isArray(v) || v.length !== 2)
      throw new Error("Operator 'between' expects [min, max]");
    return { sql: `${col} BETWEEN $% AND $%`, params: [v[0], v[1]] };
  },

  isNull: (col) => ({ sql: `${col} IS NULL`, params: [] }),
  isNotNull: (col) => ({ sql: `${col} IS NOT NULL`, params: [] }),

  like: (col, v) => {
    const escaped = escapeLikePattern(v);
    if (escaped == null) return { sql: "1=0", params: [] };
    return { sql: `${col} LIKE $% ESCAPE '\\'`, params: [`%${escaped}%`] };
  },

  ilike: (col, v) => {
    const escaped = escapeLikePattern(v);
    if (escaped == null) return { sql: "1=0", params: [] };
    return { sql: `${col} ILIKE $% ESCAPE '\\'`, params: [`%${escaped}%`] };
  },

  startsWith: (col, v) => {
    const escaped = escapeLikePattern(v);
    if (escaped == null) return { sql: "1=0", params: [] };
    return { sql: `${col} ILIKE $% ESCAPE '\\'`, params: [`${escaped}%`] };
  },

  endsWith: (col, v) => {
    const escaped = escapeLikePattern(v);
    if (escaped == null) return { sql: "1=0", params: [] };
    return { sql: `${col} ILIKE $% ESCAPE '\\'`, params: [`%${escaped}`] };
  },

  contains: (col, v) => {
    const escaped = escapeLikePattern(v);
    if (escaped == null) return { sql: "1=0", params: [] };
    return { sql: `${col} ILIKE $% ESCAPE '\\'`, params: [`%${escaped}%`] };
  },

  // PostgreSQL array/json operators
  arrayContains: (col, v) => ({ sql: `$% = ANY(${col})`, params: [v] }),
  overlap: (col, v) => {
    const arr = Array.isArray(v) ? v : [v];
    return { sql: `${col} && $%`, params: [arr] };
  },
  containsAll: (col, v) => {
    const arr = Array.isArray(v) ? v : [v];
    return { sql: `${col} @> $%`, params: [arr] };
  },
};

/**
 * Build a safe WHERE clause from a list of filters.
 *
 * @param {Object} opts
 * @param {{field: string, op?: string, value?: any}[]} [opts.filters=[]]
 * @param {string[]} [opts.allowedColumns=[]] - Columns allowed for filtering
 * @param {string} [opts.alias] - Table alias prefix
 * @returns {{ sql: string, params: any[] }}
 */
export function buildFiltersWhere({ filters = [], rawQuery = {}, allowedColumns = [], alias }) {
  const clauses = [];
  const params = [];
  const prefix = alias ? `${alias}.` : "";

  // Add friendly filters (Option A)
  for (const [field, rawValue] of Object.entries(rawQuery)) {
    if (!allowedColumns.includes(field)) continue;
    if (field === "filters") continue;

    if (rawValue !== undefined && rawValue !== null) {
      filters.push(parseFriendlyFilter(field, String(rawValue)));
    }
  }

  // Parse old filters[] (no changes)
  for (const f of filters) {
    if (!f || !f.field) continue;
    const field = String(f.field).trim();
    if (!isAllowed(field, allowedColumns)) continue;

    const op = String(f.op || "eq").trim();
    const handler = opHandlers[op];
    if (!handler) continue;

    try {
      const { sql, params: p } = handler(`${prefix}${field}`, f.value);
      clauses.push(sql);
      params.push(...p);
    } catch (err) {
      console.warn(`[queryHelper] Skipped invalid filter ${field}: ${err.message}`);
    }
  }

  if (!clauses.length) return { sql: "", params: [] };
  return {
    sql: clauses.map((c) => `(${c})`).join(" AND "),
    params,
  };
}

/**
 * Merge multiple WHERE parts (e.g., filters, search, soft-delete)
 * and auto-number parameter placeholders ($1, $2, ...).
 *
 * @param {{ sql: string, params: any[] }[]} parts
 * @returns {{ whereSql: string, params: any[] }}
 */
export function mergeWhereParts(parts = []) {
  const clauses = [];
  const params = [];
  let idx = 1;

  const pushPart = (rawSql, rawParams = []) => {
    if (!rawSql) return;
    let sql = rawSql;
    for (let i = 0; i < rawParams.length; i++) {
      sql = sql.replace("$%", `$${idx++}`);
    }
    clauses.push(sql);
    params.push(...rawParams);
  };

  for (const p of parts) {
    if (!p) continue;
    pushPart(p.sql, p.params);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { whereSql, params };
}

/**
 * Build a safe ORDER BY clause.
 *
 * @param {Object} opts
 * @param {string} opts.sortBy - Column name
 * @param {string} [opts.sortDir="DESC"] - ASC or DESC
 * @param {string[]} [opts.allowedSort=[]] - Whitelisted sortable columns
 * @param {string} [opts.alias] - Table alias
 * @returns {string}
 */
export function buildOrderBy({ sortBy, sortDir = "DESC", allowedSort = [], alias }) {
  if (!sortBy || !isAllowed(sortBy, allowedSort)) return "";
  const dir = String(sortDir).toUpperCase() === "ASC" ? "ASC" : "DESC";
  const col = `${alias ? alias + "." : ""}${sortBy}`;
  return `ORDER BY ${col} ${dir}`;
}

/**
 * Build a safe SELECT column list with optional deleted_at.
 *
 * @param {Object} opts
 * @param {string[]} opts.columns - Base column names (without alias)
 * @param {string} [opts.alias] - Optional table alias (e.g. "u" or "p")
 * @param {string} [opts.showDeleted="active"] - showDeleted query param
 * @returns {string} Comma-separated column list for SELECT
 *
 * @example
 * buildSelectColumns({ alias: "p", columns: ["id","name"], showDeleted: "all" })
 * // -> "p.id, p.name, p.deleted_at"
 */
export function buildSelectColumns({ columns = [], alias, showDeleted = "active" }) {
  const prefix = alias ? `${alias}.` : "";
  const colList = columns.map((c) => `${prefix}${c}`);
  if (showDeleted && showDeleted !== "active") {
    colList.push(`${prefix}deleted_at`);
  }
  return colList.join(", ");
}

export function parseFriendlyFilter(field, raw) {
  if (raw === "null") return { field, op: "isNull" };
  if (raw === "!=null") return { field, op: "isNotNull" };

  if (raw.startsWith(">")) return { field, op: "gt", value: raw.slice(1) };
  if (raw.startsWith("<")) return { field, op: "lt", value: raw.slice(1) };
  if (raw.startsWith(">=")) return { field, op: "gte", value: raw.slice(2) };
  if (raw.startsWith("<=")) return { field, op: "lte", value: raw.slice(2) };
  if (raw.startsWith("!=")) return { field, op: "ne", value: raw.slice(2) };

  if (raw.startsWith("~=")) return { field, op: "contains", value: raw.slice(2) };
  if (raw.startsWith("^=")) return { field, op: "startsWith", value: raw.slice(2) };
  if (raw.startsWith("$=")) return { field, op: "endsWith", value: raw.slice(2) };

  return { field, op: "eq", value: raw };
}


export default {
  buildGlobalSearch,
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildSelectColumns,
  parseFriendlyFilter,
};
