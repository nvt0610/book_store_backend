import cartService from "../services/cartService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const cartController = {
  async list(req, res) {
    try {
      const result = await cartService.list(req.query);
      return R.ok(res, result, "Fetched carts successfully");
    } catch (err) {
      console.error("[cartController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const row = await cartService.getById(req.params.id, req.query.showDeleted);
      return row
        ? R.ok(res, row, "Fetched cart successfully")
        : R.notFound(res, "Cart not found");
    } catch (err) {
      return R.badRequest(res, err.message);
    }
  },

  async getMyCart(req, res) {
    try {
      const row = await cartService.getMyCart(req.user.id);
      return R.ok(res, row, "Fetched my cart successfully");
    } catch (err) {
      console.error("[cartController.getMyCart]", err);
      return R.internalError(res, err.message);
    }
  },

  async getOrCreateGuest(req, res) {
    try {
      const token = validate.trimString(req.body.guest_token, "guest_token");
      validate.required(token, "guest_token");
      validate.maxLength(token, 200, "guest_token"); // trĂ¡nh spam payload

      const result = await cartService.getOrCreateGuestCart(token);

      return R.ok(
        res,
        result.cart,
        result.created ? "Guest cart created" : "Guest cart fetched"
      );
    } catch (err) {
      console.error("[cartController.getOrCreateGuest]", err);
      return R.badRequest(res, err.message);
    }
  },

  async mergeGuestToUser(req, res) {
    try {
      if (!req.user?.id) return R.unauthorized(res, "Login required");

      const token = validate.trimString(req.body.guest_token, "guest_token");
      validate.required(token, "guest_token");

      const cart = await cartService.mergeGuestCartToUser({
        guest_token: token,
        user_id: req.user.id,
      });

      return R.ok(res, cart, "Merged guest cart into user cart");
    } catch (err) {
      console.error("[cartController.mergeGuestToUser]", err);
      return R.badRequest(res, err.message);
    }
  },

  async create(req, res) {
    try {
      validate.uuid(req.body.user_id, "user_id");

      const created = await cartService.create(req.body);
      return R.created(res, created, "Cart created successfully");
    } catch (err) {
      console.error("[cartController.create]", err);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const updated = await cartService.update(req.params.id, req.body);

      return updated
        ? R.ok(res, updated, "Cart updated successfully")
        : R.notFound(res, "Cart not found");
    } catch (err) {
      console.error("[cartController.update]", err);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const ok = await cartService.remove(req.params.id);

      return ok
        ? R.ok(res, { deleted: true }, "Cart soft deleted")
        : R.notFound(res, "Cart not found");
    } catch (err) {
      console.error("[cartController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default cartController;
