import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const {
  buildFiltersWhere,
  mergeWhereParts,
  buildOrderBy,
  buildGlobalSearch,
  buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Categories CRUD + Product relationship
 */
const categoryService = {
  /**
   * List categories + product count
   */
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedFilters = ["name", "created_at"];
    const allowedSort = ["name", "created_at"];
    const searchColumns = ["name", "description"];

    const search = buildGlobalSearch({
      q: queryParams.q,
      columns: searchColumns,
      alias: "c",
    });

    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const where = buildFiltersWhere({
      filters,
      allowedColumns: allowedFilters,
      alias: "c",
    });

    const soft = buildSoftDeleteScope("c", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([soft, search, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort,
        alias: "c",
      }) || "ORDER BY c.created_at DESC";

    const selectColumns = `
      c.id, c.name, c.description, c.created_at, c.updated_at,
      COUNT(DISTINCT p.id) AS product_count
    `;

    const sql = `
      SELECT ${selectColumns}
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
      ${whereSql}
      GROUP BY c.id
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM categories c ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
  },

  /**
   * Get category by ID + products list
   */
  async getById(id, showDeleted = "active") {
    const soft = buildSoftDeleteScope("", showDeleted);

    const categorySql = `
      SELECT id, name, description, created_at, updated_at, deleted_at
      FROM categories
      WHERE id = $1 ${soft.sql ? `AND ${soft.sql}` : ""}
    `;
    const { rows } = await db.query(categorySql, [id]);
    const category = rows[0];
    if (!category) return null;

    // Fetch products in this category (active only)
    const productSql = `
      SELECT id, name, price, stock, created_at, updated_at
      FROM products
      WHERE category_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    const { rows: products } = await db.query(productSql, [id]);
    category.products = products;
    category.product_count = products.length;

    return category;
  },

  /**
 * Create new category
 */
  async create(data) {
    // Normalize
    if (typeof data.name === "string") data.name = data.name.trim();
    if (typeof data.description === "string") data.description = data.description.trim();

    // Check name uniqueness
    const dup = await db.query(
      "SELECT 1 FROM categories WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
      [data.name]
    );
    if (dup.rowCount > 0) {
      const err = new Error("Category name already exists");
      err.status = 409;
      throw err;
    }

    const id = uuidv4();
    const sql = `
    INSERT INTO categories (id, name, description)
    VALUES ($1, $2, $3)
    RETURNING id, name, description, created_at
  `;
    const { rows } = await db.query(sql, [id, data.name, data.description]);
    return rows[0];
  },

  /**
 * Update category info (PATCH)
 */
  async update(id, data) {
    // Normalize
    if (typeof data.name === "string") data.name = data.name.trim();
    if (typeof data.description === "string") data.description = data.description.trim();

    // check duplicate name if provided
    if (data.name) {
      const dup = await db.query(
        "SELECT 1 FROM categories WHERE LOWER(name) = LOWER($1) AND id <> $2 AND deleted_at IS NULL",
        [data.name, id]
      );
      if (dup.rowCount > 0) {
        const err = new Error("Category name already exists");
        err.status = 409;
        throw err;
      }
    }

    const sql = `
    UPDATE categories
    SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, name, description, updated_at
  `;
    const { rows } = await db.query(sql, [id, data.name, data.description]);
    return rows[0] || null;
  },

  /**
   * Soft delete category
   */
  async remove(id) {
    const sql = `
      UPDATE categories
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },

  /**
 * Attach products to a category.
 * In one-to-many model, each product belongs to exactly one category.
 * If a product is already in another category, it will be reassigned.
 * Products already in this category are ignored.
 */
  async addProducts(categoryId, product_ids = []) {
    if (!Array.isArray(product_ids) || product_ids.length === 0) return [];

    // Validate product IDs exist
    const checkExistSql = `
      SELECT id FROM products
      WHERE id = ANY($1::uuid[])
        AND deleted_at IS NULL
    `;
    const { rows: existRows } = await db.query(checkExistSql, [product_ids]);

    if (existRows.length !== product_ids.length) {
      const e = new Error("Some products do not exist or are deleted");
      e.status = 400;
      throw e;
    }

    // Skip products that already belong to the same category
    const checkSql = `
      SELECT id FROM products
      WHERE id = ANY($1::uuid[])
        AND category_id = $2
        AND deleted_at IS NULL
    `;
    const { rows: existing } = await db.query(checkSql, [product_ids, categoryId]);
    const existingIds = existing.map((r) => r.id);
    const filteredIds = product_ids.filter((id) => !existingIds.includes(id));

    if (filteredIds.length === 0) return [];

    // Update category_id for remaining products
    const sql = `
      UPDATE products
      SET category_id = $1, updated_at = now()
      WHERE id = ANY($2::uuid[])
        AND deleted_at IS NULL
      RETURNING id, name, category_id
    `;
    const { rows } = await db.query(sql, [categoryId, filteredIds]);
    return rows;
  },

  /**
   * Detach one or multiple products from a category.
   * Accepts a single UUID or an array of UUIDs in the request body.
   */
  async removeProducts(categoryId, product_ids = []) {
    if (!Array.isArray(product_ids)) product_ids = [product_ids];
    if (product_ids.length === 0) return 0;

    // Validate that products belong to this category
    const checkSql = `
      SELECT id FROM products
      WHERE id = ANY($1::uuid[])
        AND category_id = $2
        AND deleted_at IS NULL
    `;
    const { rows: validRows } = await db.query(checkSql, [product_ids, categoryId]);

    if (validRows.length === 0) {
      const e = new Error("No valid products found in this category");
      e.status = 400;
      throw e;
    }

    const sql = `
      UPDATE products
      SET category_id = NULL, updated_at = now()
      WHERE category_id = $1
        AND id = ANY($2::uuid[])
        AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [categoryId, product_ids]);
    return rowCount;
  },
};

export default categoryService;
