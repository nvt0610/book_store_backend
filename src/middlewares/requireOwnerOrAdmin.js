// src/middlewares/requireOwnerOrAdmin.js

import responseHelper from "../helpers/responseHelper.js";
import db from "../db/db.js";
import { validate as isUuid } from "uuid";

/**
 * Generic owner check middleware:
 *
 * Usage:
 *   router.patch("/:id",
 *     requireAuth,
 *     requireOwnerOrAdmin("orders"),
 *     controller.update
 *   );
 *
 * Params:
 *  - tableName: SQL table name
 *  - paramName: route param key (default: "id")
 */
export function requireOwnerOrAdmin(tableName, paramName = "id") {
  return async (req, res, next) => {
    const user = req.user;
    const recordId = req.params[paramName];

    // Admin bypass
    if (user.role === "ADMIN") {
      return next();
    }

    let sql;
    let params = [recordId];

    // SPECIAL CASE: payments → join orders to check ownership
    if (tableName === "payments") {
      sql = `
        SELECT o.user_id
        FROM payments p
        JOIN orders o ON o.id = p.order_id
        WHERE p.id = $1
          AND p.deleted_at IS NULL
          AND o.deleted_at IS NULL
      `;
    }
    // DEFAULT CASE: table has direct user_id
    else {
      sql = `
        SELECT user_id
        FROM ${tableName}
        WHERE id = $1
          AND deleted_at IS NULL
      `;
    }

    let rows;
    try {
      ({ rows } = await db.query(sql, params));
    } catch (err) {
      console.error("[requireOwnerOrAdmin] SQL Error:", err);
      return responseHelper.internalError(res, "Internal Server Error");
    }

    // Not found
    if (!rows.length) {
      return responseHelper.notFound(res, `${tableName} not found`);
    }

    // Check owner
    const ownerId = rows[0].user_id;
    if (ownerId !== user.id) {
      return responseHelper.forbidden(
        res,
        "Forbidden: you do not have permission to access this resource"
      );
    }

    return next();
  };
}

/**
 * Validate owner for cart (user OR guest).
 * Admin bypass.
 */
export function requireCartOwnerOrAdmin(bodyKey = "cart_id", itemParam = null) {
  return async (req, res, next) => {
    try {
      const user = req.user || {};
      const guest_token = req.body?.guest_token || req.query?.guest_token;

      let cart_id = null;

      // For update/delete item → find cart_id by itemId
      if (itemParam) {
        const itemId = req.params[itemParam];
        const sql = `SELECT cart_id FROM cart_items WHERE id = $1`;
        const { rows } = await db.query(sql, [itemId]);
        if (!rows.length) return responseHelper.notFound(res, "Cart item not found");
        cart_id = rows[0].cart_id;
      }

      // For add/clear → read cart_id from body
      if (!cart_id) cart_id = req.body?.[bodyKey] || req.body?.cart_id;

      if (!cart_id) return responseHelper.badRequest(res, "cart_id is required");

      // Admin bypass
      if (user.role === "ADMIN") return next();

      // Load cart
      const sql = `SELECT id, user_id, guest_token FROM carts WHERE id = $1 AND deleted_at IS NULL`;
      const { rows } = await db.query(sql, [cart_id]);
      if (!rows.length) return responseHelper.notFound(res, "Cart not found");

      const cart = rows[0];

      // Guest
      if (!user.id) {
        if (!guest_token) return responseHelper.unauthorized(res, "guest_token required");
        if (cart.guest_token !== guest_token.trim())
          return responseHelper.forbidden(res, "Forbidden: guest does not own this cart");
        return next();
      }

      // User
      if (cart.user_id !== user.id)
        return responseHelper.forbidden(res, "Forbidden: you do not own this cart");

      return next();
    } catch (err) {
      console.error("[requireCartOwnerOrAdmin] error:", err);
      return responseHelper.internalError(res, err.message);
    }
  };
}