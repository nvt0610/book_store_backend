import orderItemService from "../services/orderItemService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const orderItemController = {
  async list(req, res) {
    try {
      const rows = await orderItemService.list(req.query);
      return R.ok(res, rows, "Fetched order items successfully");
    } catch (err) {
      console.error("[orderItemController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const row = await orderItemService.getById(id, req.query.showDeleted);
      return row
        ? R.ok(res, row, "Fetched order item successfully")
        : R.notFound(res, "Order item not found");

    } catch (err) {
      console.error("[orderItemController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { order_id, product_id, quantity, price } = req.body;

      // Validate UUIDs
      validate.uuid(order_id, "order_id");
      validate.uuid(product_id, "product_id");

      // Validate numbers
      validate.positive(quantity, "quantity");     // quantity > 0
      validate.nonNegative(price, "price");       // price >= 0

      const created = await orderItemService.create(req.body);
      return R.created(res, created, "Order item created successfully");

    } catch (err) {
      console.error("[orderItemController.create]", err);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const updated = await orderItemService.update(id, req.body);
      return updated
        ? R.ok(res, updated, "Order item updated successfully")
        : R.notFound(res, "Order item not found");

    } catch (err) {
      console.error("[orderItemController.update]", err);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const ok = await orderItemService.remove(id);
      return ok
        ? R.ok(res, { deleted: true }, "Order item soft deleted")
        : R.notFound(res, "Order item not found");

    } catch (err) {
      console.error("[orderItemController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default orderItemController;
