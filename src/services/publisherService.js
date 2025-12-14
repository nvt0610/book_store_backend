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

const publisherService = {
  async listPublishers(queryParams = {}) {
    const { page, pageSize, limit, offset } = parsePagination(queryParams);

    const allowedColumns = ["name", "phone", "website", "created_at"];
    const filters = Array.isArray(queryParams.filters)
      ? queryParams.filters
      : [];
    const searchText = queryParams.q;

    const search = buildGlobalSearch({
      q: searchText,
      columns: ["name", "address", "phone", "website"],
      alias: "p",
    });

    const where = buildFiltersWhere({ filters, allowedColumns, alias: "p" });
    const softDeleteFilter = buildSoftDeleteScope(
      "p",
      queryParams.showDeleted || "active"
    );
    const { whereSql, params } = mergeWhereParts([
      softDeleteFilter,
      search,
      where,
    ]);

    const orderBy =
      buildOrderBy({
        sortBy: queryParams.sortBy,
        sortDir: queryParams.sortDir,
        allowedSort: ["name", "created_at"],
        alias: "p",
      }) || "ORDER BY p.created_at DESC";

    const baseColumns = buildSelectColumns({
      alias: "p",
      columns: [
        "id",
        "name",
        "address",
        "phone",
        "website",
        "logo_url",
        "created_at",
        "updated_at",
      ],
      showDeleted: queryParams.showDeleted,
    });

    const selectColumns = `
    ${baseColumns},
    COUNT(DISTINCT pr.id) AS product_count
  `;

    const sql = `
    SELECT ${selectColumns}
    FROM publishers p
    LEFT JOIN products pr
      ON pr.publisher_id = p.id AND pr.deleted_at IS NULL
    ${whereSql}
    GROUP BY p.id
    ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

    const { rows } = await db.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) AS total FROM publishers p ${whereSql}`;
    const { rows: countRows } = await db.query(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const meta = buildPageMeta({ total, page, pageSize });
    return { data: rows, meta };
  },

  async getPublisherById(id, showDeleted = "active") {
    const softDeleteFilter = buildSoftDeleteScope("", showDeleted);

    const sql = `
    SELECT id, name, address, phone, website, logo_url, created_at, updated_at, deleted_at
    FROM publishers
    WHERE id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
  `;
    const { rows } = await db.query(sql, [id]);
    const publisher = rows[0] || null;
    if (!publisher) return null;

    const productSql = `
    SELECT id, name, price, stock, created_at, updated_at
    FROM products
    WHERE publisher_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
    const { rows: products } = await db.query(productSql, [id]);

    publisher.products = products;
    publisher.product_count = products.length;

    return publisher;
  },

  async createPublisher(data) {
    const id = uuidv4();

    // Check duplicate name
    const exists = await db.query(
      "SELECT 1 FROM publishers WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
      [data.name]
    );
    if (exists.rowCount > 0) {
      const err = new Error("Name already exists");
      err.status = 409;
      throw err;
    }

    // Normalize optional fields: undefined â†’ null
    const address = data.address ?? null;
    const phone = data.phone ?? null;
    const website = data.website ?? null;
    const logo_url = data.logo_url ?? null;

    const sql = `
    INSERT INTO publishers (id, name, address, phone, website, logo_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, address, phone, website, logo_url, created_at
  `;

    const params = [
      id,
      data.name, // required
      address, // normalized
      phone,
      website,
      logo_url,
    ];

    const { rows } = await db.query(sql, params);
    return rows[0];
  },

  async updatePublisher(id, data) {
    if (data.name) {
      const dup = await db.query(
        "SELECT 1 FROM publishers WHERE LOWER(name) = LOWER($1) AND id <> $2 AND deleted_at IS NULL",
        [data.name, id]
      );
      if (dup.rowCount > 0) {
        const err = new Error("Name already exists");
        err.status = 409;
        throw err;
      }
    }

    const sql = `
      UPDATE publishers
      SET
        name = COALESCE($2, name),
        address = COALESCE($3, address),
        phone   = COALESCE($4, phone),
        website = COALESCE($5, website),
        logo_url = COALESCE($6, logo_url),
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, name, address, phone, website, logo_url, updated_at
    `;
    const { rows } = await db.query(sql, [
      id,
      data.name,
      data.address,
      data.phone,
      data.website,
      data.logo_url,
    ]);
    return rows[0] || null;
  },

  async deletePublisher(id) {
    const ref = await db.query(
      `SELECT id FROM products WHERE publisher_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (ref.rows.length) {
      const e = new Error(
        "Cannot delete publisher: products are still referencing this publisher"
      );
      e.status = 400;
      throw e;
    }

    const sql = `
      UPDATE publishers
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  },
};

export default publisherService;
