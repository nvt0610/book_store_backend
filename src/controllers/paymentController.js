import paymentService from "../services/paymentService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

/**
 * Controller layer: Payments CRUD and lifecycle management
 */
const paymentController = {
  /** List all payments */
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
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const payment = await paymentService.getPaymentById(id, req.query.showDeleted);
      if (!payment) return R.notFound(res, "Payment not found");
      return R.ok(res, payment, "Fetched payment successfully");
    } catch (err) {
      console.error("[paymentController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Create a new payment (normally used for admin testing or manual payment entry) */
  async create(req, res) {
    try {
      const { orderId, paymentMethod, amount } = req.body || {};
      if (!isUuid(orderId)) return R.badRequest(res, "Invalid orderId");
      if (typeof amount !== "number" || amount <= 0)
        return R.badRequest(res, "Invalid amount");

      const payment = await paymentService.createPayment({
        orderId,
        paymentMethod,
        amount,
      });
      return R.created(res, payment, "Payment created successfully");
    } catch (err) {
      console.error("[paymentController.create] error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Update payment status or info */
  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const updated = await paymentService.updatePayment(id, req.body || {});
      if (!updated) return R.notFound(res, "Payment not found");
      return R.ok(res, updated, "Payment updated successfully");
    } catch (err) {
      console.error("[paymentController.update] error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Soft delete payment */
  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const deleted = await paymentService.deletePayment(id);
      if (!deleted) return R.notFound(res, "Payment not found or already deleted");
      return R.ok(res, { deleted: true }, "Payment soft deleted successfully");
    } catch (err) {
      console.error("[paymentController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default paymentController;
