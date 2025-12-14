import db from "../db/db.js";

const dashboardService = {
  async getSummary() {
    // ---------- COUNT USERS ----------
    const usersCountRes = await db.query(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE deleted_at IS NULL`
    );
    const totalUsers = Number(usersCountRes.rows[0].total || 0);

    // ---------- COUNT PRODUCTS ----------
    const productsCountRes = await db.query(
      `SELECT COUNT(*) AS total
       FROM products
       WHERE deleted_at IS NULL`
    );
    const totalProducts = Number(productsCountRes.rows[0].total || 0);

    // ---------- COUNT ORDERS ----------
    const ordersCountRes = await db.query(
      `SELECT COUNT(*) AS total
       FROM orders
       WHERE deleted_at IS NULL`
    );
    const totalOrders = Number(ordersCountRes.rows[0].total || 0);

    // ---------- REVENUE THIS MONTH ----------
    const revenueRes = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS revenue
       FROM orders
       WHERE deleted_at IS NULL
         AND status = 'COMPLETED'
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`
    );
    const revenueThisMonth = Number(revenueRes.rows[0].revenue || 0);

    // ---------- LATEST ORDERS ----------
    const latestOrdersRes = await db.query(
      `SELECT id, total_amount, status, created_at
       FROM orders
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 5`
    );

    // ---------- LATEST USERS (optional) ----------
    const latestUsersRes = await db.query(
      `SELECT id, full_name, email, created_at
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 5`
    );

    return {
      total_users: totalUsers,
      total_products: totalProducts,
      total_orders: totalOrders,
      revenue_this_month: revenueThisMonth,
      latest_orders: latestOrdersRes.rows,
      latest_users: latestUsersRes.rows,
    };
  },
};

export default dashboardService;
