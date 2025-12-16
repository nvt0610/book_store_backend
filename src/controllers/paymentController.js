import paymentService from "../services/paymentService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const PAYMENT_METHODS = ["COD", "CREDIT_CARD", "VNPAY", "MOMO"];
const PAYMENT_STATUS = ["PENDING", "COMPLETED", "INACTIVE"];

const paymentController = {
  async list(req, res) {
    try {
      const result = await paymentService.listPayments(req.query);
      return R.ok(res, result, "Fetched payments successfully");
    } catch (err) {
      console.error("[paymentController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const payment = await paymentService.getById(id);
      return payment
        ? R.ok(res, payment, "Fetched payment successfully")
        : R.notFound(res, "Payment not found");
    } catch (err) {
      console.error("[paymentController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  async listByOrder(req, res) {
    try {
      const { order_id } = req.params;
      validate.uuid(order_id, "order_id");

      const payments = await paymentService.listByOrder(order_id);
      return R.ok(res, payments, "Fetched payments for order");
    } catch (err) {
      console.error("[paymentController.listByOrder]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** Admin create payment */
  async create(req, res) {
    try {
      const { order_id, payment_method, amount, payment_ref } = req.body;

      validate.uuid(order_id, "order_id");
      validate.enum(payment_method, PAYMENT_METHODS, "payment_method");
      validate.positive(amount, "amount");

      if (payment_ref) validate.trimString(payment_ref, "payment_ref");

      const result = await paymentService.createPayment(req.body);
      return R.created(res, result, "Payment created");
    } catch (err) {
      console.error("[paymentController.create]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** Admin update payment */
  async update(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const body = req.body;

      if (body.payment_method)
        validate.enum(body.payment_method, PAYMENT_METHODS, "payment_method");

      if (body.amount != null) validate.positive(body.amount, "amount");

      if (body.status) validate.enum(body.status, PAYMENT_STATUS, "status");

      if (body.payment_ref)
        validate.trimString(body.payment_ref, "payment_ref");

      const updated = await paymentService.updatePayment(id, body);

      return updated
        ? R.ok(res, updated, "Payment updated")
        : R.notFound(res, "Payment not found");
    } catch (err) {
      console.error("[paymentController.update]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** Admin soft delete */
  async remove(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const ok = await paymentService.deletePayment(id);

      return ok
        ? R.ok(res, { deleted: true }, "Payment deleted")
        : R.notFound(res, "Payment not found");
    } catch (err) {
      console.error("[paymentController.remove]", err);
      return R.internalError(res, err.message);
    }
  },

  /** Admin complete payment for an order */
  async markCompleted(req, res) {
    try {
      const { payment_id } = req.params;
      validate.uuid(payment_id, "payment_id");

      const data = await paymentService.completePayment(payment_id, {
        via: "COD",
      });

      return R.ok(res, data, "Payment marked as completed");
    } catch (err) {
      console.error("[paymentController.markCompleted]", err);
      return R.internalError(res, err.message);
    }
  },

  /** Customer retry payment for an order */
  async retryPayment(req, res) {
    try {
      const { order_id } = req.params;
      const { payment_method } = req.body;

      validate.uuid(order_id, "order_id");
      validate.enum(payment_method, PAYMENT_METHODS, "payment_method");

      const result = await paymentService.retryPaymentForOrder(
        order_id,
        payment_method
      );

      return R.ok(res, result, "Payment retried successfully");
    } catch (err) {
      console.error("[paymentController.retryPayment]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** Admin cancel pending payments */
  async cancelPending(req, res) {
    try {
      const { payment_id } = req.params;
      validate.uuid(payment_id, "payment_id");

      const data = await paymentService.cancelPayment(payment_id);
      return R.ok(res, data, "Payment cancelled");
    } catch (err) {
      console.error("[paymentController.cancelPending]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default paymentController;
