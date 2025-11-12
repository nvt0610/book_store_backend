import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Cart Items CRUD (pure DB logic)
 */
const cartItemService = {
  /**
   * List cart items with pagination, filters, and soft delete handling
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedFilters = ["cart_id", "product_id"];
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

    const where = buildFiltersWhere({
      filters,
      allowedColumns: allowedFilters,
      alias: "ci",
    });

    const softDeleteFilter = buildSoftDeleteScope("ci", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at"],
        alias: "ci",
      }) || "ORDER BY ci.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "ci",
      columns: ["id", "cart_id", "product_id", "quantity", "created_at", "updated_at"],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM cart_items ci
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM cart_items ci ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
  },

  /**
   * Get single cart item by ID
   */
  async getById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);
    const sql = `
      SELECT id, cart_id, product_id, quantity, created_at, updated_at, deleted_at
      FROM cart_items
      WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Create new cart item
   */
  async create(data) {
    if (data.quantity == null || data.quantity <= 0) {
      const err = new Error("Quantity must be greater than 0");
      err.status = 400;
      throw err;
    }

    const id = uuidv4();
    const sql = `
      INSERT INTO cart_items (id, cart_id, product_id, quantity)
      VALUES ($1, $2, $3, $4)
      RETURNING id, cart_id, product_id, quantity, created_at
    `;
    const { rows } = await db.query(sql, [id, data.cart_id, data.product_id, data.quantity]);
    return rows[0];
  },

  /**
   * Update existing cart item
   */
  async update(id, data) {
    if (data.quantity != null && data.quantity <= 0) {
      const err = new Error("Quantity must be greater than 0");
      err.status = 400;
      throw err;
    }

    const sql = `
      UPDATE cart_items
      SET
        cart_id = COALESCE($2, cart_id),
        product_id = COALESCE($3, product_id),
        quantity = COALESCE($4, quantity),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, cart_id, product_id, quantity, updated_at
    `;
    const { rows } = await db.query(sql, [id, data.cart_id, data.product_id, data.quantity]);
    return rows[0] || null;
  },

  /**
   * Soft delete a cart item
   */
  async remove(id) {
    const sql = `
      UPDATE cart_items
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default cartItemService;
