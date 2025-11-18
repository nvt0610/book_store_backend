import pg from "pg";
import dotenv from "dotenv";
import { getRequestContext } from "../middlewares/requestContext.js";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

/**
 * Core db utility for the whole project.
 * Supports single query, transaction, and request-scoped logging.
 */
const db = {
  /**
   * Execute a single query (default usage)
   */
  async query(text, params = []) {
    const start = Date.now();
    const ctx = getRequestContext();
    const user_id = ctx.user_id || null;

    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.LOG_LEVEL === "debug") {
      console.log(`[SQL][${duration}ms][user=${user_id || "anon"}] ${text}`);
    }

    return result;
  },

  /**
   * Run a function within a transaction
   */
  async transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Get a dedicated client for manual transaction control
   */
  async getClient() {
    const client = await pool.connect();
    return {
      query: (text, params) => client.query(text, params),
      release: () => client.release(),
      async begin() {
        await client.query("BEGIN");
      },
      async commit() {
        await client.query("COMMIT");
      },
      async rollback() {
        await client.query("ROLLBACK");
      },
    };
  },
};

export default db;
