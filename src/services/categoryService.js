import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildGlobalSearch, buildSelectColumns } = queryHelper;

const T = {
  entity: "Category",
  table: "categories",
  alias: "c",
  select: ["id", "name", "description", "created_at", "updated_at"],
  allowedFilters: ["name", "created_at"],
  allowedSort: ["name", "created_at"],
  searchColumns: ["name", "description"],
  mutable: ["name", "description"],
  uniqueTextKeys: ["name"],
};

function q(col) { return T.alias ? `${T.alias}.${col}` : col; }

async function assertUniqueTextOnCreate(data) {
  for (const key of T.uniqueTextKeys) {
    if (data[key] == null) continue;
    const sql = `SELECT 1 FROM ${T.table} WHERE LOWER(${key}) = LOWER($1) AND deleted_at IS NULL`;
    const { rowCount } = await db.query(sql, [String(data[key])]);
    if (rowCount > 0) { const e = new Error(`${T.entity} ${key} already exists`); e.status = 409; throw e; }
  }
}

async function assertUniqueTextOnUpdate(id, data) {
  for (const key of T.uniqueTextKeys) {
    if (data[key] == null) continue;
    const sql = `SELECT 1 FROM ${T.table} WHERE LOWER(${key}) = LOWER($1) AND id <> $2 AND deleted_at IS NULL`;
    const { rowCount } = await db.query(sql, [String(data[key]), id]);
    if (rowCount > 0) { const e = new Error(`${T.entity} ${key} already exists`); e.status = 409; throw e; }
  }
}

const categoriesService = {
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const search = buildGlobalSearch({ q: queryParams.q, columns: T.searchColumns, alias: T.alias });
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const where = buildFiltersWhere({ filters, allowedColumns: T.allowedFilters, alias: T.alias });

    // categories KHÔNG có cột status → tránh "inactive"
    let mode = String(queryParams.showDeleted || "active").toLowerCase();
    if (mode === "inactive") mode = "active";
    const softDeleteFilter = buildSoftDeleteScope(T.alias, mode);

    const { whereSql, params } = mergeWhereParts([softDeleteFilter, search, where]);

    const orderBy =
      buildOrderBy({ sortBy: queryParams.sortBy, sortDir: queryParams.sortDir, allowedSort: T.allowedSort, alias: T.alias }) ||
      `ORDER BY ${q("created_at")} DESC`;

    const selectColumns = buildSelectColumns({ alias: T.alias, columns: T.select, showDeleted: mode });

    const sql = `
      SELECT ${selectColumns}
      FROM ${T.table} ${T.alias}
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM ${T.table} ${T.alias} ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const meta = buildPageMeta({ total, page, pageSize });
    return { data: rows, meta };
  },

  async getById(id, showDeleted = "active") {
    let mode = String(showDeleted || "active").toLowerCase();
    if (mode === "inactive") mode = "active";
    const soft = buildSoftDeleteScope(T.alias, mode);
    const cols = buildSelectColumns({ alias: T.alias, columns: T.select, showDeleted: mode });
    const sql = `
      SELECT ${cols}
      FROM ${T.table} ${T.alias}
      WHERE ${q("id")} = $1 ${soft.sql ? `AND ${soft.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  async create(data) {
    await assertUniqueTextOnCreate(data);
    const id = uuidv4();

    const cols = [];
    const vals = [];
    const params = [id];

    for (const col of T.mutable) {
      if (Object.prototype.hasOwnProperty.call(data, col)) {
        cols.push(col);
        params.push(data[col]);
        vals.push(`$${params.length}`);
      }
    }

    const sql = `
      INSERT INTO ${T.table} (id${cols.length ? "," : ""} ${cols.join(", ")})
      VALUES ($1${vals.length ? "," : ""} ${vals.join(", ")})
      RETURNING ${T.select.join(", ")}
    `;
    const { rows } = await db.query(sql, params);
    return rows[0];
  },

  async update(id, data) {
    await assertUniqueTextOnUpdate(id, data);

    const sets = [];
    const params = [];
    for (const col of T.mutable) {
      if (Object.prototype.hasOwnProperty.call(data, col)) {
        params.push(data[col]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0) return this.getById(id);

    sets.push(`updated_at = now()`);
    const sql = `
      UPDATE ${T.table}
      SET ${sets.join(", ")}
      WHERE id = $${params.length + 1} AND deleted_at IS NULL
      RETURNING ${T.select.join(", ")}
    `;
    const { rows } = await db.query(sql, [...params, id]);
    return rows[0] || null;
  },

  async remove(id) {
    const sql = `
      UPDATE ${T.table}
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default categoriesService;
