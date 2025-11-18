import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";
import { getRequestContext } from "../middlewares/requestContext.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildGlobalSearch,
  buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Addresses CRUD (pure DB logic)
 */
const addressService = {
  /**
   * List addresses with pagination, filters, and search
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    // Allowed filters/sort/search columns
    const allowedColumns = ["user_id", "full_name", "phone", "postal_code", "is_default"];
    const searchColumns = ["full_name", "phone", "address_line", "postal_code"];

    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const searchText = queryParams.q;

    const { user_id, role } = getRequestContext();

    // Inject auto user_id filter for CUSTOMER
    if (role !== "ADMIN") {
      filters.push({
        field: "user_id",
        op: "eq",
        value: user_id,
      });
    }

    const search = buildGlobalSearch({
      q: searchText,
      columns: searchColumns,
      alias: "a",
    });

    const where = buildFiltersWhere({
      filters,
      allowedColumns,
      alias: "a",
    });

    const softDeleteFilter = buildSoftDeleteScope("a", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, search, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at", "full_name"],
        alias: "a",
      }) || "ORDER BY a.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "a",
      columns: [
        "id",
        "user_id",
        "full_name",
        "phone",
        "address_line",
        "address_line2",
        "postal_code",
        "is_default",
        "created_at",
        "updated_at",
      ],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM addresses a
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM addresses a ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const meta = buildPageMeta({ total, page, pageSize });
    return { data: rows, meta };
  },

  /**
   * Get single address by ID
   */
  async getById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);
    const sql = `
      SELECT
        id, user_id, full_name, phone, address_line, address_line2,
        postal_code, is_default, created_at, updated_at, deleted_at
      FROM addresses
      WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Create new address
   */
  async create(data) {
    const id = uuidv4();
    const sql = `
      INSERT INTO addresses (
        id, user_id, full_name, phone, address_line,
        address_line2, postal_code, is_default
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, user_id, full_name, phone, address_line,
                address_line2, postal_code, is_default, created_at
    `;
    const { rows } = await db.query(sql, [
      id,
      data.user_id,
      data.full_name,
      data.phone,
      data.address_line,
      data.address_line2,
      data.postal_code,
      data.is_default ?? false,
    ]);
    return rows[0];
  },

  /**
   * Update address
   */
  async update(id, data) {
    const sql = `
      UPDATE addresses
      SET
        user_id = COALESCE($2, user_id),
        full_name = COALESCE($3, full_name),
        phone = COALESCE($4, phone),
        address_line = COALESCE($5, address_line),
        address_line2 = COALESCE($6, address_line2),
        postal_code = COALESCE($7, postal_code),
        is_default = COALESCE($8, is_default),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, user_id, full_name, phone, address_line,
                address_line2, postal_code, is_default, updated_at
    `;
    const { rows } = await db.query(sql, [
      id,
      data.user_id,
      data.full_name,
      data.phone,
      data.address_line,
      data.address_line2,
      data.postal_code,
      data.is_default,
    ]);
    return rows[0] || null;
  },

  /**
   * Soft delete address
   */
  async remove(id) {
    const sql = `
      UPDATE addresses
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default addressService;
