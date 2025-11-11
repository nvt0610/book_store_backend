import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildGlobalSearch, buildSelectColumns } = queryHelper;

/** Try to run a function in a DB transaction; fallback to non-TX if getClient is unavailable */
async function withTransaction(fn) {
  const getClient = db.getClient?.bind(db);
  if (!getClient) {
    // Fallback (non-transaction) to keep code runnable
    return fn({ query: db.query.bind(db), release: () => {} });
  }
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const res = await fn(client);
    await client.query("COMMIT");
    return res;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release?.();
  }
}

const orderService = {
  /** List orders with pagination/filters/search */
  async listOrders(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedColumns = ["status", "user_id", "address_id", "created_at", "placed_at", "paid_at"];
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const searchText = queryParams.q;

    // Simple global search on status / note (if you add order note later)
    const search = buildGlobalSearch({
      q: searchText,
      columns: ["status"],
      alias: "o",
    });

    const where = buildFiltersWhere({
      filters,
      allowedColumns,
      alias: "o",
    });

    const softDeleteFilter = buildSoftDeleteScope("o", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, search, where]);

    const orderBy = buildOrderBy({
      sortBy: queryParams.sortBy,
      sortDir: queryParams.sortDir,
      allowedSort: ["created_at", "placed_at", "paid_at", "status"],
      alias: "o",
    });

    const selectColumns = buildSelectColumns({
      alias: "o",
      columns: [
        "id", "user_id", "address_id",
        "total_amount", "status",
        "placed_at", "paid_at",
        "created_at", "updated_at"
      ],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM orders o
      ${whereSql}
      ${orderBy || "ORDER BY o.created_at DESC"}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM orders o ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);
    const meta = buildPageMeta({ total, page, pageSize });
    return { data: rows, meta };
  },

  /** Load order (+items) by id */
  async getOrderWithItems(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("o", showDeleted);
    const sql = `
      SELECT o.id, o.user_id, o.address_id, o.total_amount, o.status, o.placed_at, o.paid_at,
             o.created_at, o.updated_at, o.deleted_at
      FROM orders o
      WHERE o.id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    const order = rows[0] || null;
    if (!order) return null;

    const itemsSql = `
      SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price,
             oi.created_at, oi.updated_at, oi.deleted_at
      FROM order_items oi
      WHERE oi.order_id = $1 AND ( $2::boolean OR oi.deleted_at IS NULL )
      ORDER BY oi.created_at ASC
    `;
    const showDeletedItems = showDeleted && showDeleted !== "active";
    const { rows: items } = await db.query(itemsSql, [id, !!showDeletedItems]);

    order.items = items;
    return order;
  },

  /** Admin creates a manual order (draft-like) or direct “composed” order */
  async createOrderAdmin({ userId, addressId, items = [], placedAt = null, paid = false }) {
    if (!Array.isArray(items) || items.length === 0) {
      const e = new Error("Items required");
      e.status = 400;
      throw e;
    }
    return withTransaction(async (tx) => {
      // Resolve prices (snapshot): if price is not provided, pull from products
      let total = 0;
      const resolvedItems = [];
      for (const it of items) {
        const qty = Math.max(1, parseInt(it.quantity ?? 1, 10));
        let price = it.price;
        if (price == null) {
          const { rows: pr } = await tx.query(
            `SELECT price FROM products WHERE id = $1 AND deleted_at IS NULL`,
            [it.productId]
          );
          if (pr.length === 0) {
            const e = new Error("Product not found");
            e.status = 404;
            throw e;
          }
          price = Number(pr[0].price);
        }
        total += qty * Number(price);
        resolvedItems.push({ productId: it.productId, quantity: qty, price: Number(price) });
      }

      const orderId = uuidv4();
      const status = paid ? "PAID" : "PENDING";
      const paidAt = paid ? new Date() : null;

      const insertOrder = `
        INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at, paid_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, user_id, address_id, total_amount, status, placed_at, paid_at, created_at
      `;
      const { rows: orderRows } = await tx.query(insertOrder, [
        orderId, userId, addressId, total, status, placedAt, paidAt
      ]);

      // Insert items
      for (const it of resolvedItems) {
        await tx.query(
          `INSERT INTO order_items (id, order_id, product_id, quantity, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), orderId, it.productId, it.quantity, it.price]
        );
      }

      return {
        ...orderRows[0],
        items: resolvedItems
      };
    });
  },

  /** Create order from an ACTIVE cart */
  async createOrderFromCart({ cartId, addressId, markCartCheckedOut = true }) {
    return withTransaction(async (tx) => {
      // Load cart & items
      const { rows: carts } = await tx.query(
        `SELECT id, user_id, status FROM carts WHERE id = $1 AND deleted_at IS NULL`,
        [cartId]
      );
      if (carts.length === 0) {
        const e = new Error("Cart not found");
        e.status = 404;
        throw e;
      }
      const cart = carts[0];
      if (cart.status !== "ACTIVE") {
        const e = new Error("Cart is not ACTIVE");
        e.status = 400;
        throw e;
      }

      const { rows: items } = await tx.query(
        `SELECT ci.product_id, ci.quantity, p.price
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id AND p.deleted_at IS NULL
         WHERE ci.cart_id = $1 AND ci.deleted_at IS NULL`,
        [cartId]
      );
      if (items.length === 0) {
        const e = new Error("Cart is empty");
        e.status = 400;
        throw e;
      }

      // Snapshot prices & total
      let total = 0;
      const resolved = items.map((r) => {
        const qty = Math.max(1, parseInt(r.quantity ?? 1, 10));
        const price = Number(r.price);
        total += qty * price;
        return { productId: r.product_id, quantity: qty, price };
      });

      const orderId = uuidv4();
      const insertOrder = `
        INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
        VALUES ($1, $2, $3, $4, 'PENDING', now())
        RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at
      `;
      const { rows: orderRows } = await tx.query(insertOrder, [
        orderId, cart.user_id, addressId, total
      ]);

      // Insert items
      for (const it of resolved) {
        await tx.query(
          `INSERT INTO order_items (id, order_id, product_id, quantity, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), orderId, it.productId, it.quantity, it.price]
        );
      }

      // Mark cart checked out (status) — compatible với enum cart_status mở rộng
      if (markCartCheckedOut) {
        await tx.query(
          `UPDATE carts SET status = 'CHECKED_OUT', updated_at = now() WHERE id = $1`,
          [cartId]
        );
      }

      return { ...orderRows[0], items: resolved };
    });
  },

  /** Buy Now: create order directly for a single product */
  async createOrderBuyNow({ userId, addressId, productId, quantity = 1 }) {
    return withTransaction(async (tx) => {
      const { rows: pr } = await tx.query(
        `SELECT price FROM products WHERE id = $1 AND deleted_at IS NULL`,
        [productId]
      );
      if (pr.length === 0) {
        const e = new Error("Product not found");
        e.status = 404;
        throw e;
      }
      const qty = Math.max(1, parseInt(quantity ?? 1, 10));
      const price = Number(pr[0].price);
      const total = qty * price;
      const orderId = uuidv4();

      const { rows: orderRows } = await tx.query(
        `INSERT INTO orders (id, user_id, address_id, total_amount, status, placed_at)
         VALUES ($1, $2, $3, $4, 'PENDING', now())
         RETURNING id, user_id, address_id, total_amount, status, placed_at, created_at`,
        [orderId, userId, addressId, total]
      );

      await tx.query(
        `INSERT INTO order_items (id, order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), orderId, productId, qty, price]
      );

      return {
        ...orderRows[0],
        items: [{ productId, quantity: qty, price }]
      };
    });
  },

  /** Update order (status, address) */
  async updateOrder(id, data) {
    const sets = [];
    const params = [id];
    if (data.status) {
      sets.push(`status = $${params.length + 1}`);
      params.push(data.status);
      // auto-paid timestamp if becoming PAID
      if (data.status === "PAID") {
        sets.push(`paid_at = now()`);
      }
    }
    if (data.address_id) {
      sets.push(`address_id = $${params.length + 1}`);
      params.push(data.address_id);
    }
    if (sets.length === 0) return await this.getOrderWithItems(id);

    const sql = `
      UPDATE orders
      SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, user_id, address_id, total_amount, status, placed_at, paid_at, updated_at
    `;
    const { rows } = await db.query(sql, params);
    return rows[0] || null;
  },

  /** Soft delete order + its items */
  async deleteOrder(id) {
    return withTransaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE orders SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (rowCount === 0) return false;
      await tx.query(
        `UPDATE order_items SET deleted_at = now(), updated_at = now() WHERE order_id = $1 AND deleted_at IS NULL`,
        [id]
      );
      return true;
    });
  },

  /** Get order items (non-deleted) */
  async listOrderItems(orderId, showDeleted = "active") {
    const showAll = showDeleted && showDeleted !== "active";
    const { rows } = await db.query(
      `SELECT id, order_id, product_id, quantity, price, created_at, updated_at, deleted_at
       FROM order_items
       WHERE order_id = $1 AND ( $2::boolean OR deleted_at IS NULL )
       ORDER BY created_at ASC`,
      [orderId, !!showAll]
    );
    return rows;
  }
};

export default orderService;
