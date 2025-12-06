import orderService from "../services/orderService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";
import { getRequestContext } from "../middlewares/requestContext.js";

const R = responseHelper;

const orderController = {
  async list(req, res) {
    try {
      const result = await orderService.listOrders(req.query);
      return R.ok(res, result, "Fetched orders successfully");
    } catch (err) {
      console.error("[orderController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const order = await orderService.getOrderById(id, req.query.showDeleted);
      return order
        ? R.ok(res, order, "Fetched order successfully")
        : R.notFound(res, "Order not found");

    } catch (err) {
      console.error("[orderController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  async listItems(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const order = await orderService.getOrderById(id);
      if (!order) return R.notFound(res, "Order not found");

      return R.ok(res, { items: order.items }, "Fetched order items successfully");
    } catch (err) {
      console.error("[orderController.listItems]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** ADMIN: manual order */
  async createManual(req, res) {
    try {
      const { user_id, address_id, items } = req.body;

      validate.uuidFields(req.body, ["user_id", "address_id"]);
      validate.arrayNotEmpty(items, "items");

      // Validate từng item trong array
      for (const item of items) {
        validate.uuid(item.product_id, "product_id");
        validate.positive(item.quantity, "quantity");
      }

      const order = await orderService.createOrder({
        mode: "manual",
        user_id,
        address_id,
        items,
      });

      return R.created(res, order, "Manual order created successfully");

    } catch (err) {
      console.error("[orderController.createManual]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** create from cart */
  async createFromCart(req, res) {
    try {
      const { cart_id, address_id } = req.body;

      validate.uuidFields(req.body, ["cart_id", "address_id"]);

      const order = await orderService.createOrder({
        mode: "cart",
        cart_id,
        address_id,
      });

      return R.created(res, order, "Order created from cart");
    } catch (err) {
      console.error("[orderController.createFromCart]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** Buy now */
  async buyNow(req, res) {
    try {
      const { address_id, product_id, quantity } = req.body || {};
      const { user_id } = getRequestContext();

      validate.uuid(user_id, "user_id");
      validate.uuid(address_id, "address_id");
      validate.uuid(product_id, "product_id");
      validate.positive(quantity, "quantity");

      const order = await orderService.createOrder({
        mode: "instant",
        address_id,
        product_id,
        quantity,
      });

      return R.created(res, order, "Order created via Buy Now");

    } catch (err) {
      console.error("[orderController.buyNow]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** cancel order (customer) */
  async cancel(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};

      validate.uuid(id, "id");
      if (reason) validate.trimString(reason, "reason");

      const data = await orderService.cancelOrder(id, reason);
      return R.ok(res, data, "Order cancelled");

    } catch (err) {
      console.error("[orderController.cancel]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** admin update */
  async update(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const updated = await orderService.updateOrder(id, req.body);

      return updated
        ? R.ok(res, updated, "Order updated successfully")
        : R.notFound(res, "Order not found");

    } catch (err) {
      console.error("[orderController.update]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** soft delete */
  async remove(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const deleted = await orderService.deleteOrder(id);

      return deleted
        ? R.ok(res, { deleted: true }, "Order deleted successfully")
        : R.notFound(res, "Order not found");

    } catch (err) {
      console.error("[orderController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default orderController;
