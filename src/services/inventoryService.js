const inventoryService = {
  async deductStockOrFail(client, product_id, qty) {
    const q = Math.max(1, parseInt(qty, 10));

    const { rowCount } = await client.query(
      `
      UPDATE products
      SET stock = stock - $2
      WHERE id = $1
        AND deleted_at IS NULL
        AND stock >= $2
      `,
      [product_id, q]
    );

    if (rowCount === 0) {
      const e = new Error(`Insufficient stock for product ${product_id}`);
      e.status = 409;
      throw e;
    }

    return q;
  },
};

export default inventoryService;
