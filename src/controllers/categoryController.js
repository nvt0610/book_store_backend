import categoryService from "../services/categoryService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const categoriesController = {
  async list(req, res) {
    try {
      const result = await categoryService.list(req.query);
      return R.ok(res, result, "Fetched categories successfully");
    } catch (err) {
      console.error("[categoriesController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const row = await categoryService.getById(id, req.query.showDeleted);
      if (!row) return R.notFound(res, "Category not found");
      return R.ok(res, row, "Fetched category successfully");
    } catch (err) {
      console.error("[categoriesController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { name } = req.body;
      if (!name) return R.badRequest(res, "Missing required field: name");
      const created = await categoryService.create(req.body);
      return R.created(res, created, "Category created successfully");
    } catch (err) {
      console.error("[categoriesController.create] error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const updated = await categoryService.update(id, req.body);
      if (!updated) return R.notFound(res, "Category not found");
      return R.ok(res, updated, "Category updated successfully");
    } catch (err) {
      console.error("[categoriesController.update] error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await categoryService.remove(id);
      if (!deleted) return R.notFound(res, "Category not found or already deleted");
      return R.ok(res, { deleted: true }, "Category soft deleted successfully");
    } catch (err) {
      console.error("[categoriesController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default categoriesController;
