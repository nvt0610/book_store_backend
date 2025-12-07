// src/services/restoreService.js
import db from "../db/db.js";

const restoreService = {
  async restore(table, id) {
    const sql = `
      UPDATE ${table}
      SET deleted_at = NULL,
          updated_at = now(),
          deleted_by = NULL
      WHERE id = $1
        AND deleted_at IS NOT NULL
      RETURNING id
    `;

    try {
      const { rows } = await db.query(sql, [id]);
      return rows.length > 0;
    } catch (err) {
      console.error("[restoreService.restore] Error:", err);
      throw err;
    }
  },
};

export default restoreService;
