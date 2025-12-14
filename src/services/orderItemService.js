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

  async recalcOrderTotal(order_id) {
    const { rows } = await db.query(
      `
      SELECT COALESCE(SUM(quantity * price), 0) AS total
      FROM order_items
      WHERE order_id = $1 AND deleted_at IS NULL
    `,
      [order_id]
    );

    const total = Number(rows[0]?.total || 0);

    await db.query(
      `
      UPDATE orders
      SET total_amount = $2, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `,
      [order_id, total]
    );

    return total;
  },

  /**
   * List order items with pagination, filters, and soft delete handling
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedFilters = ["order_id", "product_id"];
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

    const where = buildFiltersWhere({
      filters,
      rawQuery: queryParams,
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

    // validate order exists + not completed
    const { rows: orderRows } = await db.query(
      `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [data.order_id]
    );
    if (!orderRows.length) {
      const err = new Error("Order not found");
      err.status = 404;
      throw err;
    }
    if (orderRows[0].status === "COMPLETED") {
      const err = new Error("Cannot add items to a completed order");
      err.status = 400;
      throw err;
    }

    // validate product stock
    const { rows: stockRows } = await db.query(
      `SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL`,
      [data.product_id]
    );
    if (!stockRows.length) {
      const err = new Error(`Product ${data.product_id} not found`);
      err.status = 404;
      throw err;
    }

    const stock = Number(stockRows[0].stock);
    if (data.quantity > stock) {
      const err = new Error(
        `Product ${data.product_id} has only ${stock} units in stock, cannot order ${data.quantity}`
      );
      err.status = 400;
      throw err;
    }

    // INSERT
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

    // Recalculate order total
    await recalcOrderTotal(data.order_id);

    return rows[0];
  },

  /**
   * Update existing order item
   */
  async update(id, data) {
    // 1. Load current item
    const { rows: curRows } = await db.query(
      `SELECT order_id, product_id, quantity FROM order_items WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!curRows.length) {
      const err = new Error("Order item not found");
      err.status = 404;
      throw err;
    }

    const current = curRows[0];

    // 2. Load order status
    const { rows: orderRows } = await db.query(
      `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [current.order_id]
    );
    if (!orderRows.length) {
      const err = new Error("Order not found");
      err.status = 404;
      throw err;
    }

    if (orderRows[0].status === "COMPLETED") {
      const err = new Error("Cannot update items of a completed order");
      err.status = 400;
      throw err;
    }

    // 3. Validate quantity/price
    if (data.quantity != null && data.quantity <= 0) {
      const err = new Error("Quantity must be greater than 0");
      err.status = 400;
      throw err;
    }
    if (data.price != null && data.price < 0) {
      const err = new Error("Price must be >= 0");
      err.status = 400;
      throw err;
    }

    // 4. Prevent changing product_id in update
    if (data.product_id && data.product_id !== current.product_id) {
      const err = new Error("Cannot change product of an existing item");
      err.status = 400;
      throw err;
    }

    // 5. Validate stock if quantity increases
    if (data.quantity != null) {
      const newQty = data.quantity;
      const oldQty = Number(current.quantity);

      if (newQty > oldQty) {
        const { rows: stockRows } = await db.query(
          `SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL`,
          [current.product_id]
        );

        if (!stockRows.length) {
          const err = new Error(`Product ${current.product_id} not found`);
          err.status = 404;
          throw err;
        }

        const stock = Number(stockRows[0].stock);
        const diff = newQty - oldQty;

        if (diff > stock) {
          const err = new Error(
            `Cannot update quantity: increase of ${diff} exceeds available stock (${stock})`
          );
          err.status = 400;
          throw err;
        }
      }
    }

    // 6. Perform UPDATE
    const sql = `
      UPDATE order_items
      SET
        quantity = COALESCE($2, quantity),
        price = COALESCE($3, price),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, order_id, product_id, quantity, price, updated_at
    `;

    const { rows } = await db.query(sql, [id, data.quantity, data.price]);
    const updated = rows[0] || null;

    // Recalculate total
    if (updated) {
      await recalcOrderTotal(data.order_id);
    }

    return updated;
  },

  /**
   * Soft delete an order item
   */
  async remove(id) {
    // load order_id first
    const { rows } = await db.query(
      `SELECT order_id FROM order_items WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!rows.length) return false;

    const order_id = rows[0].order_id;

    const { rows: orderRows } = await db.query(
      `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
      [order_id]
    );

    if (!orderRows.length) {
      const err = new Error("Order not found");
      err.status = 404;
      throw err;
    }

    if (orderRows[0].status === "COMPLETED") {
      const err = new Error("Cannot delete items of a completed order");
      err.status = 400;
      throw err;
    }

    const sql = `
      UPDATE order_items
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);

    // Recalculate total if deleted
    if (rowCount > 0) {
      await recalcOrderTotal(order_id);
      return true;
    }

    return false;
  },
};

export default orderItemService;
