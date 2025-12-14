import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";
import { getRequestContext } from "../middlewares/requestContext.js";
import validate from "../helpers/validateHelper.js";
import inventoryService from "./inventoryService.js";
import {
  ensureAddressValid,
  ensureProductValid,
  ensureUserExists,
} from "../helpers/inputValidator.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildGlobalSearch,
  buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Orders CRUD + creation flows (cart, instant, manual)
 */
const orderService = {
  /**
   * List all orders with pagination, filters, and aggregated info
   */
  async listOrders(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedFilters = ["user_id", "status", "address_id"];
    const filters = Array.isArray(queryParams.filters)
      ? queryParams.filters
      : [];

    const { user_id, role } = getRequestContext();
    if (role !== "ADMIN") {
      filters.push({
        field: "user_id",
        op: "eq",
        value: user_id,
      });
    }

    const where = buildFiltersWhere({
      filters,
      rawQuery: queryParams,
      allowedColumns: allowedFilters,
      alias: "o",
    });

    const softDeleteFilter = buildSoftDeleteScope(
      "o",
      queryParams.showDeleted || "active"
    );

    const search = buildGlobalSearch({
      q: queryParams.q,
      columns: ["o.id::text", "o.status"],
      alias: "o",
    });

    const { whereSql, params } = mergeWhereParts([
      softDeleteFilter,
      search,
      where,
    ]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at", "placed_at", "paid_at", "status"],
        alias: "o",
      }) || "ORDER BY o.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "o",
      columns: [
        "id",
        "user_id",
        "address_id",
        "total_amount",
        "status",
        "placed_at",
        "paid_at",
        "created_at",
        "updated_at",
      ],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT 
        ${selectColumns},
        COALESCE(agg.item_count, 0)     AS item_count,
        COALESCE(agg.total_quantity, 0) AS total_quantity
      FROM orders o
      LEFT JOIN (
        SELECT 
          order_id,
          COUNT(*)              AS item_count,
          COALESCE(SUM(quantity), 0) AS total_quantity
        FROM order_items
        WHERE deleted_at IS NULL
        GROUP BY order_id
      ) AS agg
        ON agg.order_id = o.id
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM orders o
      ${whereSql}
    `;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return {
      data: rows,
      meta: buildPageMeta({ total, page, pageSize }),
    };
  },

  /**
   * Get single order with its order items
   */
  async getOrderById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("o", showDeleted);
    const sql = `
      SELECT 
        o.id, o.user_id, o.address_id, o.total_amount, o.status,
        o.placed_at, o.paid_at, o.created_at, o.updated_at, o.deleted_at
      FROM orders o
      WHERE o.id = $1 ${
        softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""
      }
    `;
    const { rows } = await db.query(sql, [id]);
    const order = rows[0];
    if (!order) return null;

    const itemsSql = `
      SELECT 
        oi.id, oi.product_id, oi.quantity, oi.price, oi.created_at, oi.updated_at
      FROM order_items oi
      WHERE oi.order_id = $1 AND oi.deleted_at IS NULL
      ORDER BY oi.created_at ASC
    `;
    const { rows: items } = await db.query(itemsSql, [id]);
    order.items = items;

    const paymentSql = `
      SELECT id, payment_method, amount, status, payment_ref, payment_date
      FROM payments
      WHERE order_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const { rows: payRows } = await db.query(paymentSql, [id]);
    order.payment = payRows[0] || null;

    return order;
  },

  /**
   * Create a new order using mode: 'cart' | 'instant' | 'manual'
   * Each new order automatically creates a corresponding pending payment
   */
  async createOrder({
    mode,
    payment_method = "COD",
    user_id,
    address_id,
    cart_id,
    product_id,
    item_ids,
    quantity = 1,
    items = [],
  }) {
    if (!mode) {
      const e = new Error("Missing mode (cart, instant, or manual)");
      e.status = 400;
      throw e;
    }

    const method = validate.paymentMethod(payment_method);

    switch (mode) {
      case "cart":
        return await this._createFromCart(
          cart_id,
          address_id,
          item_ids,
          method
        );

      case "instant": {
        const { user_id } = getRequestContext();
        return await this._createInstant(
          user_id,
          address_id,
          product_id,
          quantity,
          method
        );
      }

      case "manual": {
        if (!user_id) {
          const e = new Error("user_id is required for manual order");
          e.status = 400;
          throw e;
        }
      }

      default: {
        const e = new Error("Invalid order creation mode");
        e.status = 400;
        throw e;
      }
    }
  },

  /**
   * Create order directly from a cart (checkout)
   */
  async _createFromCart(cart_id, address_id, item_ids, payment_method) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      if (!Array.isArray(item_ids) || item_ids.length === 0) {
        throw new Error("item_ids must be a non-empty array");
      }

      // 1. Validate cart
      const { rows: carts } = await client.query(
        `SELECT id, user_id, status
       FROM carts
       WHERE id = $1 AND deleted_at IS NULL`,
        [cart_id]
      );

      if (!carts.length) throw new Error("Cart not found");
      const cart = carts[0];
      if (cart.status !== "ACTIVE") throw new Error("Cart is not ACTIVE");

      // 2. Validate address
      await ensureAddressValid(address_id, cart.user_id);

      const { user_id: ctxUser } = getRequestContext();
      if (cart.user_id !== ctxUser) {
        throw new Error("Cart does not belong to current user");
      }

      // 3. Load ONLY selected items
      const { rows: items } = await client.query(
        `
      SELECT ci.id AS cart_item_id, ci.product_id, ci.quantity, p.price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id AND p.deleted_at IS NULL
      WHERE ci.cart_id = $1
        AND ci.id = ANY($2::uuid[])
      `,
        [cart_id, item_ids]
      );

      if (!items.length) {
        throw new Error("Selected cart items not found");
      }

      // 4. Snapshot
      const snapshot = items.map((it) => ({
        product_id: it.product_id,
        quantity: Math.max(1, Number(it.quantity)),
        price: Number(it.price),
      }));

      const order_id = uuidv4();

      // 5. Create order
      const { rows: orderRows } = await client.query(
        `
        INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
        VALUES (
          $1,
          $2,
          $3,
          (
            SELECT COALESCE(SUM(ci.quantity * p.price), 0)
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            WHERE ci.id = ANY($4::uuid[])
          ),
          'PENDING',
          now()
        )
        RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at
        `,
        [order_id, cart.user_id, address_id, item_ids]
      );

      // 6. Create order items
      for (const it of snapshot) {
        await client.query(
          `
          INSERT INTO order_items (id, order_id, product_id, quantity, price)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [uuidv4(), order_id, it.product_id, it.quantity, it.price]
        );
      }

      // 7. Create payment
      await client.query(
        `
        INSERT INTO payments (id, order_id, payment_method, amount, status)
        VALUES ($1, $2, $3, $4, 'PENDING')
        `,
        [uuidv4(), order_id, payment_method, orderRows[0].total_amount]
      );

      // 8. REMOVE ONLY CHECKED-OUT ITEMS
      await client.query(
        `
      DELETE FROM cart_items
      WHERE id = ANY($1::uuid[])
      `,
        [item_ids]
      );

      await client.query("COMMIT");
      return { ...orderRows[0], items: snapshot };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Create order instantly for a single product ("Buy Now")
   */
  async _createInstant(
    user_id,
    address_id,
    product_id,
    quantity,
    payment_method
  ) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // 1. Validate address
      await ensureAddressValid(address_id, user_id);

      // 2. Validate product exists
      await ensureProductValid(product_id);

      // 3. Normalize quantity
      const qty = Math.max(1, parseInt(quantity, 10));

      // 4. Load price
      const { rows: pr } = await client.query(
        `
      SELECT price
      FROM products
      WHERE id = $1 AND deleted_at IS NULL
      `,
        [product_id]
      );
      if (!pr.length) throw new Error("Product not found");

      const price = Number(pr[0].price);
      const total = qty * price;

      const order_id = uuidv4();

      // 5. Create order
      const { rows: orderRows } = await client.query(
        `
      INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
      VALUES ($1, $2, $3, $4, 'PENDING', now())
      RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at
      `,
        [order_id, user_id, address_id, total]
      );

      // 6. Insert order item
      await client.query(
        `
      INSERT INTO order_items (id, order_id, product_id, quantity, price)
      VALUES ($1, $2, $3, $4, $5)
      `,
        [uuidv4(), order_id, product_id, qty, price]
      );

      // 7. Create payment
      await client.query(
        `
      INSERT INTO payments (id, order_id, payment_method, amount, status)
      VALUES ($1, $2, $3, $4, 'PENDING')
      `,
        [uuidv4(), order_id, payment_method, total]
      );

      await client.query("COMMIT");
      return { ...orderRows[0], items: [{ product_id, quantity: qty, price }] };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
  /**
   * Create order manually with provided items (admin use)
   */
  async _createManual(user_id, address_id, items = [], payment_method) {
    if (!Array.isArray(items) || !items.length) {
      const e = new Error("Items required");
      e.status = 400;
      throw e;
    }

    // Validate user exists
    await ensureUserExists(user_id);

    // Validate address belongs to this user
    await ensureAddressValid(address_id, user_id);

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const resolvedItems = [];

      // Validate items
      for (const it of items) {
        await ensureProductValid(it.product_id);

        const qty = Math.max(1, parseInt(it.quantity ?? 1, 10));

        let price = it.price;

        if (price == null) {
          const { rows: pr } = await client.query(
            `
      SELECT price
      FROM products
      WHERE id = $1 AND deleted_at IS NULL
      `,
            [it.product_id]
          );
          if (!pr.length) throw new Error("Product not found");
          price = Number(pr[0].price);
        }

        if (price < 0) throw new Error("Price must be >= 0");

        resolvedItems.push({
          product_id: it.product_id,
          quantity: qty,
          price,
        });
      }

      const order_id = uuidv4();

      // Create order
      const { rows: orderRows } = await client.query(
        `
        INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
        VALUES (
          $1,
          $2,
          $3,
          (
            SELECT COALESCE(SUM(oi.quantity * oi.price), 0)
            FROM jsonb_to_recordset($4::jsonb)
              AS oi(product_id uuid, quantity int, price numeric)
          ),
          'PENDING',
          now()
        )
        RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at
        `,
        [order_id, user_id, address_id, JSON.stringify(resolvedItems)]
      );

      // Insert items
      for (const it of resolvedItems) {
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), order_id, it.product_id, it.quantity, it.price]
        );
      }

      // Create payment
      await client.query(
        `
        INSERT INTO payments (id, order_id, payment_method, amount, status)
        VALUES ($1, $2, $3, $4, 'PENDING')
        `,
        [uuidv4(), order_id, payment_method, orderRows[0].total_amount]
      );

      await client.query("COMMIT");
      return { ...orderRows[0], items: resolvedItems };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Update existing order (status, address, etc.)
   */
  async updateOrder(id, data) {
    // 1. Fetch current order status
    const sqlGet = `
    SELECT status
    FROM orders
    WHERE id = $1 AND deleted_at IS NULL
  `;
    const { rows: currentRows } = await db.query(sqlGet, [id]);

    if (currentRows.length === 0) {
      return null;
    }

    const currentStatus = currentRows[0].status;

    // 2. Terminal states
    if (["COMPLETED", "INACTIVE"].includes(currentStatus)) {
      const err = new Error("Cannot update a completed or cancelled order");
      err.status = 400;
      throw err;
    }

    // 3. Build update sets
    const sets = [];
    const params = [id];

    // 3) Validate status BEFORE applying changes
    if (data.status) {
      if (data.status === "COMPLETED") {
        const err = new Error(
          "Use paymentService.completeOrderPayment() to complete order"
        );
        err.status = 400;
        throw err;
      }

      sets.push(`status = $${params.length + 1}`);
      params.push(data.status);
    }

    // Update address
    if (data.address_id) {
      sets.push(`address_id = $${params.length + 1}`);
      params.push(data.address_id);
    }

    if (sets.length === 0) {
      return await this.getOrderById(id);
    }

    // 4. Perform update
    const sql = `
    UPDATE orders
    SET ${sets.join(", ")}, updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, user_id, address_id, total_amount, status, placed_at, paid_at, updated_at
  `;

    const { rows } = await db.query(sql, params);
    return rows[0] || null;
  },

  /**
   * Cancel existing order (reason optional)
   */
  async cancelOrder(id, reason = null) {
    const { user_id } = getRequestContext();
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // 1. Validate order exists + status
      const { rows: orders } = await client.query(
        `
      SELECT status
      FROM orders
      WHERE id = $1 AND deleted_at IS NULL
      `,
        [id]
      );

      if (!orders.length) {
        const e = new Error("Order not found");
        e.status = 404;
        throw e;
      }

      if (orders[0].status !== "PENDING") {
        const e = new Error("Only PENDING orders can be cancelled");
        e.status = 400;
        throw e;
      }

      // 2. Update order
      const { rows: updated } = await client.query(
        `
      UPDATE orders
      SET
        status = 'INACTIVE',
        cancel_reason = $2,
        updated_by = $3,
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, status, cancel_reason, updated_at
      `,
        [id, reason, user_id]
      );

      // 3. Update payment
      await client.query(
        `
      UPDATE payments
      SET status = 'INACTIVE', updated_at = now()
      WHERE order_id = $1 AND deleted_at IS NULL
      `,
        [id]
      );

      await client.query("COMMIT");
      return updated[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Soft delete an order and its related records
   */
  async deleteOrder(id) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const { rowCount } = await client.query(
        `UPDATE orders 
       SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
       WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );

      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query(
        `UPDATE order_items 
       SET deleted_at = now(), updated_at = now()
       WHERE order_id = $1 AND deleted_at IS NULL`,
        [id]
      );

      await client.query(
        `UPDATE payments 
       SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
       WHERE order_id = $1 AND deleted_at IS NULL`,
        [id]
      );

      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
};

export default orderService;
