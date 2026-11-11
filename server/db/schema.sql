-- Nile Table — restaurant operations schema (PostgreSQL / Supabase)

CREATE TABLE IF NOT EXISTS restaurants (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  address text,
  phone text,
  currency text NOT NULL DEFAULT 'ETB',
  service_charge_pct numeric(5,2) NOT NULL DEFAULT 10,
  tax_pct numeric(5,2) NOT NULL DEFAULT 0,
  auto_accept_orders boolean NOT NULL DEFAULT false,
  auto_open_sessions boolean NOT NULL DEFAULT true,
  menu_languages text NOT NULL DEFAULT 'en,am',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin','manager','receptionist','waiter','cashier','chef','auditor')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dining_floors (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  level int NOT NULL DEFAULT 0,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dining_areas (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  floor_id int NOT NULL REFERENCES dining_floors(id),
  name text NOT NULL,
  description text,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  floor_id int REFERENCES dining_floors(id),
  area_id int REFERENCES dining_areas(id),
  code text NOT NULL,
  name text,
  capacity int NOT NULL DEFAULT 4,
  shape text NOT NULL DEFAULT 'square' CHECK (shape IN ('square','round','rect')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','cleaning','inactive')),
  location_label text,
  is_active boolean NOT NULL DEFAULT true,
  pos_x int NOT NULL DEFAULT 120,
  pos_y int NOT NULL DEFAULT 120,
  width int NOT NULL DEFAULT 110,
  height int NOT NULL DEFAULT 110,
  rotation int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tables_code ON dining_tables(restaurant_id, code) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS table_qr_codes (
  id serial PRIMARY KEY,
  table_id int NOT NULL REFERENCES dining_tables(id),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_by int REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_qr_active ON table_qr_codes(table_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS table_sessions (
  id serial PRIMARY KEY,
  table_id int NOT NULL REFERENCES dining_tables(id),
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  guests_count int NOT NULL DEFAULT 1,
  opened_by int REFERENCES staff(id),
  closed_by int REFERENCES staff(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_session_open ON table_sessions(table_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ix_session_table ON table_sessions(table_id);

CREATE TABLE IF NOT EXISTS table_session_guests (
  id serial PRIMARY KEY,
  session_id int NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  guest_key text,
  name text,
  is_lead boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  name_am text,
  description text,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  category_id int NOT NULL REFERENCES menu_categories(id),
  name text NOT NULL,
  name_am text,
  description text,
  price numeric(12,2) NOT NULL,
  image text,
  is_available boolean NOT NULL DEFAULT true,
  is_signature boolean NOT NULL DEFAULT false,
  ar_enabled boolean NOT NULL DEFAULT true,
  spice_level int NOT NULL DEFAULT 0,
  prep_minutes int NOT NULL DEFAULT 15,
  tags text,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_addons (
  id serial PRIMARY KEY,
  menu_item_id int NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0
);

CREATE SEQUENCE IF NOT EXISTS order_no_seq START WITH 1041;

CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  order_no int NOT NULL UNIQUE DEFAULT nextval('order_no_seq'),
  session_id int NOT NULL REFERENCES table_sessions(id),
  table_id int NOT NULL REFERENCES dining_tables(id),
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  guest_name text,
  guest_room text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','preparing','ready','served','completed','cancelled')),
  source text NOT NULL DEFAULT 'qr' CHECK (source IN ('qr','waiter','reception')),
  notes text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  service_charge numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  waiter_id int REFERENCES staff(id),
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id serial PRIMARY KEY,
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id int REFERENCES menu_items(id),
  name text NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  unit_price numeric(12,2) NOT NULL,
  notes text,
  total numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_item_addons (
  id serial PRIMARY KEY,
  order_item_id int NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id serial PRIMARY KEY,
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_bills (
  id serial PRIMARY KEY,
  session_id int NOT NULL UNIQUE REFERENCES table_sessions(id),
  table_id int NOT NULL REFERENCES dining_tables(id),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  service_charge numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  session_id int NOT NULL REFERENCES table_sessions(id),
  bill_id int REFERENCES table_bills(id),
  table_id int NOT NULL REFERENCES dining_tables(id),
  amount numeric(12,2) NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','card','telebirr','room_charge')),
  reference text,
  received_by int REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waiter_assignments (
  id serial PRIMARY KEY,
  table_id int NOT NULL REFERENCES dining_tables(id),
  staff_id int NOT NULL REFERENCES staff(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz
);

CREATE TABLE IF NOT EXISTS table_reservations (
  id serial PRIMARY KEY,
  restaurant_id int NOT NULL REFERENCES restaurants(id),
  table_id int NOT NULL REFERENCES dining_tables(id),
  customer_name text NOT NULL,
  phone text,
  email text,
  guests int NOT NULL DEFAULT 2,
  reserved_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 120,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','seated','cancelled','no_show','completed')),
  notes text,
  deposit numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_reservations_time ON table_reservations(table_id, reserved_at);

CREATE TABLE IF NOT EXISTS table_activity_logs (
  id serial PRIMARY KEY,
  table_id int NOT NULL REFERENCES dining_tables(id),
  action text NOT NULL,
  detail text,
  staff_id int REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
