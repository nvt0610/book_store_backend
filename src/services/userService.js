import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import nameHelper from "../helpers/nameHelper.js";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import passwordHelper from "../helpers/passwordHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { normalizeName } = nameHelper;
const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildGlobalSearch, buildSelectColumns } = queryHelper;

/**
 * Service layer for handling user-related CRUD operations.
 * This layer interacts with the database only â€” no HTTP or response logic.
 */
const userService = {
    /**
     * Get paginated, searchable, and sortable list of users.
     * Supports soft-delete exclusion and filter-based WHERE conditions.
     * 
     * @param {Object} queryParams - Request query (filters, search, sort, pagination)
     * @returns {Promise<{ data: Array, meta: Object }>}
     */
    async listUsers(queryParams = {}) {
        // Extract and normalize pagination
        const { page, pageSize, limit, offset } = parsePagination(queryParams);

        // Build optional filters + search + sorting
        const allowedColumns = ["email", "full_name", "phone", "role", "status", "created_at"];
        const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];
        const searchText = queryParams.q;

        const search = buildGlobalSearch({
            q: searchText,
            columns: ["email", "full_name", "phone", "role::text", "status::text"],
            alias: "u",
        });

        const where = buildFiltersWhere({
            filters,
            rawQuery: queryParams,
            allowedColumns,
            alias: "u",
        });

        // Merge all where parts and always exclude soft-deleted
        const { showDeleted = "active" } = queryParams;
        const softDeleteFilter = buildSoftDeleteScope("u", showDeleted);

        const { whereSql, params: whereParams } = mergeWhereParts([
            softDeleteFilter,
            search,
            where,
        ]);

        const orderBy = buildOrderBy({
            sortBy: queryParams.sortBy,
            sortDir: queryParams.sortDir,
            allowedSort: ["created_at", "email", "full_name"],
            alias: "u",
        });

        const selectColumns = buildSelectColumns({
            alias: "u",
            columns: [
                "id",
                "full_name",
                "first_name",
                "last_name",
                "email",
                "phone",
                "role",
                "status",
                "created_at",
                "updated_at",
            ],
            showDeleted,
        });

        // Main query with limit/offset
        const sql = `
    SELECT ${selectColumns}
    FROM users u
    ${whereSql}
    ${orderBy || "ORDER BY u.created_at DESC"}
    LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}
  `;

        const { rows } = await db.query(sql, [...whereParams, limit, offset]);

        // Count total for meta
        const countSql = `
    SELECT COUNT(*) AS total
    FROM users u
    ${whereSql}
  `;
        const { rows: countRows } = await db.query(countSql, whereParams);
        const total = Number(countRows[0]?.total || 0);

        const meta = buildPageMeta({ total, page, pageSize });
        return { data: rows, meta };
    },

    /**
  * Fetch a single user by ID.
  * @param {string} id - UUID of the user.
  * @param {string} [showDeleted="active"] - Scope filter ("active" | "deleted" | "all")
  * @returns {Promise<Object|null>}
  */
    async getUserById(id, showDeleted = "active") {
        const softDeleteFilter = buildSoftDeleteScope("", showDeleted);

        const sql = `
        SELECT id, full_name, first_name, last_name, email, phone, role, status,
               created_at, updated_at, deleted_at
        FROM users
        WHERE id = $1
        ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;

        const { rows } = await db.query(sql, [id]);
        return rows[0] || null;
    },

    /**
     * Create a new user record (with normalized names).
     * @param {Object} data - User creation payload.
     * @returns {Promise<Object>} Created user record.
     */
    async createUser(data) {
        const id = uuidv4();
        const { full_name, first_name, last_name } = normalizeName(data);

        // Hash password 
        const hashedPassword = await passwordHelper.hashPassword(data.password);

        const sql = `
    INSERT INTO users (id, full_name, first_name, last_name, email, password, phone, role)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, full_name, first_name, last_name, email, phone, role, status, created_at
  `;
        const params = [
            id,
            full_name,
            first_name,
            last_name,
            data.email,
            hashedPassword,
            data.phone,
            data.role || "CUSTOMER",
        ];

        const { rows } = await db.query(sql, params);
        return rows[0];
    },

    /**
     * Update an existing user record (supports partial updates + name normalization).
     * @param {string} id - UUID of the user.
     * @param {Object} data - Fields to update.
     * @returns {Promise<Object|null>}
     */
    async updateUser(id, data) {
        const { full_name, first_name, last_name } = normalizeName(data);

        // hash password if provided
        let hashedPassword = null;
        if (data.password) {
            hashedPassword = await passwordHelper.hashPassword(data.password);
        }

        const sql = `
    UPDATE users
    SET
      full_name  = COALESCE($2, full_name),
      first_name = COALESCE($3, first_name),
      last_name  = COALESCE($4, last_name),
      phone      = COALESCE($5, phone),
      role       = COALESCE($6, role),
      status     = COALESCE($7, status),
      password   = COALESCE($8, password),
      updated_at = now()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING id, full_name, first_name, last_name, email, phone, role, status, updated_at
  `;
        const params = [
            id,
            full_name,
            first_name,
            last_name,
            data.phone,
            data.role,
            data.status,
            hashedPassword,
        ];

        const { rows } = await db.query(sql, params);
        return rows[0] || null;
    },

    async setStatus(id, status) {
        if (!["ACTIVE", "INACTIVE"].includes(status)) {
            const e = new Error("Invalid status value");
            e.status = 400;
            throw e;
        }

        const sql = `
      UPDATE users
      SET status = $2, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, full_name, email, phone, role, status, updated_at
    `;

        const { rows } = await db.query(sql, [id, status]);
        return rows[0] || null;
    },

    /**
 * Soft delete user:
 * - ÄĂ¡nh dáº¥u deleted_at = now()
 * - Äá»•i status sang 'INACTIVE'
 * @param {string} id - UUID cá»§a user
 * @returns {Promise<boolean>}
 */
    async deleteUser(id) {
        const sql = `
      UPDATE users
      SET 
        deleted_at = now(),
        status = 'INACTIVE',
        updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const { rowCount } = await db.query(sql, [id]);
        return rowCount > 0;
    }
};

export default userService;
