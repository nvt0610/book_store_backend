import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";
import { getRequestContext } from "../middlewares/requestContext.js";
import { ensureAddressValid, ensureProductValid, ensureUserExists } from "../helpers/inputValidator.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy } = queryHelper;

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
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

    // Inject user filter like addressService
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
      allowedColumns: allowedFilters,
      alias: "o",
    });

    const softDeleteFilter = buildSoftDeleteScope("o", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at", "placed_at", "paid_at", "status"],
        alias: "o",
      }) || "ORDER BY o.created_at DESC";

    const sql = `
      SELECT 
        o.id,
        o.user_id,
        o.address_id,
        o.total_amount,
        o.status,
        o.placed_at,
        o.paid_at,
        o.created_at,
        o.updated_at,
        COUNT(oi.id) AS item_count,
        COALESCE(SUM(oi.quantity), 0) AS total_quantity
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      ${whereSql}
      GROUP BY o.id
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM orders o ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
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
      WHERE o.id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
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
  async createOrder({ mode, user_id, address_id, cart_id, product_id, quantity = 1, items = [] }) {
    if (!mode) {
      const e = new Error("Missing mode (cart, instant, or manual)");
      e.status = 400;
      throw e;
    }

    switch (mode) {
      case "cart":
        return await this._createFromCart(cart_id, address_id);

      case "instant": {
        const { user_id } = getRequestContext();
        return await this._createInstant(user_id, address_id, product_id, quantity);
      }

      case "manual": {
        if (!user_id) {
          const e = new Error("user_id is required for manual order");
          e.status = 400;
          throw e;
        }

        // validate target user exists
        await ensureUserExists(user_id);

        // validate address belongs to target user
        await ensureAddressValid(address_id, user_id);

        return await this._createManual(user_id, address_id, items);
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
  async _createFromCart(cart_id, address_id) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Validate cart
      const { rows: carts } = await client.query(
        `SELECT id, user_id, status 
       FROM carts 
       WHERE id = $1 AND deleted_at IS NULL`,
        [cart_id]
      );
      if (!carts.length) throw new Error("Cart not found");
      const cart = carts[0];
      if (cart.status !== "ACTIVE") throw new Error("Cart is not ACTIVE");

      // Validate address ownership
      await ensureAddressValid(address_id, cart.user_id);

      // Load items
      const { rows: items } = await client.query(
        `SELECT ci.product_id, ci.quantity, p.price
       FROM cart_items ci
       JOIN products p 
             ON p.id = ci.product_id AND p.deleted_at IS NULL
       WHERE ci.cart_id = $1`,
        [cart_id]
      );

      if (!items.length) throw new Error("Cart is empty");

      for (const it of items) {
        const { rows: stockRows } = await client.query(
          `SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL`,
          [it.product_id]
        );
        const stock = Number(stockRows[0].stock);
        const qty = Number(it.quantity);

        if (qty > stock) {
          throw new Error(
            `Product ${it.product_id} has only ${stock} units in stock, cannot purchase ${qty}`
          );
        }
      }

      // Validate each product
      for (const it of items) {
        await ensureProductValid(it.product_id);
      }

      // Calculate totals
      let total = 0;
      const snapshot = items.map((it) => {
        const qty = Math.max(1, parseInt(it.quantity, 10));
        const price = Number(it.price);
        total += qty * price;
        return { product_id: it.product_id, quantity: qty, price };
      });

      const order_id = uuidv4();

      // Create order
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
       VALUES ($1, $2, $3, $4, 'PENDING', now())
       RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at`,
        [order_id, cart.user_id, address_id, total]
      );

      // Create items
      for (const it of snapshot) {
        await client.query(
          `INSERT INTO order_items (id, order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), order_id, it.product_id, it.quantity, it.price]
        );
      }

      // Create pending payment
      await client.query(
        `INSERT INTO payments (id, order_id, payment_method, amount, status)
       VALUES ($1, $2, 'COD', $3, 'PENDING')`,
        [uuidv4(), order_id, total]
      );

      // Mark cart as checked out
      await client.query(
        `UPDATE carts 
       SET status = 'CHECKED_OUT', updated_at = now()
       WHERE id = $1`,
        [cart_id]
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
  async _createInstant(user_id, address_id, product_id, quantity = 1) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Validate address ownership
      await ensureAddressValid(address_id, user_id);

      // Validate product
      await ensureProductValid(product_id);

      const { rows: stockRows } = await client.query(
        `SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL`,
        [product_id]
      );
      const stock = Number(stockRows[0].stock);

      if (quantity > stock) {
        throw new Error(
          `Product has only ${stock} units in stock, cannot purchase ${quantity}`
        );
      }

      // Load product price
      const { rows: pr } = await client.query(
        `SELECT price 
       FROM products 
       WHERE id = $1 AND deleted_at IS NULL`,
        [product_id]
      );
      if (!pr.length) throw new Error("Product not found");

      const price = Number(pr[0].price);
      const qty = Math.max(1, parseInt(quantity, 10));
      const total = qty * price;

      const order_id = uuidv4();

      // Create order
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
       VALUES ($1, $2, $3, $4, 'PENDING', now())
       RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at`,
        [order_id, user_id, address_id, total]
      );

      // Insert item
      await client.query(
        `INSERT INTO order_items (id, order_id, product_id, quantity, price)
       VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), order_id, product_id, qty, price]
      );

      // Create payment
      await client.query(
        `INSERT INTO payments (id, order_id, payment_method, amount, status)
       VALUES ($1, $2, 'COD', $3, 'PENDING')`,
        [uuidv4(), order_id, total]
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
  async _createManual(user_id, address_id, items = []) {
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

      let total = 0;
      const resolvedItems = [];

      // Validate items
      for (const it of items) {
        await ensureProductValid(it.product_id);

        const { rows: stockRows } = await client.query(
          `SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL`,
          [it.product_id]
        );
        const stock = Number(stockRows[0].stock);
        const qty = Math.max(1, parseInt(it.quantity ?? 1, 10));

        if (qty > stock) {
          throw new Error(
            `Product ${it.product_id} has only ${stock} units in stock, cannot place an order for ${qty}`
          );
        }

        let price = it.price;

        // If price not provided → load from DB
        if (price == null) {
          const { rows: pr } = await client.query(
            `SELECT price 
           FROM products 
           WHERE id = $1 AND deleted_at IS NULL`,
            [it.product_id]
          );

          if (!pr.length) throw new Error("Product not found");

          price = Number(pr[0].price);
        }

        if (price < 0) throw Error("Price must be >= 0");

        total += qty * price;
        resolvedItems.push({ product_id: it.product_id, quantity: qty, price });
      }

      const order_id = uuidv4();

      // Create order
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
       VALUES ($1, $2, $3, $4, 'PENDING', now())
       RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at`,
        [order_id, user_id, address_id, total]
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
        `INSERT INTO payments (id, order_id, payment_method, amount, status)
       VALUES ($1, $2, 'COD', $3, 'PENDING')`,
        [uuidv4(), order_id, total]
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
          "Use paymentService.markPaymentCompletedByOrder() to complete order"
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

    // 1. Validate order exists + status
    const sqlGet = `
      SELECT status
      FROM orders
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rows } = await db.query(sqlGet, [id]);
    if (!rows.length) {
      const e = new Error("Order not found");
      e.status = 404;
      throw e;
    }

    if (rows[0].status !== "PENDING") {
      const e = new Error("Only PENDING orders can be cancelled");
      e.status = 400;
      throw e;
    }

    // 2. Update order
    const sql = `
      UPDATE orders
      SET 
        status = 'INACTIVE',
        cancel_reason = $2,
        updated_by = $3,
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, status, cancel_reason, updated_at
    `;
    const { rows: updated } = await db.query(sql, [id, reason, user_id]);

    // 3. Update payment (optional)
    const { rowCount: pCount } = await db.query(
      `UPDATE payments
        SET status = 'INACTIVE', updated_at = now()
        WHERE order_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (pCount === 0) {
      console.warn("[WARN] cancelOrder: no payment associated with order", id);
    }

    return updated[0];
  },

  /**
   * Soft delete an order and its related records
   */
  async deleteOrder(id) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Mark order inactive + soft delete
      const { rowCount } = await client.query(
        `UPDATE orders SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
         WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (rowCount === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      // Soft delete order items and payment
      await client.query(
        `UPDATE order_items SET deleted_at = now(), updated_at = now() WHERE order_id = $1 AND deleted_at IS NULL`,
        [id]
      );
      await client.query(
        `UPDATE payments SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
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
