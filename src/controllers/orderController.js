import orderService from "../services/ordersService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const orderController = {
  async list(req, res) {
    try {
      const result = await orderService.listOrders(req.query);
      return R.ok(res, result, "Fetched orders successfully");
    } catch (err) {
      console.error("listOrders error:", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const order = await orderService.getOrderWithItems(id, req.query.showDeleted);
      if (!order) return R.notFound(res, "Order not found");
      return R.ok(res, order, "Fetched order successfully");
    } catch (err) {
      console.error("getOrderById error:", err);
      return R.internalError(res, err.message);
    }
  },

  async listItems(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const items = await orderService.listOrderItems(id, req.query.showDeleted);
      return R.ok(res, { items }, "Fetched order items successfully");
    } catch (err) {
      console.error("listOrderItems error:", err);
      return R.internalError(res, err.message);
    }
  },

  /** Admin compose order */
  async createAdmin(req, res) {
    try {
      const { userId, addressId, items, placedAt, paid } = req.body || {};
      if (!isUuid(userId)) return R.badRequest(res, "Invalid userId");
      if (!isUuid(addressId)) return R.badRequest(res, "Invalid addressId");
      const order = await orderService.createOrderAdmin({ userId, addressId, items, placedAt, paid });
      return R.created(res, order, "Order created successfully");
    } catch (err) {
      console.error("createOrderAdmin error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Checkout from cart */
  async createFromCart(req, res) {
    try {
      const { cartId, addressId, markCartCheckedOut } = req.body || {};
      if (!isUuid(cartId)) return R.badRequest(res, "Invalid cartId");
      if (!isUuid(addressId)) return R.badRequest(res, "Invalid addressId");
      const order = await orderService.createOrderFromCart({ cartId, addressId, markCartCheckedOut });
      return R.created(res, order, "Order created from cart");
    } catch (err) {
      console.error("createOrderFromCart error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  /** Buy Now flow */
  async buyNow(req, res) {
    try {
      const { userId, addressId, productId, quantity } = req.body || {};
      if (!isUuid(userId)) return R.badRequest(res, "Invalid userId");
      if (!isUuid(addressId)) return R.badRequest(res, "Invalid addressId");
      if (!isUuid(productId)) return R.badRequest(res, "Invalid productId");
      const order = await orderService.createOrderBuyNow({ userId, addressId, productId, quantity });
      return R.created(res, order, "Order created (Buy Now)");
    } catch (err) {
      console.error("buyNow error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const order = await orderService.updateOrder(id, req.body || {});
      if (!order) return R.notFound(res, "Order not found");
      return R.ok(res, order, "Order updated successfully");
    } catch (err) {
      console.error("updateOrder error:", err);
      if (err.status) return R.error(res, err.status, err.message);
      return R.internalError(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await orderService.deleteOrder(id);
      if (!deleted) return R.notFound(res, "Order not found or already deleted");
      return R.ok(res, { deleted: true }, "Order soft deleted successfully");
    } catch (err) {
      console.error("deleteOrder error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default orderController;
