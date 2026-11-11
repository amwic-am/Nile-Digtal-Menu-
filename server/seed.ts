import crypto from 'node:crypto';
import { one, query } from './db.js';

const token = () => crypto.randomBytes(16).toString('base64url');
const sessionCode = () => `S-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export async function seedDb() {
  const existing = await one<{ count: number }>('SELECT count(*)::int AS count FROM restaurants');
  if (existing && existing.count > 0) return;

  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim() || 'admin@nilehotel.com';

  const restaurant = await one<{ id: number }>(
    `INSERT INTO restaurants (name, slug, address, phone, service_charge_pct, tax_pct, auto_accept_orders, auto_open_sessions)
     VALUES ('Nile Restaurant', 'nile', 'Nile Hotel, Kazanchis, Addis Ababa', '+251 11 555 0123', 10, 0, false, true)
     RETURNING id`,
  );
  const rid = restaurant!.id;

  const staffSeed: Array<[string, string, string]> = [
    ['Abel Mesfin', initialAdminEmail, 'super_admin'],
    ['Selam Tesfaye', 'manager@nilehotel.com', 'manager'],
    ['Dawit Bekele', 'waiter@nilehotel.com', 'waiter'],
    ['Yonas Girma', 'chef@nilehotel.com', 'chef'],
    ['Hana Lemma', 'cashier@nilehotel.com', 'cashier'],
    ['Meron Assefa', 'reception@nilehotel.com', 'receptionist'],
  ];
  const staffIds: Record<string, number> = {};
  for (const [name, email, role] of staffSeed) {
    const row = await one<{ id: number }>(
      `INSERT INTO staff (restaurant_id, name, email, role) VALUES ($1,$2,$3,$4) RETURNING id`,
      [rid, name, email, role],
    );
    staffIds[role] = row!.id;
  }

  const ground = (await one<{ id: number }>(
    `INSERT INTO dining_floors (restaurant_id, name, level, sort) VALUES ($1,'Ground Floor',0,1) RETURNING id`,
    [rid],
  ))!.id;
  const first = (await one<{ id: number }>(
    `INSERT INTO dining_floors (restaurant_id, name, level, sort) VALUES ($1,'First Floor',1,2) RETURNING id`,
    [rid],
  ))!.id;
  const roof = (await one<{ id: number }>(
    `INSERT INTO dining_floors (restaurant_id, name, level, sort) VALUES ($1,'Rooftop',2,3) RETURNING id`,
    [rid],
  ))!.id;

  const areaSeed: Array<[string, number, string, number]> = [
    ['Main Dining Hall', ground, 'Signature dining under hand-woven pendant lights', 1],
    ['VIP Lounge', first, 'Private booths for intimate gatherings', 2],
    ['Rooftop Terrace', roof, 'Open-air dining with skyline views', 3],
    ['Garden Terrace', ground, 'Courtyard seating framed by jasmine', 4],
  ];
  const areas: Record<string, number> = {};
  for (const [name, floorId, description, sort] of areaSeed) {
    const row = await one<{ id: number }>(
      `INSERT INTO dining_areas (restaurant_id, floor_id, name, description, sort) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [rid, floorId, name, description, sort],
    );
    areas[name] = row!.id;
  }

  const tableSeed: Array<{
    code: string; area: string; floor: number; capacity: number; shape: 'square' | 'round' | 'rect';
    status: string; x: number; y: number; w: number; h: number; rotation?: number; label: string;
  }> = [
    { code: 'T-001', area: 'Main Dining Hall', floor: ground, capacity: 4, shape: 'square', status: 'available', x: 120, y: 90, w: 112, h: 112, label: 'Window side' },
    { code: 'T-002', area: 'Main Dining Hall', floor: ground, capacity: 6, shape: 'round', status: 'occupied', x: 320, y: 80, w: 130, h: 130, label: 'Centre round' },
    { code: 'T-003', area: 'Main Dining Hall', floor: ground, capacity: 4, shape: 'square', status: 'reserved', x: 540, y: 100, w: 112, h: 112, label: 'Near the fireplace' },
    { code: 'T-004', area: 'Main Dining Hall', floor: ground, capacity: 8, shape: 'rect', status: 'available', x: 730, y: 70, w: 170, h: 120, label: 'Long table' },
    { code: 'T-005', area: 'Main Dining Hall', floor: ground, capacity: 2, shape: 'round', status: 'cleaning', x: 180, y: 330, w: 104, h: 104, label: 'Bar side' },
    { code: 'T-006', area: 'Main Dining Hall', floor: ground, capacity: 4, shape: 'square', status: 'available', x: 430, y: 320, w: 112, h: 112, label: 'Garden view' },
    { code: 'V-001', area: 'VIP Lounge', floor: first, capacity: 8, shape: 'rect', status: 'available', x: 260, y: 130, w: 200, h: 130, label: 'Private booth' },
    { code: 'V-002', area: 'VIP Lounge', floor: first, capacity: 6, shape: 'round', status: 'available', x: 620, y: 180, w: 140, h: 140, label: 'Lounge round' },
    { code: 'R-001', area: 'Rooftop Terrace', floor: roof, capacity: 2, shape: 'round', status: 'available', x: 140, y: 150, w: 104, h: 104, label: 'Sunset two-top' },
    { code: 'R-002', area: 'Rooftop Terrace', floor: roof, capacity: 4, shape: 'square', status: 'available', x: 400, y: 120, w: 112, h: 112, label: 'Skyline view' },
    { code: 'R-003', area: 'Rooftop Terrace', floor: roof, capacity: 6, shape: 'rect', status: 'available', x: 650, y: 180, w: 160, h: 120, label: 'Terrace long table' },
    { code: 'G-001', area: 'Garden Terrace', floor: ground, capacity: 2, shape: 'round', status: 'available', x: 190, y: 170, w: 104, h: 104, label: 'Under the jasmine' },
    { code: 'G-002', area: 'Garden Terrace', floor: ground, capacity: 4, shape: 'square', status: 'available', x: 440, y: 290, w: 112, h: 112, label: 'Fountain side' },
    { code: 'G-003', area: 'Garden Terrace', floor: ground, capacity: 4, shape: 'square', status: 'available', x: 660, y: 120, w: 112, h: 112, label: 'Gazebo' },
  ];

  const tableIds: Record<string, number> = {};
  for (const t of tableSeed) {
    const row = await one<{ id: number }>(
      `INSERT INTO dining_tables
        (restaurant_id, floor_id, area_id, code, name, capacity, shape, status, location_label,
         pos_x, pos_y, width, height, rotation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [rid, t.floor, areas[t.area], t.code, `${t.area} ${t.code}`, t.capacity, t.shape, t.status,
        t.label, t.x, t.y, t.w, t.h, t.rotation ?? 0],
    );
    tableIds[t.code] = row!.id;
    await query(
      `INSERT INTO table_qr_codes (table_id, token, created_by) VALUES ($1,$2,$3)`,
      [row!.id, token(), staffIds.super_admin],
    );
  }

  const categorySeed: Array<[string, string, string, number]> = [
    ['Nile Signatures', 'የአባይ ምርጥ ምግቦች', 'The plates our chefs are known for', 1],
    ['Traditional', 'ባህላዊ ምግቦች', 'Ethiopian classics, slow-cooked and shared', 2],
    ['Grill & International', 'ጥብስና የውጭ ምግቦች', 'Charcoal grill and hotel favourites', 3],
    ['Drinks', 'መጠጦች', 'Fresh juice, spiced tea and single-origin coffee', 4],
  ];
  const categoryIds: Record<string, number> = {};
  for (const [name, nameAm, description, sort] of categorySeed) {
    const row = await one<{ id: number }>(
      `INSERT INTO menu_categories (restaurant_id, name, name_am, description, sort) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [rid, name, nameAm, description, sort],
    );
    categoryIds[name] = row!.id;
  }

  const menuSeed: Array<{
    name: string; nameAm: string; cat: string; price: number; image?: string; description: string;
    signature?: boolean; spice?: number; prep?: number; tags: string; sort: number;
  }> = [
    {
      name: 'Nile Grand Platter', nameAm: 'የአባይ ምርጥ ምግብ', cat: 'Nile Signatures', price: 1450,
      image: '/dishes/nile-platter.png', signature: true, spice: 2, prep: 25, sort: 1,
      description: 'A shared feast of doro wot, tibs, shiro, kitfo and garden greens with warm injera — the table centrepiece.',
      tags: 'sharing,chef pick,for two',
    },
    {
      name: 'Combo Feast for Two', nameAm: 'የጋራ ግብዣ', cat: 'Nile Signatures', price: 1200,
      image: '/dishes/combo-feast.png', signature: true, spice: 1, prep: 20, sort: 2,
      description: 'Pizza, our signature burger, hand-cut fries and dipping sauces, served on a sharing board.',
      tags: 'sharing,western,crowd pleaser',
    },
    {
      name: 'Doro Wot', nameAm: 'ዶሮ ወጥ', cat: 'Traditional', price: 650,
      image: '/dishes/doro-wot.png', signature: true, spice: 2, prep: 15, sort: 1,
      description: 'Slow-simmered chicken marinated in berbere and niter kibbeh, finished with a boiled egg and ayib.',
      tags: 'classic,signature',
    },
    {
      name: 'Special Tibs', nameAm: 'ልዩ ጥብስ', cat: 'Traditional', price: 800,
      image: '/dishes/special-tibs.png', signature: true, spice: 2, prep: 18, sort: 2,
      description: 'Tender beef seared with rosemary, onion, green pepper and a whisper of awaze in a clay pot.',
      tags: 'beef,grill',
    },
    {
      name: 'Kitfo', nameAm: 'ክትፎ', cat: 'Traditional', price: 720,
      image: '/dishes/kitfo.png', spice: 2, prep: 15, sort: 3,
      description: 'Hand-minced prime beef warmed in mitmita and niter kibbeh, served with ayib and kocho.',
      tags: 'beef,spicy',
    },
    {
      name: 'Shiro Tegabino', nameAm: 'ሽሮ ተጋቢኖ', cat: 'Traditional', price: 320,
      image: '/dishes/nile-platter.png', spice: 1, prep: 12, sort: 4,
      description: 'Silky chickpea shiro bubbling in a clay pot, with garlic, onion and a swirl of niter kibbeh.',
      tags: 'vegetarian,comfort',
    },
    {
      name: 'Fasting Platter', nameAm: 'የጾም ምግብ', cat: 'Traditional', price: 600,
      image: '/dishes/nile-platter.png', spice: 1, prep: 15, sort: 5,
      description: 'A colourful spread of shiro, misir wot, gomen, atkilt and beetroot with fresh injera.',
      tags: 'vegan,sharing',
    },
    {
      name: 'Nile Signature Burger', nameAm: 'የአባይ በርገር', cat: 'Grill & International', price: 550,
      image: '/dishes/nile-burger.png', signature: true, spice: 0, prep: 18, sort: 1,
      description: 'Dry-aged beef patty, smoked cheese, caramelised onion, tomato jam and avocado in a brioche bun.',
      tags: 'beef,signature',
    },
    {
      name: 'Pizza Margherita', nameAm: 'ፒዛ ማርጋሪታ', cat: 'Grill & International', price: 750,
      image: '/dishes/combo-feast.png', spice: 0, prep: 20, sort: 2,
      description: 'Wood-fired sourdough base, San Marzano tomato, mozzarella and basil from our garden.',
      tags: 'vegetarian,wood fired',
    },
    {
      name: 'Fresh Juice Trio', nameAm: 'ትኩስ ጁስ', cat: 'Drinks', price: 180,
      image: '/dishes/fresh-juice.png', spice: 0, prep: 6, sort: 1,
      description: 'Layered avocado, mango and papaya juice, pressed to order and served chilled.',
      tags: 'fresh,cold',
    },
    {
      name: 'Ethiopian Coffee Ceremony', nameAm: 'የቡና ሥርዓት', cat: 'Drinks', price: 150,
      image: '/dishes/coffee-ceremony.png', signature: true, spice: 0, prep: 10, sort: 2,
      description: 'Single-origin Yirgacheffe roasted at your table, poured from a clay jebena with frankincense.',
      tags: 'coffee,ceremony',
    },
    {
      name: 'Macchiato', nameAm: 'ማኪያቶ', cat: 'Drinks', price: 80,
      image: '/dishes/coffee-ceremony.png', spice: 0, prep: 4, sort: 3,
      description: 'Double espresso cut with steamed milk — the Addis afternoon ritual.',
      tags: 'coffee',
    },
  ];

  const menuIds: Record<string, number> = {};
  for (const item of menuSeed) {
    const row = await one<{ id: number }>(
      `INSERT INTO menu_items
        (restaurant_id, category_id, name, name_am, description, price, image, is_signature,
         ar_enabled, spice_level, prep_minutes, tags, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [rid, categoryIds[item.cat], item.name, item.nameAm, item.description, item.price,
        item.image ?? null, item.signature ?? false, true, item.spice ?? 0, item.prep ?? 15,
        item.tags, item.sort],
    );
    menuIds[item.name] = row!.id;
  }

  const addonSeed: Array<[string, string, number]> = [
    ['Nile Grand Platter', 'Extra injera', 30],
    ['Nile Grand Platter', 'Ayib cheese', 60],
    ['Doro Wot', 'Extra injera', 30],
    ['Doro Wot', 'Extra boiled egg', 40],
    ['Doro Wot', 'Ayib cheese', 60],
    ['Special Tibs', 'Extra injera', 30],
    ['Special Tibs', 'Awaze on the side', 25],
    ['Kitfo', 'Ayib cheese', 60],
    ['Kitfo', 'Extra kocho', 50],
    ['Nile Signature Burger', 'Double patty', 180],
    ['Nile Signature Burger', 'Smoked cheese', 60],
    ['Nile Signature Burger', 'Avocado', 50],
    ['Pizza Margherita', 'Extra mozzarella', 90],
    ['Pizza Margherita', 'Jalapeños', 40],
  ];
  for (const [item, name, price] of addonSeed) {
    await query('INSERT INTO menu_addons (menu_item_id, name, price) VALUES ($1,$2,$3)', [
      menuIds[item], name, price,
    ]);
  }

  // Seeded live service: T-002 occupied with two orders, T-003 reserved, T-005 cleaning
  const session = await one<{ id: number }>(
    `INSERT INTO table_sessions (table_id, code, guests_count, opened_by, opened_at)
     VALUES ($1,$2,2,$3, now() - interval '38 minutes') RETURNING id`,
    [tableIds['T-002'], sessionCode(), staffIds.waiter],
  );
  const sid = session!.id;
  await query(
    `INSERT INTO table_session_guests (session_id, guest_key, name, is_lead) VALUES ($1,'seed-g1','Selam A.',true), ($1,'seed-g2','Guest of Selam',false)`,
    [sid],
  );
  await query(
    `INSERT INTO waiter_assignments (table_id, staff_id, assigned_at)
     VALUES ($1,$2, now() - interval '3 hours'), ($3,$2, now() - interval '3 hours')`,
    [tableIds['T-002'], staffIds.waiter, tableIds['T-001']],
  );

  const order1 = await one<{ id: number; order_no: number }>(
    `INSERT INTO orders
      (session_id, table_id, restaurant_id, guest_name, status, source, subtotal, service_charge, tax, total, waiter_id, created_at, updated_at)
     VALUES ($1,$2,$3,'Selam A.','preparing','qr',1660,166,0,1826,$4, now() - interval '34 minutes', now() - interval '12 minutes')
     RETURNING id, order_no`,
    [sid, tableIds['T-002'], rid, staffIds.waiter],
  );
  await query(
    `INSERT INTO order_items (order_id, menu_item_id, name, qty, unit_price, total, notes) VALUES
      ($1,$2,'Doro Wot',2,650,1300,'One mild, one spicy'),
      ($1,$3,'Fresh Juice Trio',2,180,360,NULL)`,
    [order1!.id, menuIds['Doro Wot'], menuIds['Fresh Juice Trio']],
  );
  const order2 = await one<{ id: number; order_no: number }>(
    `INSERT INTO orders
      (session_id, table_id, restaurant_id, guest_name, status, source, subtotal, service_charge, tax, total, waiter_id, created_at, updated_at)
     VALUES ($1,$2,$3,'Selam A.','new','qr',950,95,0,1045,$4, now() - interval '9 minutes', now() - interval '9 minutes')
     RETURNING id, order_no`,
    [sid, tableIds['T-002'], rid, staffIds.waiter],
  );
  await query(
    `INSERT INTO order_items (order_id, menu_item_id, name, qty, unit_price, total) VALUES
      ($1,$2,'Special Tibs',1,800,800),
      ($1,$3,'Ethiopian Coffee Ceremony',1,150,150)`,
    [order2!.id, menuIds['Special Tibs'], menuIds['Ethiopian Coffee Ceremony']],
  );

  for (const [orderId, status, note] of [
    [order1!.id, 'new', 'Order received from QR · T-002'],
    [order1!.id, 'accepted', 'Accepted by Selam Tesfaye'],
    [order1!.id, 'preparing', 'Sent to kitchen'],
    [order2!.id, 'new', 'Order received from QR · T-002'],
  ] as Array<[number, string, string]>) {
    await query(
      `INSERT INTO order_status_history (order_id, status, note, changed_by, created_at)
       VALUES ($1,$2,$3,'Nile staff', now() - interval '30 minutes')`,
      [orderId, status, note],
    );
  }

  const bill = await one<{ id: number }>(
    `INSERT INTO table_bills (session_id, table_id, subtotal, service_charge, tax, total)
     VALUES ($1,$2,2610,261,0,2871) RETURNING id`,
    [sid, tableIds['T-002']],
  );

  await query(
    `INSERT INTO table_reservations
      (restaurant_id, table_id, customer_name, phone, guests, reserved_at, duration_min, status, notes)
     VALUES ($1,$2,'Lulit Haile','+251 911 204 556',6, now() + interval '2 hours',120,'confirmed','Birthday — quiet corner if possible')`,
    [rid, tableIds['T-003']],
  );
  await query(
    `INSERT INTO table_reservations
      (restaurant_id, table_id, customer_name, phone, guests, reserved_at, duration_min, status, notes)
     VALUES ($1,$2,'Daniel Mekonnen','+251 922 771 090',2, now() + interval '26 hours',90,'confirmed',NULL)`,
    [rid, tableIds['R-001']],
  );

  const logSeed: Array<[string, string, string, string]> = [
    ['T-002', 'session_opened', 'Table session opened by Dawit Bekele', '38 minutes ago'],
    ['T-002', 'order_placed', `Order #${order1!.order_no} placed from table QR`, '34 minutes ago'],
    ['T-002', 'status_changed', `Order #${order1!.order_no} moved to Preparing`, '12 minutes ago'],
    ['T-002', 'order_placed', `Order #${order2!.order_no} placed from table QR`, '9 minutes ago'],
    ['T-003', 'reserved', 'Reserved for Lulit Haile, 6 guests', '20 minutes ago'],
    ['T-005', 'status_changed', 'Bill settled — table sent to cleaning', '26 minutes ago'],
  ];
  for (const [code, action, detail, ago] of logSeed) {
    await query(
      `INSERT INTO table_activity_logs (table_id, action, detail, staff_id, created_at)
       VALUES ($1,$2,$3,$4, now() - interval '${ago}')`,
      [tableIds[code], action, detail, staffIds.manager],
    );
  }

  await query(
    `INSERT INTO table_activity_logs (table_id, action, detail, staff_id, created_at)
     VALUES ($1,'layout_saved','Floor plan saved', $2, now() - interval '1 day')`,
    [tableIds['T-001'], staffIds.manager],
  );

  void bill;
}
