import orderItemService from "../services/orderItemService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const orderItemController = {
  async list(req, res) {
    try { return R.ok(res, await orderItemService.list(req.query)); }
    catch (err) { return R.internalError(res, err.message); }
  },
  async getById(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const row = await orderItemService.getById(id, req.query.showDeleted);
    return row ? R.ok(res, row) : R.notFound(res, "OrderItem not found");
  },
  async create(req, res) {
    try {
      const { order_id, product_id, quantity, price } = req.body;
      if (!isUuid(order_id) || !isUuid(product_id))
        return R.badRequest(res, "Invalid UUID for order_id/product_id");
      if (quantity <= 0 || price < 0)
        return R.badRequest(res, "quantity >0 and price >=0 required");
      const created = await orderItemService.create(req.body);
      return R.created(res, created, "OrderItem created");
    } catch (err) { return R.badRequest(res, err.message); }
  },
  async update(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const updated = await orderItemService.update(id, req.body);
    return updated ? R.ok(res, updated) : R.notFound(res, "OrderItem not found");
  },
  async remove(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const ok = await orderItemService.remove(id);
    return ok ? R.ok(res, { deleted: true }, "OrderItem soft deleted") : R.notFound(res, "OrderItem not found");
  },
};

export default orderItemController;
