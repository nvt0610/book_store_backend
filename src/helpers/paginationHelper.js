/**
 * @module helpers/paginationHelper
 * Helpers for limit/offset pagination and metadata generation.
 * 
 * Provides safe defaults and input normalization for consistent pagination behavior.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Parse pagination parameters safely.
 * Accepts flexible input (page/pageSize/limit/offset) and ensures sane boundaries.
 *
 * @param {Object} [input={}]
 * @param {number|string} [input.page] - Current page number (1-based)
 * @param {number|string} [input.pageSize] - Number of items per page
 * @param {number|string} [input.limit] - Optional alias for pageSize
 * @param {number|string} [input.offset] - Optional manual offset override
 * @param {number} [input.maxPageSize] - Optional maximum page size override
 * @returns {{ page: number, pageSize: number, limit: number, offset: number }}
 */
export function parsePagination(input = {}) {
  // Parse and validate page number
  const parsedPage = parseInt(input.page ?? DEFAULT_PAGE, 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;

  // Parse and sanitize pageSize
  const rawPageSize = parseInt(input.pageSize ?? input.limit ?? DEFAULT_PAGE_SIZE, 10);
  let pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : DEFAULT_PAGE_SIZE;

  // Enforce pageSize upper limit
  const maxSize = Number.isFinite(input.maxPageSize) ? input.maxPageSize : MAX_PAGE_SIZE;
  pageSize = Math.min(pageSize, maxSize);

  // Derive offset
  const derivedOffset = (page - 1) * pageSize;
  const offset = Math.max(
    parseInt(input.offset ?? derivedOffset, 10) || 0,
    0
  );
  const limit = pageSize;

  return { page, pageSize, limit, offset };
}

/**
 * Build pagination metadata for API responses.
 *
 * @param {Object} params
 * @param {number} params.total - Total number of matching records
 * @param {number} params.page - Current page number
 * @param {number} params.pageSize - Number of items per page
 * @returns {{
 *   total: number,
 *   page: number,
 *   pageSize: number,
 *   totalPages: number,
 *   hasNext: boolean,
 *   hasPrev: boolean,
 *   offset: number,
 *   limit: number
 * }}
 */
export function buildPageMeta({ total, page, pageSize }) {
  const safeTotal = Math.max(Number(total) || 0, 0);
  const safePageSize = Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1);
  const totalPages = Math.max(Math.ceil(safeTotal / safePageSize), 1);

  const hasNext = page < totalPages;
  const hasPrev = page > 1;
  const offset = (page - 1) * safePageSize;
  const limit = safePageSize;

  return {
    total: safeTotal,
    page,
    pageSize: safePageSize,
    totalPages,
    hasNext,
    hasPrev,
    offset,
    limit,
  };
}

export default { parsePagination, buildPageMeta };
