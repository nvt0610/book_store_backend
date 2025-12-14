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

const productService = {
  async list(queryParams = {}) {
    // ----------------------------------------
    // Pagination
    // ----------------------------------------
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    // ----------------------------------------
    // Whitelisted filterable columns
    // ----------------------------------------
    const allowedFilters = [
      "id",
      "name",
      "price",
      "stock",
      "status",
      "category_id",
      "publisher_id",
      "author_id",
      "created_at",
    ];

    // ----------------------------------------
    // Global search (name + description)
    // ----------------------------------------
    const search = buildGlobalSearch({
      q: queryParams.q,
      columns: ["name", "description"],
      alias: "p",
    });

    // ----------------------------------------
    // Structured filters (filters[] or friendly query)
    // ----------------------------------------
    const filters = Array.isArray(queryParams.filters)
      ? queryParams.filters
      : [];

    const where = buildFiltersWhere({
      filters,
      rawQuery: queryParams,
      allowedColumns: allowedFilters,
      alias: "p",
    });

    // ----------------------------------------
    // Soft delete scope
    // ----------------------------------------
    const softDelete = buildSoftDeleteScope(
      "p",
      queryParams.showDeleted || "active"
    );

    // ----------------------------------------
    // Merge WHERE conditions safely
    // ----------------------------------------
    const { whereSql, params } = mergeWhereParts([softDelete, search, where]);

    // ----------------------------------------
    // Sorting (safe whitelist)
    // ----------------------------------------
    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["name", "price", "stock", "created_at", "updated_at"],
        alias: "p",
      }) || "ORDER BY p.created_at DESC";

    // ----------------------------------------
    // Select columns
    // ----------------------------------------
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

    // ----------------------------------------
    // Main query
    // ----------------------------------------
    const sql = `
  SELECT
    ${selectColumns},
    a.name AS author_name,
    pub.name AS publisher_name
  FROM products p
  LEFT JOIN authors a 
    ON a.id = p.author_id AND a.deleted_at IS NULL
  LEFT JOIN publishers pub
    ON pub.id = p.publisher_id AND pub.deleted_at IS NULL
  ${whereSql}
  ${orderBy}
  LIMIT $${params.length + 1}
  OFFSET $${params.length + 2}
`;

    const { rows } = await db.query(sql, [...params, limit, offset]);

    // ----------------------------------------
    // Total count (for pagination)
    // ----------------------------------------
    const countSql = `
    SELECT COUNT(*) AS total
    FROM products p
    ${whereSql}
  `;

    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    // ----------------------------------------
    // Pagination metadata
    // ----------------------------------------
    const meta = buildPageMeta({ total, page, pageSize });

    return {
      data: rows,
      meta,
    };
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
      WHERE p.id = $1 ${
        softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""
      }
    `;

    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  async create(data) {
    // Cho phĂ©p trĂ¹ng tĂªn sĂ¡ch â†’ khĂ´ng check unique
    let price = 0;
    if (data.price != null) {
      price = Number(data.price);
      if (Number.isNaN(price)) {
        const e = new Error("price must be a valid number");
        e.status = 400;
        throw e;
      }
    }
    if (price < 0) {
      const e = new Error("price must be >= 0");
      e.status = 400;
      throw e;
    }

    let stock = 0;
    if (data.stock != null) {
      stock = Number(data.stock);
      if (Number.isNaN(stock)) {
        const e = new Error("stock must be a valid integer");
        e.status = 400;
        throw e;
      }
      if (stock < 0) {
        const e = new Error("stock must be >= 0");
        e.status = 400;
        throw e;
      }
    }

    // extra_images: allow empty array [], but forbid null
    let extraImages = null;

    if ("extra_images" in data) {
      if (data.extra_images === null) {
        const e = new Error(
          "extra_images cannot be null. Use [] to clear images."
        );
        e.status = 400;
        throw e;
      }

      if (!Array.isArray(data.extra_images)) {
        const e = new Error("extra_images must be an array");
        e.status = 400;
        throw e;
      }

      // FE wants to set empty list â†’ []
      extraImages = data.extra_images.map((v) => String(v));
    }

    const id = uuidv4();

    // Validate foreign keys
    // 1. Publisher must exist and not deleted
    const pub = await db.query(
      `SELECT id FROM publishers WHERE id = $1 AND deleted_at IS NULL`,
      [data.publisher_id]
    );
    if (pub.rowCount === 0) {
      const e = new Error("publisher_id does not exist");
      e.status = 400;
      throw e;
    }

    // 2. Author must exist and not deleted
    const auth = await db.query(
      `SELECT id FROM authors WHERE id = $1 AND deleted_at IS NULL`,
      [data.author_id]
    );
    if (auth.rowCount === 0) {
      const e = new Error("author_id does not exist");
      e.status = 400;
      throw e;
    }

    // 3. Category exists (if provided)
    if (data.category_id) {
      const cat = await db.query(
        `SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL`,
        [data.category_id]
      );
      if (cat.rowCount === 0) {
        const e = new Error("category_id does not exist");
        e.status = 400;
        throw e;
      }
    }

    // 4. Validate product status
    if (data.status && !["ACTIVE", "INACTIVE"].includes(data.status)) {
      const e = new Error("Invalid status value");
      e.status = 400;
      throw e;
    }

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
      price,
      stock,
      data.main_image || null,
      extraImages,
      data.category_id || null,
      data.publisher_id || null,
      data.author_id || null,
      data.status || "ACTIVE",
    ];

    try {
      const { rows } = await db.query(sql, params);
      return rows[0];
    } catch (err) {
      throw err;
    }
  },

  async update(id, data) {
    // FK validation
    if (data.publisher_id) {
      const pub = await db.query(
        `SELECT id FROM publishers WHERE id = $1 AND deleted_at IS NULL`,
        [data.publisher_id]
      );
      if (!pub.rowCount) {
        const e = new Error("publisher_id does not exist");
        e.status = 400;
        throw e;
      }
    }

    if (data.author_id) {
      const auth = await db.query(
        `SELECT id FROM authors WHERE id = $1 AND deleted_at IS NULL`,
        [data.author_id]
      );
      if (!auth.rowCount) {
        const e = new Error("author_id does not exist");
        e.status = 400;
        throw e;
      }
    }

    if (data.category_id) {
      const cat = await db.query(
        `SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL`,
        [data.category_id]
      );
      if (!cat.rowCount) {
        const e = new Error("category_id does not exist");
        e.status = 400;
        throw e;
      }
    }

    if (data.status && !["ACTIVE", "INACTIVE"].includes(data.status)) {
      const e = new Error("Invalid status value");
      e.status = 400;
      throw e;
    }

    let price = null;
    if (data.price != null) {
      price = Number(data.price);
      if (Number.isNaN(price)) {
        const e = new Error("price must be a valid number");
        e.status = 400;
        throw e;
      }
      if (price < 0) {
        const e = new Error("price must be >= 0");
        e.status = 400;
        throw e;
      }
    }

    let stock = null;
    if (data.stock != null) {
      stock = Number(data.stock);
      if (Number.isNaN(stock)) {
        const e = new Error("stock must be a valid integer");
        e.status = 400;
        throw e;
      }
      if (stock < 0) {
        const e = new Error("stock must be >= 0");
        e.status = 400;
        throw e;
      }
    }

    let extraImages = undefined; // undefined â†’ skip update, null â†’ forbidden

    if ("extra_images" in data) {
      if (data.extra_images === null) {
        const e = new Error(
          "extra_images cannot be null. Use [] to clear images."
        );
        e.status = 400;
        throw e;
      }

      if (!Array.isArray(data.extra_images)) {
        const e = new Error("extra_images must be an array");
        e.status = 400;
        throw e;
      }

      extraImages = data.extra_images.map((v) => String(v)); // may be []

      extraImages = `{${extraImages.map((v) => `"${v}"`).join(",")}}`;
    }

    const sql = `
      UPDATE products
      SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        stock = COALESCE($5, stock),
        main_image = COALESCE($6, main_image),
        extra_images = COALESCE($7::text[], extra_images),
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
      data.name ?? null,
      data.description ?? null,
      price,
      stock,
      data.main_image ?? null,
      extraImages ?? null,
      data.category_id ?? null,
      data.publisher_id ?? null,
      data.author_id ?? null,
      data.status ?? null,
    ];

    try {
      const { rows } = await db.query(sql, params);
      return rows[0] || null;
    } catch (err) {
      throw err;
    }
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
