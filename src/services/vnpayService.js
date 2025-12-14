import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import { getRequestContext } from "../middlewares/requestContext.js";

import vnpayConfig from "../integrations/vnpay.config.js";
import {
  buildPaymentUrl,
  formatVnpayDate,
  getClientIp,
  toVnpAmount,
  addMinutes,
} from "../integrations/vnpay.helper.js";
import {
  mapVnpayToGatewayPayload,
  isVnpaySuccess,
} from "../integrations/vnpay.mapper.js";

const vnpayService = {
  /**
   * Create (or reuse) a pending VNPAY payment for an order, then build redirect URL.
   *
   * Decision:
   * - FE passes order_id
   * - vnp_TxnRef = payment.id
   */
  async createPaymentUrl({ order_id, bankCode = null, locale = "vn" }, req) {
    const { user_id, role } = getRequestContext();
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // 1. Load order with row-level lock (prevent concurrent payments)
      const orderParams = [order_id];
      let ownerSql = "";

      if (role !== "ADMIN") {
        ownerSql = `AND o.user_id = $2`;
        orderParams.push(user_id);
      }

      const { rows: orderRows } = await client.query(
        `
      SELECT o.id, o.user_id, o.total_amount, o.status
      FROM orders o
      WHERE o.id = $1
        AND o.deleted_at IS NULL
        ${ownerSql}
      FOR UPDATE
      `,
        orderParams
      );

      if (!orderRows.length) {
        const e = new Error("Order not found");
        e.status = 404;
        throw e;
      }

      const order = orderRows[0];

      if (order.status !== "PENDING") {
        const e = new Error("Only PENDING orders can be paid via VNPAY");
        e.status = 400;
        throw e;
      }

      // 2. Find latest VNPAY payment attempt for this order
      const { rows: payRows } = await client.query(
        `
      SELECT id, amount, status
      FROM payments
      WHERE order_id = $1
        AND deleted_at IS NULL
        AND payment_method = 'VNPAY'
      ORDER BY created_at DESC
      LIMIT 1
      `,
        [order_id]
      );

      let payment = payRows[0] || null;

      // If order already has a completed VNPAY payment, block retry
      if (payment && payment.status === "COMPLETED") {
        const e = new Error("Order already paid");
        e.status = 400;
        throw e;
      }

      // 3. Create new payment attempt if needed
      if (!payment || payment.status === "INACTIVE") {
        const paymentId = uuidv4();

        const { rows: inserted } = await client.query(
          `
        INSERT INTO payments (
          id,
          order_id,
          payment_method,
          amount,
          status,
          gateway,
          payment_ref
        )
        VALUES ($1, $2, 'VNPAY', $3, 'PENDING', 'VNPAY', $4)
        RETURNING id, amount, status
        `,
          [paymentId, order_id, order.total_amount, paymentId]
        );

        payment = inserted[0];
      }

      // 4. Build VNPAY payment URL
      const amountVnp = toVnpAmount(payment.amount);
      if (!amountVnp) {
        const e = new Error("Invalid payment amount");
        e.status = 400;
        throw e;
      }

      const now = new Date();
      const createDate = formatVnpayDate(now);
      const expireDate = formatVnpayDate(addMinutes(now, 15));

      const ipAddr = getClientIp(req);
      const returnUrl = vnpayConfig.returnUrl;

      const vnpParams = {
        vnp_Version: vnpayConfig.version,
        vnp_Command: vnpayConfig.command,
        vnp_TmnCode: vnpayConfig.tmnCode,

        vnp_Amount: amountVnp,
        vnp_CurrCode: vnpayConfig.currCode,

        vnp_TxnRef: payment.id,
        vnp_OrderInfo: `Thanh toan don hang: ${order.id}`,
        vnp_OrderType: "other",

        vnp_Locale: locale || "vn",
        vnp_ReturnUrl: returnUrl,
        vnp_IpAddr: ipAddr,

        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate,
      };

      if (bankCode) {
        vnpParams.vnp_BankCode = bankCode;
      }

      const paymentUrl = buildPaymentUrl(
        vnpayConfig.paymentUrl,
        vnpParams,
        vnpayConfig.hashSecret
      );

      await client.query("COMMIT");

      return {
        order_id: order.id,
        payment_id: payment.id,
        paymentUrl,
        expiresAt: expireDate,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Handle VNPAY IPN callback.
   *
   * Responsibilities:
   * - Verify transaction validity (amount, signature already verified outside)
   * - Ensure idempotency
   * - Delegate order finalization to paymentService.completeOrderPayment
   *
   * @param {Object} vnpQuery
   * @returns {Object} VNPAY response
   */
  async handleIpn(vnpQuery) {
    const payload = mapVnpayToGatewayPayload(vnpQuery);

    const paymentId = String(vnpQuery.vnp_TxnRef || "");
    if (!paymentId) {
      return { RspCode: "01", Message: "Order not found" };
    }

    // 1. Load payment and order
    const { rows } = await db.query(
      `
    SELECT p.id, p.order_id, p.amount, p.status
    FROM payments p
    JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
    WHERE p.id = $1
      AND p.deleted_at IS NULL
    LIMIT 1
    `,
      [paymentId]
    );

    if (!rows.length) {
      return { RspCode: "01", Message: "Order not found" };
    }

    const pay = rows[0];

    // 2. Amount validation (VNPAY amount is multiplied by 100)
    const vnpAmount = Number(vnpQuery.vnp_Amount || 0);
    const localAmount = Math.round(Number(pay.amount) * 100);

    if (!Number.isFinite(vnpAmount) || vnpAmount !== localAmount) {
      return { RspCode: "04", Message: "Invalid amount" };
    }

    // 3. Idempotency
    if (pay.status === "COMPLETED") {
      return { RspCode: "02", Message: "Order already confirmed" };
    }

    // 4. Process transaction
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const ok = isVnpaySuccess(vnpQuery);

      if (!ok) {
        await client.query(
          `
        UPDATE payments
        SET status = 'INACTIVE',
            gateway = 'VNPAY',
            gateway_response_code = $2,
            gateway_payload = $3::jsonb,
            updated_at = now()
        WHERE id = $1
          AND deleted_at IS NULL
        `,
          [
            pay.id,
            String(vnpQuery.vnp_ResponseCode || ""),
            JSON.stringify(payload),
          ]
        );

        await client.query("COMMIT");
        return {
          RspCode: "00",
          Message: "Payment failed, order not completed",
        };
      }

      // Success: delegate to unified completion logic
      await paymentService.completeOrderPayment(
        pay.order_id,
        { via: "GATEWAY", gateway: "VNPAY" },
        client
      );

      await client.query("COMMIT");
      return { RspCode: "00", Message: "Confirm Success" };
    } catch (e) {
      await client.query("ROLLBACK");
      return { RspCode: "99", Message: "Unknown error" };
    } finally {
      client.release();
    }
  },

  /**
   * Handle ReturnURL (browser redirect).
   * We only verify & return a UI-friendly result, no DB update required.
   */
  buildReturnResult(vnpQuery) {
    const ok = isVnpaySuccess(vnpQuery);
    return {
      success: ok,
      code: String(vnpQuery.vnp_ResponseCode || ""),
      transactionStatus: String(vnpQuery.vnp_TransactionStatus || ""),
      payment_id: String(vnpQuery.vnp_TxnRef || ""),
      orderInfo: String(vnpQuery.vnp_OrderInfo || ""),
    };
  },
};

export default vnpayService;
