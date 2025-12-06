import cartItemService from "../services/cartItemService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const cartItemController = {
  async list(req, res) {
    try {
      const result = await cartItemService.list(req.query);
      return R.ok(res, result, "Fetched cart items successfully");
    } catch (err) {
      console.error("[cartItemController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      validate.uuid(req.params.itemId, "itemId");

      const item = await cartItemService.getById(
        req.params.itemId,
        req.query.showDeleted
      );

      return item
        ? R.ok(res, item, "Fetched cart item successfully")
        : R.notFound(res, "Cart item not found");
    } catch (err) {
      console.error("[cartItemController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  async addItem(req, res) {
    try {
      const { cart_id, product_id, quantity } = req.body;

      validate.uuid(cart_id, "cart_id");
      validate.uuid(product_id, "product_id");
      validate.positive(quantity, "quantity");

      const item = await cartItemService.addItem(cart_id, product_id, quantity);
      return R.created(res, item, "Item added to cart");
    } catch (err) {
      console.error("[cartItemController.addItem]", err);
      return R.badRequest(res, err.message);
    }
  },

  async updateQuantity(req, res) {
    try {
      validate.uuid(req.params.itemId, "itemId");
      validate.positive(req.body.quantity, "quantity");

      const updated = await cartItemService.updateQuantity(
        req.params.itemId,
        req.body.quantity
      );

      return updated
        ? R.ok(res, updated, "Cart item updated")
        : R.notFound(res, "Cart item not found");
    } catch (err) {
      console.error("[cartItemController.updateQuantity]", err);
      return R.badRequest(res, err.message);
    }
  },

  async removeItem(req, res) {
    try {
      validate.uuid(req.params.itemId, "itemId");

      const ok = await cartItemService.remove(req.params.itemId);

      return ok
        ? R.ok(res, { deleted: true }, "Cart item removed")
        : R.notFound(res, "Cart item not found");
    } catch (err) {
      console.error("[cartItemController.removeItem]", err);
      return R.internalError(res, err.message);
    }
  },

  async clear(req, res) {
    try {
      const cart_id = req.body.cart_id || req.query.cart_id;

      validate.uuid(cart_id, "cart_id");

      await cartItemService.clear(cart_id);

      return R.ok(res, { cleared: true }, "Cart cleared");
    } catch (err) {
      console.error("[cartItemController.clear]", err);
      return R.badRequest(res, err.message);
    }
  }
};

export default cartItemController;
