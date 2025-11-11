-- ================================================
-- 🧱 DATABASE: bookstore_db
-- AUTHOR: You
-- VERSION: v4.1 (final, single init file, +improvements 4/5/7)
-- Notes:
--  - (4) Enforce uniqueness of (order_id, product_id) in order_items (active rows)
--  - (5) Add search indexes for authors/publishers by lower(name)
--  - (7) Secure user_sessions: store hashed refresh token + jti (no raw token)
-- ================================================

-- Drop enums if exist (safe on fresh)
DO $$ BEGIN
  DROP TYPE IF EXISTS user_role CASCADE;
  DROP TYPE IF EXISTS user_status CASCADE;
  DROP TYPE IF EXISTS product_status CASCADE;
  DROP TYPE IF EXISTS order_status CASCADE;
  DROP TYPE IF EXISTS cart_status CASCADE;
  DROP TYPE IF EXISTS payment_status CASCADE;
  DROP TYPE IF EXISTS payment_method CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ENUM definitions (values UPPERCASE for consistency)
CREATE TYPE user_role      AS ENUM ('GUEST', 'CUSTOMER', 'ADMIN');
CREATE TYPE user_status    AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE product_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE order_status   AS ENUM ('PENDING', 'PAID', 'SHIPPED', 'CANCELLED', 'INACTIVE');
CREATE TYPE cart_status    AS ENUM ('ACTIVE', 'CHECKED_OUT', 'INACTIVE');
CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'INACTIVE');
CREATE TYPE payment_method AS ENUM ('COD', 'CREDIT_CARD', 'VNPAY', 'MOMO');

-- ======================
-- USERS
-- ======================
CREATE TABLE users (
  id UUID PRIMARY KEY,
  -- name được chuẩn hóa thành full_name + first_name/last_name
  full_name  VARCHAR(150) NOT NULL,
  first_name VARCHAR(100),
  last_name  VARCHAR(100),

  email    VARCHAR(150) NOT NULL,   -- ❗ partial unique bên dưới (case-insensitive, active only)
  password VARCHAR(255) NOT NULL,
  role   user_role   NOT NULL DEFAULT 'CUSTOMER',
  phone  VARCHAR(20),
  status user_status NOT NULL DEFAULT 'ACTIVE',

  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,

  created_by UUID,
  updated_by UUID,
  deleted_by UUID,

  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_users_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
);

-- ======================
-- CATEGORIES
-- ======================
CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_by UUID REFERENCES users(id)
);

-- ======================
-- AUTHORS
-- ======================
CREATE TABLE authors (
  id UUID PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  biography  TEXT,
  photo_url  VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_by UUID REFERENCES users(id)
);

-- ======================
-- PUBLISHERS
-- ======================
CREATE TABLE publishers (
  id UUID PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address  TEXT,
  phone    VARCHAR(50),
  website  VARCHAR(255),
  logo_url VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_by UUID REFERENCES users(id)
);

-- ======================
-- PRODUCTS
-- ======================
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock INT DEFAULT 0,
  main_image   VARCHAR(255),
  extra_images TEXT[],

  category_id  UUID NOT NULL REFERENCES categories(id),
  publisher_id UUID NOT NULL REFERENCES publishers(id),
  author_id    UUID NOT NULL REFERENCES authors(id),

  status product_status NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_by UUID REFERENCES users(id),

  -- Safety: giá/stock không âm
  CONSTRAINT ck_products_nonneg CHECK (price >= 0 AND stock >= 0)
);

-- ======================
-- ADDRESSES
-- ======================
CREATE TABLE addresses (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),

  full_name    VARCHAR(150) NOT NULL,
  phone        VARCHAR(20)  NOT NULL,
  address_line TEXT         NOT NULL,
  address_line2 TEXT,
  postal_code   VARCHAR(20),

  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_by UUID REFERENCES users(id)
);

-- ======================
-- CARTS & CART_ITEMS
-- ======================
CREATE TABLE carts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  status  cart_status NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY,
  cart_id    UUID NOT NULL REFERENCES carts(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT ck_cart_items_qty_pos CHECK (quantity > 0)
);

-- ======================
-- ORDERS & ORDER_ITEMS
-- ======================
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  address_id UUID NOT NULL REFERENCES addresses(id),

  total_amount DECIMAL(10,2) NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',

  -- mốc thời gian tối thiểu cho báo cáo
  placed_at TIMESTAMPTZ,
  paid_at   TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  deleted_by UUID REFERENCES users(id),

  CONSTRAINT ck_orders_total_nonneg CHECK (total_amount >= 0)
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id   UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL REFERENCES products(id),

  quantity INT NOT NULL DEFAULT 1,
  price    DECIMAL(10,2) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT ck_order_items_qty_price CHECK (quantity > 0 AND price >= 0)
);

-- ======================
-- PAYMENTS
-- ======================
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),

  payment_method payment_method NOT NULL,
  payment_date   TIMESTAMPTZ,
  amount         DECIMAL(10,2) NOT NULL,
  status         payment_status NOT NULL DEFAULT 'PENDING',
  payment_ref    VARCHAR(100), -- nếu có (COD vẫn để trống được)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT ck_payments_amount_pos CHECK (amount > 0)
);

-- ======================
-- USER SESSIONS (JWT) — (7) store hashed refresh token (no raw token)
-- ======================
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),

  -- ❗ Lưu HASH của refresh token (vd: bcrypt/argon2), KHÔNG lưu token gốc
  hashed_token TEXT NOT NULL,

  -- jti (JWT ID) cho phép revoke/trace, đảm bảo duy nhất per session
  session_jti UUID NOT NULL,

  ip_address VARCHAR(50),
  user_agent TEXT,
  is_revoked BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  expired_at TIMESTAMPTZ,

  CONSTRAINT ux_user_sessions_jti UNIQUE (session_jti)
);

-- ======================
-- INDEXES
-- ======================

-- FK helper indexes
CREATE INDEX idx_products_category   ON products(category_id);
CREATE INDEX idx_products_author     ON products(author_id);
CREATE INDEX idx_products_publisher  ON products(publisher_id);
CREATE INDEX idx_orders_user         ON orders(user_id);
CREATE INDEX idx_orders_status       ON orders(status);
CREATE INDEX idx_orders_created_at   ON orders(created_at);
CREATE INDEX idx_payments_order      ON payments(order_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_addresses_user      ON addresses(user_id);
CREATE INDEX idx_cart_user           ON carts(user_id);
CREATE INDEX idx_sessions_user       ON user_sessions(user_id);
CREATE INDEX idx_sessions_expired_at ON user_sessions(expired_at);

-- Soft delete indexes
CREATE INDEX idx_soft_delete_users        ON users(deleted_at);
CREATE INDEX idx_soft_delete_products     ON products(deleted_at);
CREATE INDEX idx_soft_delete_orders       ON orders(deleted_at);
CREATE INDEX idx_soft_delete_categories   ON categories(deleted_at);
CREATE INDEX idx_soft_delete_authors      ON authors(deleted_at);
CREATE INDEX idx_soft_delete_publishers   ON publishers(deleted_at);
CREATE INDEX idx_soft_delete_addresses    ON addresses(deleted_at);
CREATE INDEX idx_soft_delete_carts        ON carts(deleted_at);
CREATE INDEX idx_soft_delete_cart_items   ON cart_items(deleted_at);
CREATE INDEX idx_soft_delete_order_items  ON order_items(deleted_at);
CREATE INDEX idx_soft_delete_payments     ON payments(deleted_at);

-- Search helpers (users/products) giữ nguyên
CREATE INDEX idx_users_email_lower       ON users (lower(email));
CREATE INDEX idx_users_full_name_lower   ON users (lower(full_name));
CREATE INDEX idx_users_first_name_lower  ON users (lower(first_name));
CREATE INDEX idx_users_last_name_lower   ON users (lower(last_name));
CREATE INDEX idx_users_phone             ON users (phone);
CREATE INDEX idx_products_name_lower     ON products (lower(name));

-- (5) Search helpers bổ sung: authors/publishers theo lower(name)
CREATE INDEX idx_authors_name_lower      ON authors (lower(name));
CREATE INDEX idx_publishers_name_lower   ON publishers (lower(name));

-- Partial unique: email unique khi ACTIVE (deleted_at IS NULL), case-insensitive
CREATE UNIQUE INDEX ux_users_email_active
  ON users (lower(email))
  WHERE deleted_at IS NULL;

-- Cart constraints (thực dụng)
-- 1 user chỉ có 1 cart ACTIVE (active + chưa xóa mềm)
CREATE UNIQUE INDEX ux_carts_user_active
  ON carts(user_id)
  WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Không trùng (cart_id, product_id) trong cart_items active
CREATE UNIQUE INDEX ux_cart_items_unique
  ON cart_items(cart_id, product_id)
  WHERE deleted_at IS NULL;

-- (4) Không trùng (order_id, product_id) trong order_items active
CREATE UNIQUE INDEX ux_order_items_unique
  ON order_items(order_id, product_id)
  WHERE deleted_at IS NULL;
