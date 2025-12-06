import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Cart Item CRUD + business rules
 * Pure DB + business logic (NO owner/role logic here)
 */
const cartItemService = {

  /**
   * List cart items (admin use)
   * Note: Hard delete → no deleted_at filter anymore
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

    const { whereSql, params } = mergeWhereParts([where]);

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
   * Get cart item by ID
   */
  async getById(id) {
    const sql = `
      SELECT id, cart_id, product_id, quantity, created_at, updated_at
      FROM cart_items
      WHERE id = $1
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Validate cart exists
   */
  async _validateCart(cart_id) {
    const sql = `
      SELECT id, user_id, guest_token, status
      FROM carts
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rows } = await db.query(sql, [cart_id]);
    return rows[0] || null;
  },

  /**
   * Validate product exists
   */
  async _validateProduct(product_id) {
    const sql = `
      SELECT id, price, stock, status
      FROM products
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rows } = await db.query(sql, [product_id]);
    return rows[0] || null;
  },

  /**
   * Add an item into cart
   * If exists → increase quantity
   * If not → insert new item
   */
  async addItem(cart_id, product_id, quantity = 1) {
    if (quantity <= 0) {
      const e = new Error("Quantity must be greater than 0");
      e.status = 400;
      throw e;
    }

    const cart = await this._validateCart(cart_id);
    if (!cart) {
      const e = new Error("Cart not found");
      e.status = 404;
      throw e;
    }

    const product = await this._validateProduct(product_id);
    if (!product) {
      const e = new Error("Product not found");
      e.status = 404;
      throw e;
    }

    const stock = Number(product.stock);
    const reqQty = Number(quantity);

    if (reqQty > stock) {
      const e = new Error(`Số lượng yêu cầu (${reqQty}) vượt quá tồn kho (${stock})`);
      e.status = 400;
      throw e;
    }

    // Check duplicate (hard delete → no deleted_at filter)
    const existingSql = `
      SELECT id, quantity
      FROM cart_items
      WHERE cart_id = $1 AND product_id = $2
      LIMIT 1
    `;
    const { rows: existRows } = await db.query(existingSql, [cart_id, product_id]);
    const exists = existRows[0];

    if (exists) {
      const newQty = Number(exists.quantity) + Number(quantity);
      if (newQty > stock) {
        const e = new Error(`Số lượng mới (${newQty}) vượt quá tồn kho (${stock})`);
        e.status = 400;
        throw e;
      }
      const sql = `
        UPDATE cart_items
        SET quantity = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, cart_id, product_id, quantity, updated_at
      `;
      const { rows } = await db.query(sql, [exists.id, newQty]);
      return rows[0];
    }

    const id = uuidv4();
    const sql = `
      INSERT INTO cart_items (id, cart_id, product_id, quantity)
      VALUES ($1, $2, $3, $4)
      RETURNING id, cart_id, product_id, quantity, created_at
    `;

    const { rows } = await db.query(sql, [id, cart_id, product_id, quantity]);
    return rows[0];
  },

  /**
   * Update item QUANTITY only
   */
  async updateQuantity(itemId, quantity) {
    if (quantity <= 0) {
      const e = new Error("Quantity must be greater than 0");
      e.status = 400;
      throw e;
    }

    // Lấy product_id để check stock
    const itemRow = await db.query(
      `SELECT product_id FROM cart_items WHERE id = $1`,
      [itemId]
    );
    if (!itemRow.rows.length) return null;

    const product = await this._validateProduct(itemRow.rows[0].product_id);
    if (!product) {
      const e = new Error("Product not found");
      e.status = 404;
      throw e;
    }

    const stock = Number(product.stock);
    if (Number(quantity) > stock) {
      const e = new Error(`Số lượng mới (${quantity}) vượt quá tồn kho (${stock})`);
      e.status = 400;
      throw e;
    }

    const sql = `
      UPDATE cart_items
      SET quantity = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, cart_id, product_id, quantity, updated_at
    `;
    const { rows } = await db.query(sql, [itemId, quantity]);
    return rows[0] || null;
  },

  /**
   * Get cart_id of item for owner check
   */
  async getcart_idByItem(itemId) {
    const sql = `
      SELECT cart_id
      FROM cart_items
      WHERE id = $1
    `;
    const { rows } = await db.query(sql, [itemId]);
    return rows[0]?.cart_id || null;
  },

  /**
   * Remove cart item (HARD DELETE)
   */
  async remove(itemId) {
    const sql = `
      DELETE FROM cart_items
      WHERE id = $1
    `;
    const { rowCount } = await db.query(sql, [itemId]);
    return rowCount > 0;
  },

  /**
   * Clear entire cart (HARD DELETE)
   */
  async clear(cart_id) {
    const sql = `
      DELETE FROM cart_items
      WHERE cart_id = $1
    `;
    const { rowCount } = await db.query(sql, [cart_id]);
    return rowCount > 0;
  },

  /**
   * Get all items of a cart
   */
  async getItemsByCart(cart_id) {
    const sql = `
      SELECT id, cart_id, product_id, quantity, created_at, updated_at
      FROM cart_items
      WHERE cart_id = $1
      ORDER BY created_at ASC
    `;
    const { rows } = await db.query(sql, [cart_id]);
    return rows;
  },
};

export default cartItemService;
