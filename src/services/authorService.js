import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import { parsePagination, buildPageMeta } from "../helpers/paginationHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";
import {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildGlobalSearch,
  buildSelectColumns,
} from "../helpers/queryHelper.js";

/**
 * Service layer: Authors CRUD (pure DB logic)
 */
const authorService = {
  async listAuthors(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedColumns = ["name", "created_at"];
    const allowedSort = ["name", "created_at"];
    const searchColumns = ["name", "biography"];

    // SEARCH
    const search = buildGlobalSearch({
      q: queryParams.q,
      columns: searchColumns,
      alias: "a",
    });

    // FILTERS
    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const where = buildFiltersWhere({
      filters,
      rawQuery: queryParams,
      allowedColumns,
      alias: "a",
    });

    // SOFT DELETE
    const { showDeleted = "active" } = queryParams;
    const softDeleteFilter = buildSoftDeleteScope("a", showDeleted);

    const { whereSql, params: whereParams } = mergeWhereParts([
      softDeleteFilter,
      search,
      where,
    ]);

    // SORTING
    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort,
        alias: "a",
      }) || "ORDER BY a.created_at DESC";

    // SELECT COLUMNS
    const baseColumns = buildSelectColumns({
      alias: "a",
      columns: [
        "id",
        "name",
        "biography",
        "photo_url",
        "created_at",
        "updated_at",
      ],
      showDeleted,
    });

    const selectColumns = `
    ${baseColumns},
    COUNT(DISTINCT p.id) AS product_count
  `;

    // MAIN QUERY
    const sql = `
    SELECT ${selectColumns}
    FROM authors a
    LEFT JOIN products p 
      ON p.author_id = a.id AND p.deleted_at IS NULL
    ${whereSql}
    GROUP BY a.id
    ${orderBy}
    LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}
  `;

    const { rows } = await db.query(sql, [...whereParams, limit, offset]);

    // COUNT
    const countSql = `
    SELECT COUNT(*) AS total
    FROM authors a
    ${whereSql}
  `;
    const { rows: countRows } = await db.query(countSql, whereParams);
    const total = Number(countRows[0]?.total || 0);

    return {
      data: rows,
      meta: buildPageMeta({ total, page, pageSize }),
    };
  },

  async getAuthorById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);

    const sql = `
    SELECT id, name, biography, photo_url, created_at, updated_at, deleted_at
    FROM authors
    WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
  `;
    const { rows } = await db.query(sql, [id]);
    const author = rows[0];
    if (!author) return null;

    // Load products of this author
    const productSql = `
    SELECT id, name, price, stock, created_at, updated_at
    FROM products
    WHERE author_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
    const { rows: products } = await db.query(productSql, [id]);

    author.products = products;
    author.product_count = products.length;

    return author;
  },

  //bá» check trĂ¹ng tĂªn khi táº¡o vĂ  cáº­p nháº­t
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
