/**
 * @module helpers/orderValidationHelper
 * Helper functions for validating user, address, and product data
 * before creating or updating orders.
 */

import db from "../db/db.js";

/**
 * Validate user existence and active status.
 */
export async function ensureUserExists(user_id) {
  const sql = `
    SELECT id
    FROM users
    WHERE id = $1
      AND deleted_at IS NULL
      AND status = 'ACTIVE'
  `;
  const { rows } = await db.query(sql, [user_id]);
  if (!rows.length) {
    const error = new Error("User does not exist or is inactive");
    error.status = 400;
    throw error;
  }
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
    const error = new Error("Invalid address or does not belong to user");
    error.status = 400;
    throw error;
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
    const error = new Error("Product not available");
    error.status = 400;
    throw error;
  }
}
