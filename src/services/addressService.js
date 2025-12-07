import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";
import { getRequestContext } from "../middlewares/requestContext.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildGlobalSearch,
  buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Addresses CRUD (pure DB logic)
 */
const addressService = {
  /**
   * List addresses with pagination + filters + search
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedColumns = ["user_id", "full_name", "phone", "postal_code", "is_default"];
    const searchColumns = ["full_name", "phone", "address_line", "postal_code"];

    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const searchText = queryParams.q;

    const { user_id, role } = getRequestContext();

    // Auto-inject owner filter for CUSTOMER
    if (role !== "ADMIN") {
      filters.push({
        field: "user_id",
        op: "eq",
        value: user_id,
      });
    }

    const search = buildGlobalSearch({
      q: searchText,
      columns: searchColumns,
      alias: "a",
    });

    const where = buildFiltersWhere({
      filters,
      allowedColumns,
      alias: "a",
    });

    const softDeleteFilter = buildSoftDeleteScope("a", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, search, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["created_at", "full_name"],
        alias: "a",
      }) || "ORDER BY a.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "a",
      columns: [
        "id",
        "user_id",
        "full_name",
        "phone",
        "address_line",
        "address_line2",
        "postal_code",
        "is_default",
        "created_at",
        "updated_at",
      ],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM addresses a
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM addresses a ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
  },

  /**
   * Get one address
   */
  async getById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);

    const sql = `
      SELECT
        id, user_id, full_name, phone, address_line, address_line2,
        postal_code, is_default, created_at, updated_at, deleted_at
      FROM addresses
      WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;

    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * Create new address (user must be ACTIVE)
   */
  async create(data) {
    // Validate: user must be ACTIVE
    const { rows: userRows } = await db.query(
      `
      SELECT id 
      FROM users 
      WHERE id = $1
        AND deleted_at IS NULL
        AND status = 'ACTIVE'
      `,
      [data.user_id]
    );

    if (!userRows.length) {
      const e = new Error("User does not exist or is inactive");
      e.status = 400;
      throw e;
    }

    const id = uuidv4();

    const sql = `
      INSERT INTO addresses (
        id, user_id, full_name, phone, address_line,
        address_line2, postal_code, is_default
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, user_id, full_name, phone, address_line,
                address_line2, postal_code, is_default, created_at
    `;

    const { rows } = await db.query(sql, [
      id,
      data.user_id,
      data.full_name,
      data.phone,
      data.address_line,
      data.address_line2,
      data.postal_code,
      data.is_default ?? false,
    ]);

    return rows[0];
  },

  /**
   * Update address (user_id cannot be changed)
   */
  async update(id, data) {
    // Prevent changing owner
    if ("user_id" in data && data.user_id !== undefined) {
      const e = new Error("Updating user_id is not permitted");
      e.status = 400;
      throw e;
    }

    // Prevent changing is_default through update
    if ("is_default" in data) {
      const e = new Error("Updating is_default is not permitted. Use /set-default instead.");
      e.status = 400;
      throw e;
    }

    const sql = `
    UPDATE addresses
    SET
      full_name = COALESCE($2, full_name),
      phone = COALESCE($3, phone),
      address_line = COALESCE($4, address_line),
      address_line2 = COALESCE($5, address_line2),
      postal_code = COALESCE($6, postal_code),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, user_id, full_name, phone, address_line,
              address_line2, postal_code, is_default, updated_at
  `;

    const { rows } = await db.query(sql, [
      id,
      data.full_name,
      data.phone,
      data.address_line,
      data.address_line2,
      data.postal_code,
    ]);

    return rows[0] || null;
  },

  /**
 * Set an address as default for the owner.
 */
  async setDefault(id) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Load address
      const sqlGet = `
      SELECT id, user_id 
      FROM addresses 
      WHERE id = $1 AND deleted_at IS NULL
    `;
      const { rows } = await client.query(sqlGet, [id]);
      if (!rows.length) {
        throw new Error("Address not found");
      }

      const user_id = rows[0].user_id;

      // Clear current default
      await client.query(
        `
      UPDATE addresses
      SET is_default = false, updated_at = now()
      WHERE user_id = $1 AND deleted_at IS NULL
      `,
        [user_id]
      );

      // Set new default
      const sqlSet = `
      UPDATE addresses
      SET is_default = true, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, user_id, is_default, updated_at
    `;

      const { rows: updated } = await client.query(sqlSet, [id]);

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
   * Soft delete address
   */
  async remove(id) {
    const sql = `
      UPDATE addresses
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default addressService;
