// src/controllers/paymentController.js

import { validate as isUuid } from "uuid";
import paymentService from "../services/paymentService.js";
import responseHelper from "../helpers/responseHelper.js";
import { getRequestContext } from "../middlewares/requestContext.js";

const R = responseHelper;

const paymentController = {
  /** List all payments (customer: own only, admin: all) */
  async list(req, res) {
    try {
      const result = await paymentService.listPayments(req.query);
      return R.ok(res, result, "Fetched payments successfully");
    } catch (err) {
      console.error("[paymentController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Get payment by id */
  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");

      const payment = await paymentService.getById(id);
      if (!payment) return R.notFound(res, "Payment not found");

      return R.ok(res, payment, "Fetched payment successfully");
    } catch (err) {
      console.error("[paymentController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** List payments by order */
  async listByOrder(req, res) {
    try {
      const { order_id } = req.params;
      if (!isUuid(order_id)) return R.badRequest(res, "Invalid order_id");

      const payments = await paymentService.listByOrder(order_id);
      return R.ok(res, payments, "Fetched payments for order");
    } catch (err) {
      console.error("[paymentController.listByOrder] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Admin create payment */
  async create(req, res) {
    try {
      const result = await paymentService.createPayment(req.body);
      return R.created(res, result, "Payment created");
    } catch (err) {
      console.error("[paymentController.create] error:", err);
      if (err.status === 400) return R.badRequest(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Admin update payment */
  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");

      const updated = await paymentService.updatePayment(id, req.body);
      if (!updated) return R.notFound(res, "Payment not found");

      return R.ok(res, updated, "Payment updated");
    } catch (err) {
      console.error("[paymentController.update] error:", err);
      if (err.status === 400) return R.badRequest(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Admin soft delete */
  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");

      const ok = await paymentService.deletePayment(id);
      if (!ok) return R.notFound(res, "Payment not found");

      return R.ok(res, { deleted: true }, "Payment deleted");
    } catch (err) {
      console.error("[paymentController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Admin complete payment of order */
  async markCompletedByOrder(req, res) {
    try {
      const { order_id } = req.params;
      if (!isUuid(order_id)) return R.badRequest(res, "Invalid order_id");

      const data = await paymentService.markPaymentCompletedByOrder(order_id);
      return R.ok(res, data, "Payment marked as completed");
    } catch (err) {
      console.error("[paymentController.markCompletedByOrder] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Admin cancel pending payments of order */
  async cancelPendingByOrder(req, res) {
    try {
      const { order_id } = req.params;
      if (!isUuid(order_id)) return R.badRequest(res, "Invalid order_id");

      const data = await paymentService.cancelPendingByOrder(order_id);
      return R.ok(res, data, "Pending payments cancelled");
    } catch (err) {
      console.error("[paymentController.cancelPendingByOrder] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default paymentController;
