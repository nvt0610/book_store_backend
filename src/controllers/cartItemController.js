import cartItemsService from "../services/cartItemsService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const cartItemsController = {
  async list(req, res) {
    try { return R.ok(res, await cartItemsService.list(req.query)); }
    catch (err) { return R.internalError(res, err.message); }
  },
  async getById(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const row = await cartItemsService.getById(id, req.query.showDeleted);
    return row ? R.ok(res, row) : R.notFound(res, "CartItem not found");
  },
  async create(req, res) {
    try {
      const { cart_id, product_id, quantity } = req.body;
      if (!isUuid(cart_id) || !isUuid(product_id))
        return R.badRequest(res, "Invalid cart_id or product_id");
      if (quantity != null && quantity <= 0)
        return R.badRequest(res, "quantity must be > 0");
      const created = await cartItemsService.create(req.body);
      return R.created(res, created, "CartItem created");
    } catch (err) { return R.badRequest(res, err.message); }
  },
  async update(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    if (req.body.quantity != null && req.body.quantity <= 0)
      return R.badRequest(res, "quantity must be > 0");
    const updated = await cartItemsService.update(id, req.body);
    return updated ? R.ok(res, updated) : R.notFound(res, "CartItem not found");
  },
  async remove(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const ok = await cartItemsService.remove(id);
    return ok ? R.ok(res, { deleted: true }, "CartItem soft deleted") : R.notFound(res, "CartItem not found");
  },
};

export default cartItemsController;
