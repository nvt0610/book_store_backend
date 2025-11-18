import addressService from "../services/addressService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const addressController = {
  async list(req, res) {
    try {
      const result = await addressService.list(req.query);
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
      const row = await addressService.getById(id, req.query.showDeleted);
      if (!row) return R.notFound(res, "Address not found");
      return R.ok(res, row, "Fetched address successfully");
    } catch (err) {
      console.error("[addressesController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { full_name, phone, address_line } = req.body;

      if (!full_name || !phone || !address_line) {
        return R.badRequest(res, "Missing required fields: full_name, phone, address_line");
      }

      // Force user_id = req.user.id
      const data = {
        ...req.body,
        user_id: req.user.id,
      };

      const created = await addressService.create(data);
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
      const updated = await addressService.update(id, req.body);
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
      const deleted = await addressService.remove(id);
      if (!deleted) return R.notFound(res, "Address not found or already deleted");
      return R.ok(res, { deleted: true }, "Address soft deleted successfully");
    } catch (err) {
      console.error("[addressesController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default addressController;
