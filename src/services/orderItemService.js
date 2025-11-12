import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildSelectColumns } = queryHelper;

/**
 * Service layer: Order Items CRUD (pure DB logic)
 */
const orderItemService = {
  /**
   * List order items with pagination, filters, and soft delete handling
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedFilters = ["order_id", "product_id"];
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

    const where = buildFiltersWhere({
      filters,
      allowedColumns: allowedFilters,
      alias: "oi",
    });

    const softDeleteFilter = buildSoftDeleteScope("oi", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at"],
        alias: "oi",
      }) || "ORDER BY oi.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "oi",
      columns: ["id", "order_id", "product_id", "quantity", "price", "created_at", "updated_at"],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM order_items oi
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM order_items oi ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
  },

  /**
   * Get single order item by ID
   */
  async getById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);
    const sql = `
      SELECT id, order_id, product_id, quantity, price, created_at, updated_at, deleted_at
      FROM order_items
      WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Create new order item
   */
  async create(data) {
    if (data.quantity == null || data.quantity <= 0 || data.price == null || data.price < 0) {
      const err = new Error("Invalid quantity or price");
      err.status = 400;
      throw err;
    }

    const id = uuidv4();
    const sql = `
      INSERT INTO order_items (id, order_id, product_id, quantity, price)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, order_id, product_id, quantity, price, created_at
    `;
    const { rows } = await db.query(sql, [
      id,
      data.order_id,
      data.product_id,
      data.quantity,
      data.price,
    ]);
    return rows[0];
  },

  /**
   * Update existing order item
   */
  async update(id, data) {
    if (data.quantity != null && data.quantity <= 0) {
      const err = new Error("Quantity must be greater than 0");
      err.status = 400;
      throw err;
    }
    if (data.price != null && data.price < 0) {
      const err = new Error("Price must be greater or equal to 0");
      err.status = 400;
      throw err;
    }

    const sql = `
      UPDATE order_items
      SET
        order_id = COALESCE($2, order_id),
        product_id = COALESCE($3, product_id),
        quantity = COALESCE($4, quantity),
        price = COALESCE($5, price),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, order_id, product_id, quantity, price, updated_at
    `;
    const { rows } = await db.query(sql, [
      id,
      data.order_id,
      data.product_id,
      data.quantity,
      data.price,
    ]);
    return rows[0] || null;
  },

  /**
   * Soft delete an order item
   */
  async remove(id) {
    const sql = `
      UPDATE order_items
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default orderItemService;
