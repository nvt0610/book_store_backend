import addressesService from "../services/addressesService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const addressesController = {
  async list(req, res) {
    try {
      const result = await addressesService.list(req.query);
      return R.ok(res, result, "Fetched addresses successfully");
    } catch (err) {
      console.error("[addressesController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const row = await addressesService.getById(id, req.query.showDeleted);
      if (!row) return R.notFound(res, "Address not found");
      return R.ok(res, row, "Fetched address successfully");
    } catch (err) {
      console.error("[addressesController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { user_id, full_name, phone, address_line } = req.body;
      if (!isUuid(user_id)) return R.badRequest(res, "Invalid UUID for user_id");
      if (!full_name || !phone || !address_line)
        return R.badRequest(res, "Missing required fields: full_name, phone, address_line");

      const created = await addressesService.create(req.body);
      return R.created(res, created, "Address created successfully");
    } catch (err) {
      console.error("[addressesController.create] error:", err);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const updated = await addressesService.update(id, req.body);
      if (!updated) return R.notFound(res, "Address not found");
      return R.ok(res, updated, "Address updated successfully");
    } catch (err) {
      console.error("[addressesController.update] error:", err);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await addressesService.remove(id);
      if (!deleted) return R.notFound(res, "Address not found or already deleted");
      return R.ok(res, { deleted: true }, "Address soft deleted successfully");
    } catch (err) {
      console.error("[addressesController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default addressesController;
