import productService from "../services/productService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const productController = {
  async list(req, res) {
    try {
      const result = await productService.list(req.query);
      return R.ok(res, result, "Fetched products successfully");
    } catch (err) {
      console.error("[productController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const row = await productService.getById(id, req.query.showDeleted);
      return row
        ? R.ok(res, row, "Fetched product successfully")
        : R.notFound(res, "Product not found");
    } catch (err) {
      console.error("[productController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const body = req.body;

      // Required fields
      validate.required(body.name, "name");
      validate.required(body.price, "price");
      validate.required(body.publisher_id, "publisher_id");
      validate.required(body.author_id, "author_id");

      // Normalize & validate strings
      body.name = validate.trimString(body.name, "name");
      validate.maxLength(body.name, 255, "name");

      // Price
      validate.numeric(body.price, "price");
      validate.nonNegative(body.price, "price");

      // Stock (optional)
      if (body.stock != null) {
        validate.integer(body.stock, "stock");
        validate.nonNegative(body.stock, "stock");
      }

      // Foreign keys
      validate.uuid(body.publisher_id, "publisher_id");
      validate.uuid(body.author_id, "author_id");

      if (body.category_id) {
        validate.uuid(body.category_id, "category_id");
      }

      // Optional URL validations
      if (body.main_image) {
        validate.url(body.main_image, "main_image");
      }

      if (body.extra_images) {
        validate.array(body.extra_images, "extra_images");
        for (const img of body.extra_images) {
          validate.url(img, "extra_images[]");
        }
      }

      const created = await productService.create(body);
      return R.created(res, created, "Product created successfully");
    } catch (err) {
      console.error("[productController.create]", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const body = req.body;

      // Optional but validate if provided
      if (body.name != null) {
        body.name = validate.trimString(body.name, "name");
        validate.maxLength(body.name, 255, "name");
      }

      if (body.price != null) {
        validate.numeric(body.price, "price");
        validate.nonNegative(body.price, "price");
      }

      if (body.stock != null) {
        validate.integer(body.stock, "stock");
        validate.nonNegative(body.stock, "stock");
      }

      if (body.category_id != null) validate.uuid(body.category_id, "category_id");
      if (body.publisher_id != null) validate.uuid(body.publisher_id, "publisher_id");
      if (body.author_id != null) validate.uuid(body.author_id, "author_id");

      if (body.main_image) validate.url(body.main_image, "main_image");

      if (body.extra_images) {
        validate.array(body.extra_images, "extra_images");
        for (const img of body.extra_images) validate.url(img, "extra_images[]");
      }

      const updated = await productService.update(id, body);
      return updated
        ? R.ok(res, updated, "Product updated successfully")
        : R.notFound(res, "Product not found");
    } catch (err) {
      console.error("[productController.update]", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      validate.uuid(id, "id");

      const deleted = await productService.remove(id);

      return deleted
        ? R.ok(res, { deleted: true }, "Product soft deleted (status=INACTIVE)")
        : R.notFound(res, "Product not found");
    } catch (err) {
      console.error("[productController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default productController;
