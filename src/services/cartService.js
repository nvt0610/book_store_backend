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
 * Service layer: Cart CRUD + business logic
 */
const cartService = {
  /**
   * List carts with pagination and filters
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);
    const allowedFilters = ["user_id", "status"];
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

    const where = buildFiltersWhere({
      filters,
      allowedColumns: allowedFilters,
      alias: "c",
    });

    const softDeleteFilter = buildSoftDeleteScope("c", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at"],
        alias: "c",
      }) || "ORDER BY c.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "c",
      columns: ["id", "user_id", "status", "created_at", "updated_at"],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM carts c
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM carts c ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
  },

  /**
   * Get cart by ID (with items)
   */
  async getById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);
    const sql = `
      SELECT id, user_id, status, created_at, updated_at, deleted_at
      FROM carts
      WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    const cart = rows[0];
    if (!cart) return null;

    // Attach cart items
    const itemSql = `
      SELECT id, cart_id, product_id, quantity, created_at, updated_at
      FROM cart_items
      WHERE cart_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;
    const { rows: items } = await db.query(itemSql, [id]);
    cart.items = items;

    return cart;
  },

  /**
   * Get cart by user ID (active cart + items)
   */
  async getByUserId(userId, showDeleted = "active") {
    if (!userId) {
      const err = new Error("userId is required");
      err.status = 400;
      throw err;
    }

    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);
    const sql = `
    SELECT id, user_id, status, created_at, updated_at, deleted_at
    FROM carts
    WHERE user_id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    ORDER BY created_at DESC
    LIMIT 1
  `;
    const { rows } = await db.query(sql, [userId]);
    let cart = rows[0];

    // Lazy create nếu user chưa có cart
    if (!cart) {
      const createSql = `
      INSERT INTO carts (id, user_id, status)
      VALUES ($1, $2, 'ACTIVE')
      RETURNING id, user_id, status, created_at
    `;
      const id = uuidv4();
      const { rows: newCart } = await db.query(createSql, [id, userId]);
      cart = newCart[0];
    }

    // Lấy items của cart
    const itemSql = `
    SELECT id, cart_id, product_id, quantity, created_at, updated_at
    FROM cart_items
    WHERE cart_id = $1 AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;
    const { rows: items } = await db.query(itemSql, [cart.id]);
    cart.items = items;

    return cart;
  },

  /**
   * Create new cart
   */
  async create(data) {
    const id = uuidv4();
    const sql = `
      INSERT INTO carts (id, user_id, status)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, status, created_at
    `;
    const { rows } = await db.query(sql, [id, data.user_id, data.status || "ACTIVE"]);
    return rows[0];
  },

  /**
   * Update existing cart
   */
  async update(id, data) {
    const sql = `
      UPDATE carts
      SET
        user_id = COALESCE($2, user_id),
        status = COALESCE($3, status),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, user_id, status, updated_at
    `;
    const { rows } = await db.query(sql, [id, data.user_id, data.status]);
    return rows[0] || null;
  },

  /**
   * Soft delete cart
   */
  async remove(id) {
    const sql = `
      UPDATE carts
      SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default cartService;
