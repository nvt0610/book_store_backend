import productService from "../services/productService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const productsController = {
  async list(req, res) {
    try {
      const result = await productService.list(req.query);
      return R.ok(res, result, "Fetched products successfully");
    } catch (err) {
      console.error("[productsController.list] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const row = await productService.getById(id, req.query.showDeleted);
      if (!row) return R.notFound(res, "Product not found");
      return R.ok(res, row, "Fetched product successfully");
    } catch (err) {
      console.error("[productsController.getById] error:", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { name, price, category_id, publisher_id, author_id, stock } = req.body;

      if (!name) return R.badRequest(res, "Missing required field: name");
      if (price == null) return R.badRequest(res, "Missing required field: price");
      if (!isFinite(Number(price))) return R.badRequest(res, "Invalid price");
      if (Number(price) < 0) return R.badRequest(res, "price must be >= 0");

      if (stock != null && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) {
        return R.badRequest(res, "stock must be an integer >= 0");
      }

      for (const fk of ["category_id", "publisher_id", "author_id"]) {
        if (!req.body[fk]) return R.badRequest(res, `Missing required field: ${fk}`);
        if (!isUuid(req.body[fk])) return R.badRequest(res, `Invalid UUID format for ${fk}`);
      }

      const created = await productService.create(req.body);
      return R.created(res, created, "Product created successfully");
    } catch (err) {
      console.error("[productsController.create] error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");

      const { price, stock, category_id, publisher_id, author_id } = req.body;

      if (price != null) {
        if (!isFinite(Number(price))) return R.badRequest(res, "Invalid price");
        if (Number(price) < 0) return R.badRequest(res, "price must be >= 0");
      }
      if (stock != null) {
        if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
          return R.badRequest(res, "stock must be an integer >= 0");
        }
      }
      for (const [fkName, fkVal] of Object.entries({ category_id, publisher_id, author_id })) {
        if (fkVal != null && !isUuid(fkVal)) return R.badRequest(res, `Invalid UUID format for ${fkName}`);
      }

      const updated = await productService.update(id, req.body);
      if (!updated) return R.notFound(res, "Product not found");
      return R.ok(res, updated, "Product updated successfully");
    } catch (err) {
      console.error("[productsController.update] error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await productService.remove(id);
      if (!deleted) return R.notFound(res, "Product not found or already deleted");
      return R.ok(res, { deleted: true }, "Product soft deleted (status=INACTIVE)");
    } catch (err) {
      console.error("[productsController.remove] error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default productsController;
