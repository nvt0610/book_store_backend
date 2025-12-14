import categoryService from "../services/categoryService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const categoryController = {
  /** GET /api/categories */
  async list(req, res) {
    try {
      const result = await categoryService.list(req.query);
      return R.ok(res, result, "Fetched categories successfully");
    } catch (err) {
      console.error("[categoryController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  /** GET /api/categories/:id */
  async getById(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const row = await categoryService.getById(req.params.id, req.query.showDeleted);
      return row
        ? R.ok(res, row, "Fetched category successfully")
        : R.notFound(res, "Category not found");

    } catch (err) {
      console.error("[categoryController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** POST /api/categories */
  async create(req, res) {
    try {
      const { name } = req.body;

      validate.required(name, "name");
      validate.maxLength(name, 150, "name");

      if (req.body.description) {
        req.body.description = validate.trimString(req.body.description, "description");
        validate.maxLength(req.body.description, 2000, "description");
      }

      const created = await categoryService.create(req.body);
      return R.created(res, created, "Category created successfully");
    } catch (err) {
      console.error("[categoryController.create]", err);
      return err.status === 409
        ? R.conflict(res, err.message)
        : R.badRequest(res, err.message);
    }
  },

  /** PATCH /api/categories/:id */
  async update(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      if (req.body.description) {
        req.body.description = validate.trimString(req.body.description, "description");
        validate.maxLength(req.body.description, 2000, "description");
      }

      if (req.body.name) {
        validate.maxLength(req.body.name, 150, "name");
        req.body.name = validate.trimString(req.body.name, "name");
      }


      const updated = await categoryService.update(req.params.id, req.body);
      return updated
        ? R.ok(res, updated, "Category updated successfully")
        : R.notFound(res, "Category not found");
    } catch (err) {
      console.error("[categoryController.update]", err);
      return err.status === 409
        ? R.conflict(res, err.message)
        : R.badRequest(res, err.message);
    }
  },

  /** DELETE /api/categories/:id */
  async remove(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const result = await categoryService.remove(req.params.id);

      if (!result.deleted) {
        return R.notFound(res, "Category not found or already deleted");
      }

      console.log(
        `[Category Delete] category_id=${req.params.id}, detached_products=${result.detachedCount}`
      );

      return R.ok(
        res,
        {
          deleted: true,
          detachedCount: result.detachedCount,
        },
        result.detachedCount > 0
          ? `Category deleted. ${result.detachedCount} products moved to no-category`
          : "Category deleted successfully"
      );

    } catch (err) {
      console.error("[categoryController.remove]", err);
      return R.internalError(res, err.message);
    }
  },

  /** POST /api/categories/:id/products */
  async addProducts(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const { product_ids } = req.body;
      validate.required(product_ids, "product_ids");
      validate.uuidArray(product_ids, "product_ids");

      const updated = await categoryService.addProducts(req.params.id, product_ids);
      return R.ok(res, { updatedCount: updated.length }, "Products attached successfully");

    } catch (err) {
      console.error("[categoryController.addProducts]", err);
      return R.badRequest(res, err.message);
    }
  },

  /** DELETE /api/categories/:id/products */
  async removeProducts(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      let { product_ids } = req.body;
      validate.required(product_ids, "product_ids");

      // Cho phĂ©p gá»­i 1 id thay vĂ¬ array
      if (!Array.isArray(product_ids)) {
        product_ids = [product_ids];
      }
      validate.uuidArray(product_ids, "product_ids");

      const removedCount = await categoryService.removeProducts(req.params.id, product_ids);

      return removedCount > 0
        ? R.ok(res, { removedCount }, "Products detached successfully")
        : R.notFound(res, "No products found or already detached");

    } catch (err) {
      console.error("[categoryController.removeProducts]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default categoryController;
