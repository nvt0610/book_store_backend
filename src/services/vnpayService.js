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

    // 1) Load order (owner check)
    const orderParams = [order_id];
    let ownerSql = "";
    if (role !== "ADMIN") {
      ownerSql = `AND o.user_id = $2`;
      orderParams.push(user_id);
    }

    const { rows: orderRows } = await db.query(
      `
      SELECT o.id, o.user_id, o.total_amount, o.status
      FROM orders o
      WHERE o.id = $1
        AND o.deleted_at IS NULL
        ${ownerSql}
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

    // 2) Find reusable pending VNPAY payment
    const { rows: payRows } = await db.query(
      `
      SELECT id, order_id, amount, status, payment_method
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

    // If last payment is COMPLETED => refuse
    if (payment && payment.status === "COMPLETED") {
      const e = new Error("Order already paid");
      e.status = 400;
      throw e;
    }

    // If no VNPAY payment exists, or last one INACTIVE => create new attempt
    if (!payment || payment.status === "INACTIVE") {
      const paymentId = uuidv4();

      const { rows: inserted } = await db.query(
        `
        INSERT INTO payments (
          id, order_id, payment_method, amount, status,
          gateway, payment_ref
        )
        VALUES ($1, $2, 'VNPAY', $3, 'PENDING', 'VNPAY', $4)
        RETURNING id, order_id, amount, status, payment_method
        `,
        [paymentId, order_id, order.total_amount, paymentId]
      );

      payment = inserted[0];
    } else {
      // Ensure it is PENDING and amount matches current order (basic safety)
      if (String(payment.status) !== "PENDING") {
        const e = new Error("No pending VNPAY payment found for this order");
        e.status = 400;
        throw e;
      }
    }

    // 3) Build VNPAY URL
    const amountVnp = toVnpAmount(payment.amount);
    if (!amountVnp) {
      const e = new Error("Invalid payment amount");
      e.status = 400;
      throw e;
    }

    const now = new Date();
    const createDate = formatVnpayDate(now);
    const expireDate = formatVnpayDate(addMinutes(now, 15)); // 15 minutes

    const ipAddr = getClientIp(req);

    // Return URL can include your order_id for UI convenience (optional)
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

    if (bankCode) vnpParams.vnp_BankCode = bankCode;

    const paymentUrl = buildPaymentUrl(
      vnpayConfig.paymentUrl,
      vnpParams,
      vnpayConfig.hashSecret
    );

    return {
      order_id: order.id,
      payment_id: payment.id,
      paymentUrl,
      expiresAt: expireDate,
    };
  },

  /**
   * Handle IPN callback (server-to-server).
   * - Verify signature
   * - Validate payment + amount
   * - Idempotent finalize: update payments + orders
   * - Return RspCode/Message per VNPAY docs
   */
  async handleIpn(vnpQuery) {
    const payload = mapVnpayToGatewayPayload(vnpQuery);

    const paymentId = String(vnpQuery.vnp_TxnRef || "");
    if (!paymentId) {
      return { RspCode: "01", Message: "Order not found" };
    }

    // Load payment + order
    const { rows } = await db.query(
      `
      SELECT p.id, p.order_id, p.amount, p.status, p.deleted_at,
             o.status AS order_status
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

    // Amount check (integer cents)
    const vnpAmount = Number(vnpQuery.vnp_Amount || 0); // already *100
    const localAmount = Math.round(Number(pay.amount) * 100);
    if (!Number.isFinite(vnpAmount) || vnpAmount !== localAmount) {
      return { RspCode: "04", Message: "invalid amount" };
    }

    // Idempotency: if already completed, confirm success
    if (pay.status === "COMPLETED") {
      return { RspCode: "02", Message: "Order already confirmed" };
    }

    // Finalize in transaction
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const ok = isVnpaySuccess(vnpQuery);
      const newPayStatus = ok ? "COMPLETED" : "INACTIVE";

      // Update payment gateway fields
      await client.query(
        `
        UPDATE payments
        SET
          status = $2,
          payment_date = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE payment_date END,
          gateway = 'VNPAY',
          gateway_response_code = $3,
          gateway_payload = $4::jsonb,
          payment_ref = COALESCE(payment_ref, $1),
          updated_at = now()
        WHERE id = $1
          AND deleted_at IS NULL
        `,
        [
          pay.id,
          newPayStatus,
          String(vnpQuery.vnp_ResponseCode || ""),
          JSON.stringify(payload),
        ]
      );

      // If success -> mark order completed (NO STOCK DEDUCT HERE)
      if (ok) {
        await client.query(
          `
          UPDATE orders
          SET
            status = 'COMPLETED',
            paid_at = now(),
            updated_at = now()
          WHERE id = $1
            AND deleted_at IS NULL
            AND status = 'PENDING'
          `,
          [pay.order_id]
        );
      }

      await client.query("COMMIT");
      return { RspCode: "00", Message: "Confirm Success" };
    } catch (e) {
      await client.query("ROLLBACK");
      return { RspCode: "99", Message: "Unknow error" };
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
