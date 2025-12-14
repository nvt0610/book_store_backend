// src/services/paymentService.js

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
    buildSelectColumns,
} = queryHelper;

/**
 * Service layer: Payments CRUD + helpers
 */
const paymentService = {
    /**
     * List all payments with pagination + filters
     */
    async listPayments(queryParams = {}) {
        const { page, pageSize, limit, offset } = parsePagination(queryParams);

        const allowedFilters = ["order_id", "payment_method", "status"];
        const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

        const where = buildFiltersWhere({
            filters,
            rawQuery: queryParams,
            allowedColumns: allowedFilters,
            alias: "p",
        });

        const softDeleteFilter = buildSoftDeleteScope(
            "p",
            queryParams.showDeleted || "active",
        );

        let { whereSql, params } = mergeWhereParts([softDeleteFilter, where]);

        const { user_id, role } = getRequestContext();
        let joinSql = "";

        if (role !== "ADMIN") {
            joinSql = `
        JOIN orders o2 
          ON o2.id = p.order_id
         AND o2.user_id = $${params.length + 1}
         AND o2.deleted_at IS NULL
      `;
            params.push(user_id);
        }

        const orderBy =
            buildOrderBy({
                sortBy: queryParams.sortBy,
                sortDir: queryParams.sortDir,
                allowedSort: ["created_at", "payment_date", "amount"],
                alias: "p",
            }) || "ORDER BY p.created_at DESC";

        const selectColumns = buildSelectColumns({
            alias: "p",
            columns: [
                "id",
                "order_id",
                "payment_method",
                "amount",
                "status",
                "payment_ref",
                "payment_date",
                "created_at",
                "updated_at",
            ],
            showDeleted: queryParams.showDeleted,
        });

        const sql = `
      SELECT ${selectColumns}
      FROM payments p
      ${joinSql}
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

        const { rows } = await db.query(sql, [...params, limit, offset]);

        const countSql = `
      SELECT COUNT(*) AS total
      FROM payments p
      ${joinSql}
      ${whereSql}
    `;
        const { rows: countRows } = await db.query(countSql, params);

        return {
            data: rows,
            meta: buildPageMeta({
                total: Number(countRows[0]?.total || 0),
                page,
                pageSize,
            }),
        };
    },

    /**
     * Get one payment by id
     */
    async getById(id, showDeleted = "active") {
        const softDeleteFilter = buildSoftDeleteScope("p", showDeleted);
        const { user_id, role } = getRequestContext();

        let ownerCheckSql = "";
        const params = [id];

        if (role !== "ADMIN") {
            ownerCheckSql = `
            AND EXISTS (
                SELECT 1 FROM orders o
                WHERE o.id = p.order_id
                  AND o.user_id = $2
                  AND o.deleted_at IS NULL
            )
        `;
            params.push(user_id);
        }

        const sql = `
      SELECT id, order_id, payment_method, amount, status,
             payment_ref, payment_date, created_at, updated_at, deleted_at
      FROM payments p
      WHERE id = $1 
        ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
        ${ownerCheckSql}
    `;

        const { rows } = await db.query(sql, params);
        return rows[0] || null;
    },

    /**
     * List payments of a single order
     */
    async listByOrder(order_id) {
        const { user_id, role } = getRequestContext();
        let ownerCheckSql = "";
        const params = [order_id];

        if (role !== "ADMIN") {
            ownerCheckSql = `
            AND EXISTS (
                SELECT 1 FROM orders o
                WHERE o.id = payments.order_id
                  AND o.user_id = $2
                  AND o.deleted_at IS NULL
            )
        `;
            params.push(user_id);
        }

        const sql = `
        SELECT id, order_id, payment_method, amount, status,
               payment_ref, payment_date, created_at, updated_at
        FROM payments
        WHERE order_id = $1
          AND deleted_at IS NULL
          ${ownerCheckSql}
        ORDER BY created_at DESC
    `;

        const { rows } = await db.query(sql, params);
        return rows;
    },

    /**
     * Create manual payment (admin)
     */
    async createPayment(data) {
        const id = uuidv4();
        const {
            order_id,
            payment_method = "COD",
            amount,
            payment_ref = null,
            payment_date = null,
            status = "PENDING",
        } = data;

        if (!order_id || amount == null) {
            const e = new Error("order_id and amount are required");
            e.status = 400;
            throw e;
        }

        // Rule 1: Check order status
        const { rows: orderRows } = await db.query(
            `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
            [order_id]
        );

        if (!orderRows.length) {
            const e = new Error("Order not found");
            e.status = 404;
            throw e;
        }

        if (orderRows[0].status === "COMPLETED") {
            const e = new Error("Cannot create a payment for a COMPLETED order");
            e.status = 400;
            throw e;
        }

        // Rule 2: Enforce (one payment per order)
        const { rows: existingPay } = await db.query(
            `SELECT id FROM payments 
         WHERE order_id = $1 AND deleted_at IS NULL 
         LIMIT 1`,
            [order_id]
        );

        if (existingPay.length) {
            const e = new Error("Order already has a payment");
            e.status = 400;
            throw e;
        }

        // INSERT payment
        const sql = `
        INSERT INTO payments (
            id, order_id, payment_method, amount, status,
            payment_ref, payment_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;

        const { rows } = await db.query(sql, [
            id,
            order_id,
            payment_method,
            amount,
            status,
            payment_ref,
            payment_date,
        ]);

        return rows[0];
    },

    /**
     * Update payment (status, ref, method, amount, payment_date)
     */
    async updatePayment(id, data) {
        // Rule 1: cannot set COMPLETED via updatePayment
        if (data.status === "COMPLETED") {
            const e = new Error(
                "Cannot set status to COMPLETED via updatePayment(). Use markPaymentCompletedByOrder()."
            );
            e.status = 400;
            throw e;
        }

        // Load current payment
        const { rows: curRows } = await db.query(
            `SELECT order_id, amount, status FROM payments WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );
        if (!curRows.length) return null;

        const { order_id, status: currentStatus } = curRows[0];

        // Rule 3: cannot modify payments of a COMPLETED order
        const { rows: orderRows } = await db.query(
            `SELECT status FROM orders WHERE id = $1 AND deleted_at IS NULL`,
            [order_id]
        );
        if (orderRows.length && orderRows[0].status === "COMPLETED") {
            const e = new Error("Cannot modify payment of a COMPLETED order.");
            e.status = 400;
            throw e;
        }

        // Rule 2: cannot modify amount/status of completed payment
        if (currentStatus === "COMPLETED") {
            if (data.amount !== undefined || data.status !== undefined) {
                const e = new Error(
                    "Cannot modify amount or status of a COMPLETED payment."
                );
                e.status = 400;
                throw e;
            }
        }

        const allowed = ["payment_method", "amount", "status", "payment_ref", "payment_date"];
        const fields = [];
        const params = [id];

        for (const key of allowed) {
            if (data[key] !== undefined) {
                fields.push(`${key} = $${params.length + 1}`);
                params.push(data[key]);
            }
        }

        if (fields.length === 0) {
            return await this.getById(id);
        }

        const sql = `
        UPDATE payments
        SET ${fields.join(", ")}, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *
    `;

        const { rows } = await db.query(sql, params);
        return rows[0] || null;
    },

    /**
     * Soft delete payment
     */
    async deletePayment(id) {
        // Load payment status
        const { rows: payRows } = await db.query(
            `SELECT status FROM payments WHERE id = $1 AND deleted_at IS NULL`,
            [id]
        );

        if (!payRows.length) return false;

        if (payRows[0].status === "COMPLETED") {
            const e = new Error("Cannot delete a COMPLETED payment");
            e.status = 400;
            throw e;
        }

        const sql = `
      UPDATE payments
      SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
      WHERE id = $1 AND deleted_at IS NULL
    `;

        const { rowCount } = await db.query(sql, [id]);
        return rowCount > 0;
    },

    /**
     * Mark latest pending payment of an order as COMPLETED
     * and optionally sync order status to COMPLETED.
     */
    async markPaymentCompletedByOrder(order_id, { syncOrder = true } = {}) {
        const client = await db.getClient();

        try {
            await client.query("BEGIN");

            const { rows: payRows } = await client.query(
                `
            SELECT id
            FROM payments
            WHERE order_id = $1
              AND deleted_at IS NULL
              AND status = 'PENDING'
            ORDER BY created_at DESC
            LIMIT 1
            `,
                [order_id]
            );

            if (!payRows.length) {
                const e = new Error("No pending payment found for this order");
                e.status = 404;
                throw e;
            }

            const payment_id = payRows[0].id;

            const { rows: items } = await client.query(
                `
            SELECT oi.product_id, oi.quantity
            FROM order_items oi
            WHERE oi.order_id = $1
              AND oi.deleted_at IS NULL
            `,
                [order_id]
            );

            for (const it of items) {
                const { rows: stockRows } = await client.query(
                    `
                SELECT stock 
                FROM products 
                WHERE id = $1 AND deleted_at IS NULL
                `,
                    [it.product_id]
                );

                if (!stockRows.length) {
                    throw new Error(`Product ${it.product_id} not found`);
                }

                const stock = Number(stockRows[0].stock);
                const qty = Number(it.quantity);

                if (stock < qty) {
                    const e = new Error(
                        `Cannot complete order: product ${it.product_id} has only ${stock} units in stock`
                    );
                    e.status = 400;
                    throw e;
                }
            }

            for (const it of items) {
                await client.query(
                    `
                UPDATE products
                SET stock = stock - $2,
                    updated_at = now()
                WHERE id = $1
                  AND deleted_at IS NULL
                `,
                    [it.product_id, it.quantity]
                );
            }

            await client.query(
                `
            UPDATE payments
            SET status = 'COMPLETED',
                payment_date = now(),
                updated_at = now()
            WHERE id = $1
              AND deleted_at IS NULL
            `,
                [payment_id]
            );

            if (syncOrder) {
                await client.query(
                    `
                UPDATE orders
                SET status = 'COMPLETED',
                    paid_at = now(),
                    updated_at = now()
                WHERE id = $1
                  AND deleted_at IS NULL
                `,
                    [order_id]
                );
            }

            await client.query("COMMIT");
            return { order_id, payment_id };
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    },

    /**
     * Cancel all pending payments of an order (set status = INACTIVE)
     * Does NOT touch order.status (order cancel is handled by orderService.cancelOrder).
     */
    async cancelPendingByOrder(order_id) {
        const sql = `
      UPDATE payments
      SET status = 'INACTIVE',
          updated_at = now()
      WHERE order_id = $1
        AND deleted_at IS NULL
        AND status = 'PENDING'
    `;

        const { rowCount } = await db.query(sql, [order_id]);
        return { affectedPayments: rowCount };
    },
};

export default paymentService;
