import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";
import cartItemService from "./cartItemService.js";

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

    // Attach cart items (HARD DELETE → NO deleted_at)
    const itemSql = `
    SELECT id, cart_id, product_id, quantity, created_at, updated_at
    FROM cart_items
    WHERE cart_id = $1
    ORDER BY created_at ASC
  `;
    const { rows: items } = await db.query(itemSql, [id]);
    cart.items = items;

    return cart;
  },

  /**
   * Get cart by user ID (active cart + items)
   */
  async getMyCart(user_id, showDeleted = "active") {
    if (!user_id) {
      const err = new Error("user_id is required");
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
    const { rows } = await db.query(sql, [user_id]);
    let cart = rows[0];

    // Lazy create nếu user chưa có cart
    if (!cart) {
      const createSql = `
      INSERT INTO carts (id, user_id, status)
      VALUES ($1, $2, 'ACTIVE')
      RETURNING id, user_id, status, created_at
    `;
      const id = uuidv4();
      const { rows: newCart } = await db.query(createSql, [id, user_id]);
      cart = newCart[0];
    }

    // Lấy items của cart
    const itemSql = `
    SELECT id, cart_id, product_id, quantity, created_at, updated_at
    FROM cart_items
    WHERE cart_id = $1
    ORDER BY created_at ASC
  `;
    const { rows: items } = await db.query(itemSql, [cart.id]);
    cart.items = items;

    return cart;
  },

  /**
 * Get or create ACTIVE guest cart by guest_token.
 */
  async getOrCreateGuestCart(guest_token) {
    if (!guest_token || typeof guest_token !== "string") {
      const err = new Error("guest_token is required");
      err.status = 400;
      throw err;
    }
    const token = guest_token.trim();

    // 1. Try fetch
    const sql = `
      SELECT id, user_id, status, created_at
      FROM carts
      WHERE guest_token = $1
        AND status = 'ACTIVE'
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await db.query(sql, [token]);
    let cart = rows[0];

    // 2. If exists → return cart (no create)
    if (cart) {
      cart.items = await cartItemService.getItemsByCart(cart.id);
      return { cart, created: false };
    }

    // 3. Create new
    const id = uuidv4();
    const insertSql = `
      INSERT INTO carts (id, guest_token, status)
      VALUES ($1, $2, 'ACTIVE')
      RETURNING id, user_id, status, created_at
    `;
    const { rows: newCart } = await db.query(insertSql, [id, token]);
    cart = newCart[0];

    cart.items = []; // hoặc fetch items cũng được

    return { cart, created: true };
  },

  /**
 * Merge guest cart into user's ACTIVE cart after login.
 */
  async mergeGuestCartToUser({ guest_token, user_id }) {
    if (!guest_token) {
      const err = new Error("guest_token is required");
      err.status = 400;
      throw err;
    }
    if (!user_id) {
      const err = new Error("user_id is required");
      err.status = 400;
      throw err;
    }

    const token = guest_token.trim();
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // 1. Load guest cart
      const { rows: guestRows } = await client.query(
        `
        SELECT id 
        FROM carts
        WHERE guest_token = $1
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
        LIMIT 1
      `,
        [token]
      );
      const guestCart = guestRows[0];

      // No guest cart → simply return user cart
      if (!guestCart) {
        await client.query("COMMIT");
        return await this.getMyCart(user_id);
      }

      // 2. Load or create user cart
      const { rows: userRows } = await client.query(
        `
        SELECT id 
        FROM carts
        WHERE user_id = $1
          AND status = 'ACTIVE'
          AND deleted_at IS NULL
        LIMIT 1
      `,
        [user_id]
      );
      let userCart = userRows[0];

      if (!userCart) {
        const id = uuidv4();
        const { rows: created } = await client.query(
          `
          INSERT INTO carts (id, user_id, status)
          VALUES ($1, $2, 'ACTIVE')
          RETURNING id
        `,
          [id, user_id]
        );
        userCart = created[0];
      }

      // 3. Load guest cart items
      const { rows: guestItems } = await client.query(
        `
        SELECT product_id, quantity
        FROM cart_items
        WHERE cart_id = $1
      `,
        [guestCart.id]
      );

      // 4. Merge into user cart
      for (const it of guestItems) {
        const qty = Math.max(1, Number(it.quantity));

        // Check if item already exists in user cart
        const { rows: existing } = await client.query(
          `
          SELECT id, quantity
          FROM cart_items
          WHERE cart_id = $1 AND product_id = $2
          LIMIT 1
        `,
          [userCart.id, it.product_id]
        );

        if (existing[0]) {
          const updatedQty = Number(existing[0].quantity) + qty;
          const { rows: prRows } = await client.query(
            `SELECT stock FROM products WHERE id = $1`,
            [it.product_id]
          );
          const stock = Number(prRows[0].stock);

          if (updatedQty > stock) {
            `Cannot merge: total quantity (${updatedQty}) exceeds available stock (${stock})`
            e.status = 400;
            throw e;
          }
          await client.query(
            `
            UPDATE cart_items
            SET quantity = $2, updated_at = now()
            WHERE id = $1
          `,
            [existing[0].id, updatedQty]
          );
        } else {
          // check stock before insert
          const { rows: pr2Rows } = await client.query(
            `SELECT stock FROM products WHERE id = $1`,
            [it.product_id]
          );
          const stock2 = Number(pr2Rows[0].stock);

          if (qty > stock2) {
            `Cannot merge: quantity (${qty}) exceeds available stock (${stock2})`
            e.status = 400;
            throw e;
          }

          await client.query(
            `
    INSERT INTO cart_items (id, cart_id, product_id, quantity)
    VALUES ($1, $2, $3, $4)
  `,
            [uuidv4(), userCart.id, it.product_id, qty]
          );
        }
      }

      // 5. Soft delete guest cart + its items
      await client.query(
        `
        DELETE FROM cart_items
        WHERE cart_id = $1
      `,
        [guestCart.id]
      );

      await client.query(
        `
        UPDATE carts
        SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
        WHERE id = $1 AND deleted_at IS NULL
      `,
        [guestCart.id]
      );

      await client.query("COMMIT");

      // return fresh user cart
      return await this.getMyCart(user_id);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
