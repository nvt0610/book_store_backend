// src/services/restoreService.js
import db from "../db/db.js";

const restoreService = {
  async restore(table, id) {
    if (table === "orders") {
      return await restoreOrder(id);
    }

    const statusMap = {
      users: "ACTIVE",
      products: "ACTIVE",
      carts: "ACTIVE",
      payments: "PENDING",
    };

    let setSql = `
      deleted_at = NULL,
      updated_at = now(),
      deleted_by = NULL
    `;

    if (statusMap[table]) {
      setSql += `, status = '${statusMap[table]}'`;
    }

    const sql = `
      UPDATE ${table}
      SET ${setSql}
      WHERE id = $1
        AND deleted_at IS NOT NULL
      RETURNING id
    `;

    try {
      const { rows } = await db.query(sql, [id]);
      return rows.length > 0;
    } catch (err) {
      console.error("[restoreService.restore] Error:", err);

      if (err.code === "23505") {
        return {
          error: true,
          type: "UNIQUE_CONFLICT",
          message: getFriendlyUniqueMessage(err.detail),
        };
      }

      throw err;
    }
  },
};

async function restoreOrder(id) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE orders
       SET deleted_at = NULL,
           updated_at = now(),
           deleted_by = NULL,
           status = 'PENDING'
       WHERE id = $1
         AND deleted_at IS NOT NULL
       RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return {
        success: false,
        message: "Order not found or not deleted.",
      };
    }

    await client.query(
      `UPDATE order_items
       SET deleted_at = NULL,
           updated_at = now(),
           deleted_by = NULL
       WHERE order_id = $1`,
      [id]
    );

    await client.query(
      `UPDATE payments
       SET deleted_at = NULL,
           updated_at = now(),
           deleted_by = NULL,
           status = 'PENDING'
       WHERE order_id = $1`,
      [id]
    );

    await client.query("COMMIT");
    return {
      success: true,
      message: "Order and related records restored successfully.",
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function getFriendlyUniqueMessage(detail = "") {
  if (detail.includes("email")) {
    return "Email already exists. Cannot restore this record.";
  }
  if (detail.includes("cart_items")) {
    return "Product already exists in cart. Restore denied.";
  }
  if (detail.includes("order_items")) {
    return "Order item already exists. Cannot restore.";
  }
  if (detail.includes("ux_carts_user_active")) {
    return "User already has an active cart. Cannot restore.";
  }
  if (detail.includes("ux_carts_guest_active")) {
    return "Guest token already has an active cart. Cannot restore.";
  }
  return "Restore failed due to duplicated data.";
}

export default restoreService;
