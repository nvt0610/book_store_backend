import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildGlobalSearch, buildSelectColumns } = queryHelper;

/**
 * Service layer: Authors CRUD (pure DB logic)
 */
const authorService = {
  async listAuthors(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedColumns = ["name", "created_at"];
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const searchText = queryParams.q;

    const search = buildGlobalSearch({
      q: searchText,
      columns: ["name", "biography"],
      alias: "a",
    });

    const where = buildFiltersWhere({
      filters,
      allowedColumns,
      alias: "a",
    });

    const softDeleteFilter = buildSoftDeleteScope("a", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, search, where]);

    const orderBy = buildOrderBy({
      sortBy: queryParams.sortBy,
      sortDir: queryParams.sortDir,
      allowedSort: ["name", "created_at"],
      alias: "a",
    });

    const selectColumns = buildSelectColumns({
      alias: "a",
      columns: ["id", "name", "biography", "photo_url", "created_at", "updated_at"],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
    SELECT ${selectColumns}
    FROM authors a
    ${whereSql}
    ${orderBy || "ORDER BY a.created_at DESC"}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM authors a ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const meta = buildPageMeta({ total, page, pageSize });
    return { data: rows, meta };
  },

  async getAuthorById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);
    const sql = `
      SELECT id, name, biography, photo_url, created_at, updated_at, deleted_at
      FROM authors
      WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  //bỏ check trùng tên khi tạo và cập nhật
  async createAuthor(data) {
    const id = uuidv4();
    const sql = `
      INSERT INTO authors (id, name, biography, photo_url)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, biography, photo_url, created_at
    `;
    const { rows } = await db.query(sql, [id, data.name, data.biography, data.photo_url]);
    return rows[0];
  },

  async updateAuthor(id, data) {
    const sql = `
      UPDATE authors
      SET
        name = COALESCE($2, name),
        biography = COALESCE($3, biography),
        photo_url = COALESCE($4, photo_url),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, biography, photo_url, updated_at
    `;
    const { rows } = await db.query(sql, [id, data.name, data.biography, data.photo_url]);
    return rows[0] || null;
  },

  async deleteAuthor(id) {
    // Prevent delete if referenced by products
    const ref = await db.query(
      `SELECT id FROM products WHERE author_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );

    if (ref.rows.length) {
      const e = new Error("Cannot delete author: products are still referencing this author");
      e.status = 400;
      throw e;
    }

    const sql = `
      UPDATE authors
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default authorService;
