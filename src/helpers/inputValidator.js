// src/helpers/validationHelper.js
import db from "../db/db.js";

/**
 * Validate user existence and active status.
 */
export async function ensureUserExists(user_id) {
  const sql = `
    SELECT id, role, status
    FROM users
    WHERE id = $1
      AND deleted_at IS NULL
      AND status = 'ACTIVE'
  `;

  const { rows } = await db.query(sql, [user_id]);

  if (!rows.length) {
    const err = new Error("User does not exist or is inactive");
    err.status = 400;
    throw err;
  }

  return rows[0];
}

/**
 * Validate that an address belongs to the user and is not deleted.
 */
export async function ensureAddressValid(address_id, user_id) {
  const sql = `
    SELECT id
    FROM addresses
    WHERE id = $1
      AND user_id = $2
      AND deleted_at IS NULL
  `;

  const { rows } = await db.query(sql, [address_id, user_id]);

  if (!rows.length) {
    const err = new Error("Invalid address or does not belong to user");
    err.status = 400;
    throw err;
  }
}

/**
 * Validate product availability.
 */
export async function ensureProductValid(product_id) {
  const sql = `
    SELECT id
    FROM products
    WHERE id = $1
      AND deleted_at IS NULL
      AND status = 'ACTIVE'
  `;

  const { rows } = await db.query(sql, [product_id]);

  if (!rows.length) {
    const err = new Error("Product not available");
    err.status = 400;
    throw err;
  }
}
