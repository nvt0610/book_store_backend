// src/controllers/cartItemController.js

import cartItemService from "../services/cartItemService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const cartItemController = {
  /**
   * ADMIN ONLY - list all cart items
   */
  async list(req, res) {
    try {
      const result = await cartItemService.list(req.query);
      return R.ok(res, result, "Fetched cart items successfully");
    } catch (err) {
      console.error("[cartItemController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * ADMIN ONLY - get single item
   */
  async getById(req, res) {
    try {
      const { itemId } = req.params;
      if (!isUuid(itemId)) return R.badRequest(res, "Invalid itemId");

      const item = await cartItemService.getById(itemId, req.query.showDeleted);
      if (!item) return R.notFound(res, "Cart item not found");

      return R.ok(res, item, "Fetched cart item successfully");
    } catch (err) {
      console.error("[cartItemController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * PUBLIC - add item to cart
   * Guest or user must own the cart
   */
  async addItem(req, res) {
    try {
      const { cart_id, product_id, quantity } = req.body;

      const cid = cart_id;
      const pid = product_id || product_id;

      if (!isUuid(cid)) return R.badRequest(res, "Invalid cart_id");
      if (!isUuid(pid)) return R.badRequest(res, "Invalid product_id");

      const item = await cartItemService.addItem(cid, pid, quantity);
      return R.created(res, item, "Item added to cart");
    } catch (err) {
      console.error("[cartItemController.addItem] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * PUBLIC - update quantity
   */
  async updateQuantity(req, res) {
    try {
      const { itemId } = req.params;
      const { quantity } = req.body;

      if (!isUuid(itemId)) return R.badRequest(res, "Invalid itemId");
      if (quantity == null || quantity <= 0)
        return R.badRequest(res, "Quantity must be > 0");

      const updated = await cartItemService.updateQuantity(itemId, quantity);
      if (!updated) return R.notFound(res, "Cart item not found");

      return R.ok(res, updated, "Cart item updated");
    } catch (err) {
      console.error("[cartItemController.updateQuantity] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * PUBLIC - remove 1 item from cart
   */
  async removeItem(req, res) {
    try {
      const { itemId } = req.params;
      if (!isUuid(itemId)) return R.badRequest(res, "Invalid itemId");

      const ok = await cartItemService.remove(itemId);
      if (!ok) return R.notFound(res, "Cart item not found");

      return R.ok(res, { deleted: true }, "Cart item removed");
    } catch (err) {
      console.error("[cartItemController.removeItem] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * PUBLIC - clear whole cart
   */
  async clear(req, res) {
    try {
      const cart_id = req.body.cart_id || req.query.cart_id;

      if (!isUuid(cart_id))
        return R.badRequest(res, "Invalid cart_id");

      const ok = await cartItemService.clear(cart_id);
      return R.ok(res, { cleared: true }, "Cart cleared");

    } catch (err) {
      console.error("[cartItemController.clear] error:", err);
      return R.internalError(res, err.message);
    }
  }
};

export default cartItemController;
