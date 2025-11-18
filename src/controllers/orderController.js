import orderService from "../services/orderService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";
import { getRequestContext } from "../middlewares/requestContext.js";

const R = responseHelper;

const orderController = {
  /** List all orders */
  async list(req, res) {
    try {
      const result = await orderService.listOrders(req.query);
      return R.ok(res, result, "Fetched orders successfully");
    } catch (err) {
      console.error("[orderController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Get order by id */
  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const order = await orderService.getOrderById(id, req.query.showDeleted);
      if (!order) return R.notFound(res, "Order not found");

      return R.ok(res, order, "Fetched order successfully");
    } catch (err) {
      console.error("[orderController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** List items of an order */
  async listItems(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const order = await orderService.getOrderById(id);
      if (!order) return R.notFound(res, "Order not found");

      return R.ok(res, { items: order.items }, "Fetched order items successfully");
    } catch (err) {
      console.error("[orderController.listItems] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Create manual order (Admin) */
  async createManual(req, res) {
    try {
      const { user_id, address_id, items } = req.body;
      if (!isUuid(user_id)) return R.badRequest(res, "Invalid user_id");
      if (!isUuid(address_id)) return R.badRequest(res, "Invalid address_id");

      if (!Array.isArray(items) || items.length === 0)
        return R.badRequest(res, "Items array required");

      const order = await orderService.createOrder({
        mode: "manual",
        user_id,
        address_id,
        items,
      });

      return R.created(res, order, "Manual order created successfully");
    } catch (err) {
      console.error("[orderController.createManual] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Create order from cart */
  async createFromCart(req, res) {
    try {
      const { cart_id, address_id } = req.body;

      if (!isUuid(cart_id)) return R.badRequest(res, "Invalid cart_id");
      if (!isUuid(address_id)) return R.badRequest(res, "Invalid address_id");

      const order = await orderService.createOrder({
        mode: "cart",
        cart_id,
        address_id,
      });

      return R.created(res, order, "Order created from cart");
    } catch (err) {
      console.error("[orderController.createFromCart] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Buy now order */
  async buyNow(req, res) {
    try {
      const { address_id, product_id, quantity } = req.body || {};
      const { user_id } = getRequestContext();

      if (!isUuid(user_id)) return R.badRequest(res, "Invalid user_id in token");
      if (!isUuid(address_id)) return R.badRequest(res, "Invalid address_id");
      if (!isUuid(product_id)) return R.badRequest(res, "Invalid product_id");

      const order = await orderService.createOrder({
        mode: "instant",
        address_id,
        product_id,
        quantity,
      });

      return R.created(res, order, "Order created via Buy Now");
    } catch (err) {
      console.error("[orderController.buyNow] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Customer cancel order */
  async cancel(req, res) {
    try {
      const { reason } = req.body || {};
      const { id } = req.params;

      const data = await orderService.cancelOrder(id, reason);

      return R.ok(res, data, "Order cancelled");
    } catch (err) {
      return R.internalError(res, err.message);
    }
  },

  /** Admin update order */
  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const updated = await orderService.updateOrder(id, req.body);
      if (!updated) return R.notFound(res, "Order not found");

      return R.ok(res, updated, "Order updated successfully");
    } catch (err) {
      console.error("[orderController.update] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Admin soft delete order */
  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const deleted = await orderService.deleteOrder(id);
      if (!deleted) return R.notFound(res, "Order not found");

      return R.ok(res, { deleted: true }, "Order deleted successfully");
    } catch (err) {
      console.error("[orderController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default orderController;
