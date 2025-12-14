import searchService from "../services/searchService.js";
import responseHelper from "../helpers/responseHelper.js";

const R = responseHelper;

const searchController = {
  async search(req, res) {
    try {
      const q = req.query.q?.trim() || "";

      if (!q) {
        return R.ok(res, {
          products: [],
          authors: [],
          publishers: []
        });
      }

      const data = await searchService.search(q);
      return R.ok(res, data, "Search completed");
    } catch (err) {
      console.error("[searchController.search]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default searchController;
