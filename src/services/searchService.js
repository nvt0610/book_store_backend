import db from "../db/db.js";

const searchService = {
  async search(q) {
    const keyword = `%${q.toLowerCase()}%`;

    // ================================
    // 1. PRODUCTS 
    // ================================
    const productsSql = `
      SELECT
        p.id,
        p.name,
        p.price,
        p.main_image,
        a.name AS author_name
      FROM products p
      LEFT JOIN authors a 
        ON a.id = p.author_id AND a.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
        AND (
          LOWER(p.name) LIKE $1
          OR LOWER(p.description) LIKE $1
        )
      ORDER BY p.created_at DESC
      LIMIT 5;
    `;
    const { rows: products } = await db.query(productsSql, [keyword]);

    // ================================
    // 2. AUTHORS
    // ================================
    const authorsSql = `
      SELECT
        id,
        name,
        photo_url
      FROM authors
      WHERE deleted_at IS NULL
        AND LOWER(name) LIKE $1
      ORDER BY name ASC
      LIMIT 5;
    `;
    const { rows: authors } = await db.query(authorsSql, [keyword]);

    // ================================
    // 3. PUBLISHERS
    // ================================
    const publishersSql = `
      SELECT
        id,
        name,
        logo_url
      FROM publishers
      WHERE deleted_at IS NULL
        AND LOWER(name) LIKE $1
      ORDER BY name ASC
      LIMIT 5;
    `;
    const { rows: publishers } = await db.query(publishersSql, [keyword]);

    return { products, authors, publishers };
  },
};

export default searchService;
