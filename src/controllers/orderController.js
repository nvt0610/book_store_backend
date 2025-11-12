import orderService from "../services/orderService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

/**
 * Controller layer: Orders CRUD and creation flows
 */
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

  /** Get order by id (with items) */
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

  /** Get order items for a specific order */
  async listItems(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const order = await orderService.getOrderById(id, req.query.showDeleted);
      if (!order) return R.notFound(res, "Order not found");
      return R.ok(res, { items: order.items }, "Fetched order items successfully");
    } catch (err) {
      console.error("[orderController.listItems] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Create order manually (admin use) */
  async createManual(req, res) {
    try {
      const { userId, addressId, items } = req.body || {};
      if (!isUuid(userId)) return R.badRequest(res, "Invalid userId");
      if (!isUuid(addressId)) return R.badRequest(res, "Invalid addressId");
      if (!Array.isArray(items) || items.length === 0)
        return R.badRequest(res, "Items array required");

      const order = await orderService.createOrder({
        mode: "manual",
        userId,
        addressId,
        items,
      });
      return R.created(res, order, "Manual order created successfully");
    } catch (err) {
      console.error("[orderController.createManual] error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Checkout from cart */
  async createFromCart(req, res) {
    try {
      const { cartId, addressId } = req.body || {};
      if (!isUuid(cartId)) return R.badRequest(res, "Invalid cartId");
      if (!isUuid(addressId)) return R.badRequest(res, "Invalid addressId");

      const order = await orderService.createOrder({
        mode: "cart",
        cartId,
        addressId,
      });
      return R.created(res, order, "Order created from cart successfully");
    } catch (err) {
      console.error("[orderController.createFromCart] error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Buy now (instant single product order) */
  async buyNow(req, res) {
    try {
      const { userId, addressId, productId, quantity } = req.body || {};
      if (!isUuid(userId)) return R.badRequest(res, "Invalid userId");
      if (!isUuid(addressId)) return R.badRequest(res, "Invalid addressId");
      if (!isUuid(productId)) return R.badRequest(res, "Invalid productId");

      const order = await orderService.createOrder({
        mode: "instant",
        userId,
        addressId,
        productId,
        quantity,
      });
      return R.created(res, order, "Order created via Buy Now");
    } catch (err) {
      console.error("[orderController.buyNow] error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Update existing order */
  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const updated = await orderService.updateOrder(id, req.body || {});
      if (!updated) return R.notFound(res, "Order not found");
      return R.ok(res, updated, "Order updated successfully");
    } catch (err) {
      console.error("[orderController.update] error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Soft delete order */
  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await orderService.deleteOrder(id);
      if (!deleted) return R.notFound(res, "Order not found or already deleted");
      return R.ok(res, { deleted: true }, "Order soft deleted successfully");
    } catch (err) {
      console.error("[orderController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default orderController;
