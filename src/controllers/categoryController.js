import categoryService from "../services/categoryService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const categoryController = {
  /**
   * GET /api/categories
   */
  async list(req, res) {
    try {
      const result = await categoryService.list(req.query);
      return R.ok(res, result, "Fetched categories successfully");
    } catch (err) {
      console.error("[categoryController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * GET /api/categories/:id
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const row = await categoryService.getById(id, req.query.showDeleted);
      if (!row) return R.notFound(res, "Category not found");
      return R.ok(res, row, "Fetched category successfully");
    } catch (err) {
      console.error("[categoryController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * POST /api/categories
   */
  async create(req, res) {
    try {
      const { name } = req.body;
      if (!name) return R.badRequest(res, "Missing required field: name");
      const created = await categoryService.create(req.body);
      return R.created(res, created, "Category created successfully");
    } catch (err) {
      console.error("[categoryController.create] error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  /**
   * PATCH /api/categories/:id
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const updated = await categoryService.update(id, req.body);
      if (!updated) return R.notFound(res, "Category not found");
      return R.ok(res, updated, "Category updated successfully");
    } catch (err) {
      console.error("[categoryController.update] error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  /**
   * DELETE /api/categories/:id
   */
  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await categoryService.remove(id);
      if (!deleted) return R.notFound(res, "Category not found or already deleted");
      return R.ok(res, { deleted: true }, "Category soft deleted successfully");
    } catch (err) {
      console.error("[categoryController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
 * POST /api/categories/:id/products
 * Attach (move) products to a category.
 */
  async addProducts(req, res) {
    try {
      const { id } = req.params;
      const { product_ids } = req.body;
      if (!isUuid(id)) return R.badRequest(res, "Invalid category UUID");
      if (!Array.isArray(product_ids) || product_ids.length === 0)
        return R.badRequest(res, "Missing or invalid product_ids array");

      const updated = await categoryService.addProducts(id, product_ids);
      return R.ok(res, { updatedCount: updated.length }, "Products attached successfully");
    } catch (err) {
      console.error("[categoryController.addProducts] error:", err);
      return R.internalError(res, err.message);
    }
  },

  /**
   * DELETE /api/categories/:id/products
   * Detach one or multiple products from a category.
   * Accepts a single product_id or an array in the request body.
   */
  async removeProducts(req, res) {
    try {
      const { id } = req.params;
      const { product_ids } = req.body;
      if (!isUuid(id)) return R.badRequest(res, "Invalid category UUID");
      if (!product_ids)
        return R.badRequest(res, "Missing product_ids field in body");

      const removedCount = await categoryService.removeProducts(id, product_ids);
      if (removedCount === 0)
        return R.notFound(res, "No products found or already detached");

      return R.ok(res, { removedCount }, "Products detached successfully");
    } catch (err) {
      console.error("[categoryController.removeProducts] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default categoryController;
