import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy } = queryHelper;

/**
 * Service layer: Payments CRUD + lifecycle management (order sync, stock updates)
 */
const paymentService = {
    /**
     * List all payments with pagination and filters
     */
    async listPayments(queryParams = {}) {
        const { page, pageSize, limit, offset } = parsePagination(queryParams);

        const allowedFilters = ["order_id", "status", "payment_method"];
        const filters = Array.isArray(queryParams.filters) ? queryParams.filters : [];

        const where = buildFiltersWhere({
            filters,
            allowedColumns: allowedFilters,
            alias: "p",
        });

        const softDeleteFilter = buildSoftDeleteScope("p", queryParams.showDeleted || "active");
        const { whereSql, params } = mergeWhereParts([softDeleteFilter, where]);

        const orderBy =
            buildOrderBy({
                sortBy: queryParams.sortBy,
                sortDir: queryParams.sortDir,
                allowedSort: ["created_at", "payment_date", "status"],
                alias: "p",
            }) || "ORDER BY p.created_at DESC";

        const sql = `
      SELECT 
        p.id, p.order_id, p.payment_method, p.amount, p.status,
        p.payment_ref, p.payment_date, p.created_at, p.updated_at
      FROM payments p
      ${whereSql}
      ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
        const { rows } = await db.query(sql, [...params, limit, offset]);

        const countSql = `SELECT COUNT(*) AS total FROM payments p ${whereSql}`;
        const { rows: countRows } = await db.query(countSql, params);
        const total = Number(countRows[0]?.total || 0);

        return { data: rows, meta: buildPageMeta({ total, page, pageSize }) };
    },

    /**
     * Get single payment by ID
     */
    async getPaymentById(id, showDeleted = "active") {
        const softDeleteFilter = buildSoftDeleteScope("p", showDeleted);
        const sql = `
      SELECT 
        p.id, p.order_id, p.payment_method, p.amount, p.status,
        p.payment_ref, p.payment_date, p.created_at, p.updated_at, p.deleted_at
      FROM payments p
      WHERE p.id = $1 ${softDeleteFilter.sql ? `AND ${softDeleteFilter.sql}` : ""}
    `;
        const { rows } = await db.query(sql, [id]);
        return rows[0] || null;
    },

    /**
     * Create a new payment (usually created when order is placed)
     */
    async createPayment({ orderId, paymentMethod = "COD", amount }) {
        const sql = `
      INSERT INTO payments (id, order_id, payment_method, amount, status, created_at)
      VALUES ($1, $2, $3, $4, 'PENDING', now())
      RETURNING id, order_id, payment_method, amount, status, created_at
    `;
        const { rows } = await db.query(sql, [uuidv4(), orderId, paymentMethod, amount]);
        return rows[0];
    },

    /**
     * Update payment (status or payment_ref)
     * Handles side effects on orders and product stocks
     */
    async updatePayment(id, data) {
        const client = await db.getClient();
        try {
            await client.query("BEGIN");

            // Update payment status and ref
            const sets = [];
            const params = [id];
            if (data.status) {
                sets.push(`status = $${params.length + 1}`);
                params.push(data.status);
            }
            if (data.payment_ref) {
                sets.push(`payment_ref = $${params.length + 1}`);
                params.push(data.payment_ref);
            }
            if (data.payment_date) {
                sets.push(`payment_date = $${params.length + 1}`);
                params.push(data.payment_date);
            }

            if (sets.length === 0) {
                const { rows } = await client.query(`SELECT * FROM payments WHERE id = $1`, [id]);
                await client.release();
                return rows[0] || null;
            }

            const updateSql = `
        UPDATE payments
        SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, order_id, amount, status, payment_method, payment_date
      `;
            const { rows: payRows } = await client.query(updateSql, params);
            if (payRows.length === 0) throw new Error("Payment not found");

            const payment = payRows[0];

            // Sync logic between payment, order, and products
            if (data.status === "COMPLETED") {
                // Mark order completed
                await client.query(
                    `UPDATE orders SET status = 'COMPLETED', paid_at = now(), updated_at = now() WHERE id = $1`,
                    [payment.order_id]
                );

                // Reduce product stock based on order items
                const { rows: items } = await client.query(
                    `SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND deleted_at IS NULL`,
                    [payment.order_id]
                );
                for (const it of items) {
                    await client.query(
                        `UPDATE products SET stock = GREATEST(stock - $2, 0), updated_at = now() WHERE id = $1`,
                        [it.product_id, it.quantity]
                    );
                }
            } else if (data.status === "INACTIVE") {
                // Check if order was previously completed
                const { rows: oldOrder } = await client.query(
                    `SELECT status FROM orders WHERE id = $1`,
                    [payment.order_id]
                );
                const wasCompleted = oldOrder[0]?.status === "COMPLETED";

                // Mark order inactive
                await client.query(
                    `UPDATE orders SET status = 'INACTIVE', updated_at = now() WHERE id = $1`,
                    [payment.order_id]
                );

                // Restore product stock if the order was completed before
                if (wasCompleted) {
                    const { rows: items } = await client.query(
                        `SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND deleted_at IS NULL`,
                        [payment.order_id]
                    );
                    for (const it of items) {
                        await client.query(
                            `UPDATE products SET stock = stock + $2, updated_at = now() WHERE id = $1`,
                            [it.product_id, it.quantity]
                        );
                    }
                }
            }

            await client.query("COMMIT");
            return payment;
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    },

    /**
     * Soft delete payment
     */
    async deletePayment(id) {
        const sql = `
      UPDATE payments
      SET deleted_at = now(), updated_at = now(), status = 'INACTIVE'
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const { rowCount } = await db.query(sql, [id]);
        return rowCount > 0;
    },
};

export default paymentService;
