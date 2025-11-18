import cartService from "../services/cartService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const cartController = {
  async list(req, res) {
    try { return R.ok(res, await cartService.list(req.query)); }
    catch (err) { return R.internalError(res, err.message); }
  },
  async getById(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const row = await cartService.getById(id, req.query.showDeleted);
    return row ? R.ok(res, row) : R.notFound(res, "Cart not found");
  },
  async getMyCart(req, res) {
    const user_id = req.user.id;
    const row = await cartService.getMyCart(user_id);
    return R.ok(res, row);
  },
  /**
   * Guest cart → create or get
   */
  async getOrCreateGuest(req, res) {
    try {
      const { guest_token } = req.body;
      if (!guest_token) return R.badRequest(res, "guest_token is required");

      const result = await cartService.getOrCreateGuestCart(guest_token);

      return R.ok(res, result.cart, result.created
        ? "Guest cart created"
        : "Guest cart fetched"
      );

    } catch (err) {
      return R.badRequest(res, err.message);
    }
  },

  /**
   * Merge guest cart → user cart
   */
  async mergeGuestToUser(req, res) {
    try {
      if (!req.user || !req.user.id)
        return R.unauthorized(res, "Login required");

      const { guest_token } = req.body;
      if (!guest_token) return R.badRequest(res, "guest_token is required");

      const cart = await cartService.mergeGuestCartToUser({
        guest_token,
        user_id: req.user.id,
      });

      return R.ok(res, cart, "Merged guest cart into user cart");
    } catch (err) {
      return R.badRequest(res, err.message);
    }
  },
  async create(req, res) {
    try {
      const { user_id } = req.body;
      if (!isUuid(user_id)) return R.badRequest(res, "Invalid user_id");
      const created = await cartService.create(req.body);
      return R.created(res, created, "Cart created");
    } catch (err) { return R.badRequest(res, err.message); }
  },
  async update(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const updated = await cartService.update(id, req.body);
    return updated ? R.ok(res, updated) : R.notFound(res, "Cart not found");
  },
  async remove(req, res) {
    const { id } = req.params;
    if (!isUuid(id)) return R.badRequest(res, "Invalid UUID");
    const ok = await cartService.remove(id);
    return ok ? R.ok(res, { deleted: true }, "Cart soft deleted") : R.notFound(res, "Cart not found");
  },
};

export default cartController;
