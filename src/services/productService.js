import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildGlobalSearch, buildSelectColumns } = queryHelper;

const productService = {
  async list(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedFilters = [
      "name",
      "price",
      "stock",
      "status",
      "category_id",
      "publisher_id",
      "author_id",
      "created_at",
    ];

    const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
    const searchText = queryParams.q;

    const search = buildGlobalSearch({
      q: searchText,
      columns: ["name", "description"],
      alias: "p",
    });

    const where = buildFiltersWhere({
      filters,
      allowedColumns: allowedFilters,
      alias: "p",
    });

    const softDeleteFilter = buildSoftDeleteScope("p", queryParams.showDeleted || "active");
    const { whereSql, params } = mergeWhereParts([softDeleteFilter, search, where]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["name", "price", "stock", "created_at"],
        alias: "p",
      }) || "ORDER BY p.created_at DESC";

    const selectColumns = buildSelectColumns({
      alias: "p",
      columns: [
        "id",
        "name",
        "description",
        "price",
        "stock",
        "main_image",
        "extra_images",
        "category_id",
        "publisher_id",
        "author_id",
        "status",
        "created_at",
        "updated_at",
      ],
      showDeleted: queryParams.showDeleted,
    });

    const sql = `
      SELECT ${selectColumns}
      FROM products p
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM products p ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const meta = buildPageMeta({ total, page, pageSize });
    return { data: rows, meta };
  },

  async getById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("p", showDeleted);

    const sql = `
      SELECT
        p.id, p.name, p.description, p.price, p.stock,
        p.main_image, p.extra_images,
        p.category_id, p.publisher_id, p.author_id,
        p.status, p.created_at, p.updated_at, p.deleted_at
      FROM products p
      WHERE p.id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;

    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  async create(data) {
    // No unique name check (allowed duplicate titles)
    if (data.price != null && Number(data.price) < 0) throw new Error("price must be >= 0");
    if (data.stock != null && Number(data.stock) < 0) throw new Error("stock must be >= 0");

    const id = uuidv4();

    const sql = `
      INSERT INTO products (
        id, name, description, price, stock,
        main_image, extra_images,
        category_id, publisher_id, author_id, status
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9, $10, $11
      )
      RETURNING
        id, name, description, price, stock,
        main_image, extra_images,
        category_id, publisher_id, author_id, status,
        created_at
    `;

    const params = [
      id,
      data.name || null,
      data.description || null,
      data.price || 0,
      data.stock || 0,
      data.main_image || null,
      data.extra_images || null,
      data.category_id || null,
      data.publisher_id || null,
      data.author_id || null,
      data.status || "ACTIVE",
    ];

    const { rows } = await db.query(sql, params);
    return rows[0];
  },

  async update(id, data) {
    // No unique name check (allowed duplicate titles)
    if (data.price != null && Number(data.price) < 0) throw new Error("price must be >= 0");
    if (data.stock != null && Number(data.stock) < 0) throw new Error("stock must be >= 0");

    const sql = `
      UPDATE products
      SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        stock = COALESCE($5, stock),
        main_image = COALESCE($6, main_image),
        extra_images = COALESCE($7, extra_images),
        category_id = COALESCE($8, category_id),
        publisher_id = COALESCE($9, publisher_id),
        author_id = COALESCE($10, author_id),
        status = COALESCE($11, status),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING
        id, name, description, price, stock,
        main_image, extra_images,
        category_id, publisher_id, author_id,
        status, updated_at
    `;

    const params = [
      id,
      data.name,
      data.description,
      data.price,
      data.stock,
      data.main_image,
      data.extra_images,
      data.category_id,
      data.publisher_id,
      data.author_id,
      data.status,
    ];

    const { rows } = await db.query(sql, params);
    return rows[0] || null;
  },

  async remove(id) {
    const sql = `
      UPDATE products
      SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default productService;
