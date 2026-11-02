import crypto from 'node:crypto';
import { Router } from 'express';
import { one, query, withTx } from '../db.js';
import {
  broadcastOrder, getActiveSession, getBillForSession, getRestaurant, getSessionSummary,
  logActivity, recomputeBill, setTableStatus,
} from '../domain.js';
import { emitTo } from '../realtime.js';
import { appOrigin } from '../qr.js';

export const publicRouter = Router();

const sessionCode = () => `S-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
const orderBuckets = new Map<string, number[]>();
const callBuckets = new Map<string, number[]>();

function rateLimited(key: string, bucket: Map<string, number[]>, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (bucket.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    bucket.set(key, hits);
    return true;
  }
  hits.push(now);
  bucket.set(key, hits);
  return false;
}

type QrContext = {
  tableId: number;
  tableCode: string;
  tableName: string;
  capacity: number;
  shape: string;
  status: string;
  locationLabel: string | null;
  isActive: boolean;
  areaName: string;
  floorName: string;
  restaurantId: number;
  qrToken: string;
  qrCreatedAt: string | null;
};

async function resolveQr(token: string): Promise<QrContext | null> {
  return one<QrContext>(
    `SELECT t.id AS "tableId", t.code AS "tableCode", t.name AS "tableName", t.capacity, t.shape,
            t.status, t.location_label AS "locationLabel", t.is_active AS "isActive",
            a.name AS "areaName", f.name AS "floorName", t.restaurant_id AS "restaurantId",
            q.token AS "qrToken", q.created_at AS "qrCreatedAt"
     FROM table_qr_codes q
     JOIN dining_tables t ON t.id = q.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN dining_floors f ON f.id = t.floor_id
     WHERE q.token = $1 AND q.status = 'active' AND t.deleted_at IS NULL`,
    [token],
  );
}

async function sessionForToken(token: string, sessionId: number) {
  return one<{ id: number; tableId: number; status: string; tableCode: string }>(
    `SELECT s.id, s.table_id AS "tableId", s.status, t.code AS "tableCode"
     FROM table_sessions s
     JOIN dining_tables t ON t.id = s.table_id
     JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
     WHERE s.id = $2 AND q.token = $1`,
    [token, sessionId],
  );
}

async function menuFor(restaurantId: number) {
  return query<Record<string, unknown>>(
    `SELECT c.id, c.name, c.name_am AS "nameAm", c.description,
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', m.id, 'name', m.name, 'nameAm', m.name_am, 'description', m.description,
                'price', m.price::float8, 'image', m.image,
                'isSignature', m.is_signature, 'arEnabled', m.ar_enabled,
                'spiceLevel', m.spice_level, 'prepMinutes', m.prep_minutes,
                'tags', m.tags, 'available', m.is_available,
                'addons', COALESCE((
                  SELECT json_agg(json_build_object('id', ad.id, 'name', ad.name, 'price', ad.price::float8) ORDER BY ad.id)
                  FROM menu_addons ad WHERE ad.menu_item_id = m.id
                ), '[]'::json)
              ) ORDER BY m.sort, m.id)
              FROM menu_items m WHERE m.category_id = c.id AND m.is_available = true
            ), '[]'::json) AS items
     FROM menu_categories c
     WHERE c.restaurant_id = $1
     ORDER BY c.sort, c.id`,
    [restaurantId],
  );
}

function tableNotice(status: string, session: unknown, autoOpen: boolean) {
  if (session) return null;
  if (status === 'inactive') return 'This table is currently out of service. Please speak to a member of staff.';
  if (status === 'cleaning') return 'This table is being prepared. A host will seat you shortly.';
  if (status === 'reserved') return 'This table is reserved. Please ask reception for the next available table.';
  if (!autoOpen) return 'Ask a waiter to open your table, then scan again to order.';
  return null;
}

publicRouter.get('/demo-table', async (req, res) => {
  const row = await one<{ tableId: number; code: string; token: string; areaName: string }>(
    `SELECT t.id AS "tableId", t.code, q.token, a.name AS "areaName"
     FROM dining_tables t
     JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
     LEFT JOIN dining_areas a ON a.id = t.area_id
     WHERE t.deleted_at IS NULL AND t.is_active = true AND t.status = 'available'
     ORDER BY CASE WHEN t.code = 'T-001' THEN 0 ELSE 1 END, t.code
     LIMIT 1`,
  );
  if (!row) {
    res.status(404).json({ error: 'No table is ready for a demo scan' });
    return;
  }
  res.json({
    tableId: row.tableId,
    code: row.code,
    areaName: row.areaName,
    scanUrl: `${appOrigin(req)}/menu/scan/${row.token}`,
    token: row.token,
  });
});

publicRouter.get('/scan/:token', async (req, res) => {
  const token = String(req.params.token);
  const qr = await resolveQr(token);
  if (!qr) {
    res.status(410).json({ error: 'This QR code is no longer active. Please ask a member of staff for a new one.' });
    return;
  }
  const restaurant = await getRestaurant(qr.restaurantId);
  if (!restaurant || !qr.isActive) {
    res.status(410).json({ error: 'This table is not available for ordering.' });
    return;
  }
  const session = await getActiveSession(qr.tableId);
  const [menu, guests] = await Promise.all([
    menuFor(qr.restaurantId),
    session
      ? query('SELECT id, name, is_lead AS "isLead" FROM table_session_guests WHERE session_id = $1 ORDER BY joined_at', [session.id])
      : Promise.resolve([]),
  ]);
  const notice = tableNotice(qr.status, session, restaurant.autoOpenSessions);
  res.json({
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      currency: restaurant.currency,
      serviceChargePct: restaurant.serviceChargePct,
      taxPct: restaurant.taxPct,
      autoAcceptOrders: restaurant.autoAcceptOrders,
      autoOpenSessions: restaurant.autoOpenSessions,
    },
    table: {
      id: qr.tableId,
      code: qr.tableCode,
      name: qr.tableName,
      capacity: qr.capacity,
      shape: qr.shape,
      status: qr.status,
      locationLabel: qr.locationLabel,
      areaName: qr.areaName,
      floorName: qr.floorName,
    },
    session: session
      ? { id: session.id, code: session.code, guestsCount: session.guestsCount, openedAt: session.openedAt }
      : null,
    guests,
    menu,
    canOrder: !notice,
    notice,
  });
});

publicRouter.post('/scan/:token/join', async (req, res) => {
  const token = String(req.params.token);
  const guestKey = String(req.body?.guestKey ?? crypto.randomUUID()).slice(0, 80);
  const guestName = String(req.body?.name ?? '').trim().slice(0, 60) || 'Guest';
  const qr = await resolveQr(token);
  if (!qr) {
    res.status(410).json({ error: 'This QR code is no longer active.' });
    return;
  }
  const restaurant = await getRestaurant(qr.restaurantId);
  if (!restaurant || !qr.isActive) {
    res.status(410).json({ error: 'This table is out of service.' });
    return;
  }

  let session = await getActiveSession(qr.tableId);
  if (!session) {
    if (['cleaning', 'reserved', 'inactive'].includes(qr.status)) {
      res.status(409).json({ error: tableNotice(qr.status, null, restaurant.autoOpenSessions) });
      return;
    }
    if (!restaurant.autoOpenSessions) {
      res.status(409).json({ error: 'Please ask a waiter to open your table before ordering.' });
      return;
    }
    let created: { id: number } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      created = await one<{ id: number }>(
        `INSERT INTO table_sessions (table_id, code, guests_count) VALUES ($1,$2,1) RETURNING id`,
        [qr.tableId, sessionCode()],
      ).catch(() => null);
    }
    if (!created) {
      res.status(500).json({ error: 'Could not open your table session. Please try again.' });
      return;
    }
    await query(
      `INSERT INTO table_session_guests (session_id, guest_key, name, is_lead) VALUES ($1,$2,$3,true)`,
      [created.id, guestKey, guestName],
    );
    await setTableStatus(qr.tableId, 'occupied', {
      action: 'session_opened',
      detail: `Guest session opened from table QR · ${qr.tableCode}`,
    });
    await logActivity(qr.tableId, 'guests_seated', `${guestName} joined via QR`, null);
    await recomputeBill(created.id);
    session = await getActiveSession(qr.tableId);
    emitTo('staff', 'notification', {
      id: `seat-${created.id}`,
      kind: 'seated',
      message: `${guestName} is seated at ${qr.tableCode}`,
      tableCode: qr.tableCode,
      createdAt: new Date().toISOString(),
    });
  }

  const existing = await one<{ id: number; name: string }>(
    'SELECT id, name FROM table_session_guests WHERE session_id = $1 AND guest_key = $2',
    [session!.id, guestKey],
  );
  let guestId = existing?.id;
  if (!existing) {
    const guest = await one<{ id: number }>(
      `INSERT INTO table_session_guests (session_id, guest_key, name) VALUES ($1,$2,$3) RETURNING id`,
      [session!.id, guestKey, guestName],
    );
    guestId = guest?.id;
    await query(
      'UPDATE table_sessions SET guests_count = (SELECT COUNT(*)::int FROM table_session_guests WHERE session_id = $1) WHERE id = $1',
      [session!.id],
    );
    const count = await one<{ count: number }>(
      'SELECT guests_count AS count FROM table_sessions WHERE id = $1',
      [session!.id],
    );
    emitTo(`table:${session!.id}`, 'guests:updated', { guestsCount: count?.count ?? 1 });
  }
  const summary = await getSessionSummary(session!.id);
  emitTo('staff', 'tables:reload', {});
  res.json({ session: summary, guestId, guestName });
});

publicRouter.post('/scan/:token/orders', async (req, res) => {
  const token = String(req.params.token);
  const ip = req.ip ?? 'local';
  if (rateLimited(`${ip}:${token}`, orderBuckets, 12, 60_000)) {
    res.status(429).json({ error: 'Too many orders submitted. Please wait a moment.' });
    return;
  }
  const qr = await resolveQr(token);
  if (!qr || !qr.isActive) {
    res.status(410).json({ error: 'This QR code is no longer active.' });
    return;
  }
  const restaurant = await getRestaurant(qr.restaurantId);
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  const sessionId = Number(req.body?.sessionId);
  const session = await sessionForToken(token, sessionId);
  if (!session || session.status !== 'open') {
    res.status(409).json({ error: 'Your table session is not open. Please scan the QR code again.' });
    return;
  }
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!rawItems.length) {
    res.status(400).json({ error: 'Your order is empty' });
    return;
  }
  if (rawItems.length > 25) {
    res.status(400).json({ error: 'Too many items in one order' });
    return;
  }

  const ids = [...new Set(rawItems.map((i: { menuItemId: unknown }) => Number(i.menuItemId)).filter(Boolean))];
  if (!ids.length) {
    res.status(400).json({ error: 'No valid menu items submitted' });
    return;
  }
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
  const menuItems = await query<{
    id: number; name: string; price: number; available: boolean; image: string;
  }>(
    `SELECT id, name, price::float8 AS price, is_available AS available, image
     FROM menu_items WHERE id IN (${placeholders})`,
    ids,
  );
  const itemMap = new Map(menuItems.map((m) => [m.id, m]));
  const addonRows = await query<{ id: number; menuItemId: number; name: string; price: number }>(
    `SELECT id, menu_item_id AS "menuItemId", name, price::float8 AS price
     FROM menu_addons WHERE menu_item_id IN (SELECT id FROM menu_items WHERE id IN (${placeholders}))`,
    ids,
  );
  const addonMap = new Map(addonRows.map((a) => [a.id, a]));

  const lines: Array<{
    menuItemId: number; name: string; qty: number; unitPrice: number; notes: string | null;
    total: number; addons: Array<{ name: string; price: number }>;
  }> = [];
  let subtotal = 0;
  for (const raw of rawItems) {
    const menuItemId = Number(raw?.menuItemId);
    const qty = Math.floor(Number(raw?.qty ?? 1));
    const item = itemMap.get(menuItemId);
    if (!item || !item.available) {
      res.status(400).json({ error: 'One of the dishes is no longer available. Please refresh the menu.' });
      return;
    }
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
      res.status(400).json({ error: 'Quantities must be between 1 and 20' });
      return;
    }
    const addonIds: number[] = Array.isArray(raw?.addonIds) ? raw.addonIds.map(Number) : [];
    const addons = addonIds
      .map((id) => addonMap.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a) && a!.menuItemId === menuItemId)
      .map((a) => ({ name: a.name, price: a.price }));
    const unitPrice = Math.round((item.price + addons.reduce((sum, a) => sum + a.price, 0)) * 100) / 100;
    const total = Math.round(unitPrice * qty * 100) / 100;
    subtotal += total;
    lines.push({
      menuItemId,
      name: item.name,
      qty,
      unitPrice,
      notes: raw?.notes ? String(raw.notes).slice(0, 200) : null,
      total,
      addons,
    });
  }

  const serviceCharge = Math.round(subtotal * (restaurant.serviceChargePct / 100) * 100) / 100;
  const tax = Math.round(subtotal * (restaurant.taxPct / 100) * 100) / 100;
  const total = Math.round((subtotal + serviceCharge + tax) * 100) / 100;
  const guestName = String(req.body?.guestName ?? '').trim().slice(0, 60) || 'Table guest';
  const orderNotes = req.body?.notes ? String(req.body.notes).slice(0, 300) : null;
  const waiter = await one<{ staffId: number }>(
    `SELECT staff_id AS "staffId" FROM waiter_assignments
     WHERE table_id = $1 AND unassigned_at IS NULL ORDER BY assigned_at DESC LIMIT 1`,
    [qr.tableId],
  );
  const status = restaurant.autoAcceptOrders ? 'accepted' : 'new';

  const order = await withTx(async (q) => {
    const created = await q<{ id: number; orderNo: number }>(
      `INSERT INTO orders
        (session_id, table_id, restaurant_id, guest_name, status, source, notes,
         subtotal, service_charge, tax, total, waiter_id)
       VALUES ($1,$2,$3,$4,$5,'qr',$6,$7,$8,$9,$10,$11)
       RETURNING id, order_no AS "orderNo"`,
      [session.id, qr.tableId, qr.restaurantId, guestName, status, orderNotes,
        subtotal, serviceCharge, tax, total, waiter?.staffId ?? null],
    );
    const orderId = created[0].id;
    for (const line of lines) {
      const inserted = await q<{ id: number }>(
        `INSERT INTO order_items (order_id, menu_item_id, name, qty, unit_price, total, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [orderId, line.menuItemId, line.name, line.qty, line.unitPrice, line.total, line.notes],
      );
      for (const addon of line.addons) {
        await q(
          'INSERT INTO order_item_addons (order_item_id, name, price) VALUES ($1,$2,$3)',
          [inserted[0].id, addon.name, addon.price],
        );
      }
    }
    await q(
      `INSERT INTO order_status_history (order_id, status, note, changed_by)
       VALUES ($1,'new','Order submitted from table QR','Guest')`,
      [orderId],
    );
    if (status === 'accepted') {
      await q(
        `INSERT INTO order_status_history (order_id, status, note, changed_by)
         VALUES ($1,'accepted','Auto-accepted by restaurant settings','Nile system')`,
        [orderId],
      );
    }
    return { id: orderId, orderNo: created[0].orderNo };
  });

  const bill = await recomputeBill(session.id);
  await logActivity(qr.tableId, 'order_placed', `Order #${order.orderNo} placed from QR · ${total.toFixed(2)} ETB`, null);

  const payload = await broadcastOrder(order.id, 'order:created');
  emitTo('staff', 'notification', {
    id: `order-${order.id}`,
    kind: 'new-order',
    message: `New order #${order.orderNo} · ${qr.tableCode} · ${total.toFixed(0)} ETB`,
    orderId: order.id,
    tableCode: qr.tableCode,
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({
    order: {
      id: order.id,
      orderNo: order.orderNo,
      displayNo: `#${order.orderNo}`,
      status,
      total,
      sessionId: session.id,
      tableCode: qr.tableCode,
    },
    bill,
    realtime: payload,
  });
});

publicRouter.get('/scan/:token/session/:sessionId', async (req, res) => {
  const token = String(req.params.token);
  const session = await sessionForToken(token, Number(req.params.sessionId));
  if (!session) {
    res.status(403).json({ error: 'This order session does not match this QR code.' });
    return;
  }
  const summary = await getSessionSummary(session.id);
  res.json({ session: summary });
});

publicRouter.get('/scan/:token/track/:orderNumber', async (req, res) => {
  const token = String(req.params.token);
  const orderNumber = Number(String(req.params.orderNumber).replace('#', ''));
  const qr = await resolveQr(token);
  if (!qr) {
    res.status(410).json({ error: 'This QR code is no longer active.' });
    return;
  }
  const order = await one<Record<string, unknown>>(
    `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status,
            o.total::float8 AS total, o.created_at AS "createdAt", o.payment_status AS "paymentStatus",
            o.guest_name AS "guestName", o.session_id AS "sessionId", t.code AS "tableCode",
            a.name AS "areaName", o.notes
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     WHERE o.order_no = $1 AND o.table_id = $2`,
    [orderNumber, qr.tableId],
  );
  if (!order) {
    res.status(404).json({ error: 'Order not found for this table' });
    return;
  }
  const items = await query<Record<string, unknown>>(
    `SELECT name, qty, unit_price::float8 AS "unitPrice", total::float8 AS total, notes,
            COALESCE((SELECT json_agg(json_build_object('name', oa.name, 'price', oa.price::float8))
                      FROM order_item_addons oa WHERE oa.order_item_id = oi.id), '[]'::json) AS addons
     FROM order_items oi WHERE order_id = $1 ORDER BY id`,
    [order.id],
  );
  const history = await query(
    `SELECT status, note, created_at AS "createdAt" FROM order_status_history
     WHERE order_id = $1 ORDER BY created_at, id`,
    [order.id],
  );
  const bill = await getBillForSession(Number(order.sessionId));
  res.json({ order: { ...order, items, history }, bill });
});

publicRouter.post('/scan/:token/call', async (req, res) => {
  const token = String(req.params.token);
  const qr = await resolveQr(token);
  if (!qr) {
    res.status(410).json({ error: 'This QR code is no longer active.' });
    return;
  }
  const ip = req.ip ?? 'local';
  if (rateLimited(`${ip}:${token}:call`, callBuckets, 1, 20_000)) {
    res.status(429).json({ error: 'A team member is already on the way.' });
    return;
  }
  const sessionId = Number(req.body?.sessionId);
  const session = await sessionForToken(token, sessionId);
  if (!session) {
    res.status(403).json({ error: 'Session does not match this table' });
    return;
  }
  const type = req.body?.type === 'bill' ? 'bill' : 'waiter';
  emitTo('staff', 'notification', {
    id: `call-${sessionId}-${Date.now()}`,
    kind: 'call',
    callType: type,
    message: `${qr.tableCode} is requesting ${type === 'bill' ? 'the bill' : 'a waiter'}`,
    tableCode: qr.tableCode,
    tableId: qr.tableId,
    createdAt: new Date().toISOString(),
  });
  res.json({ ok: true });
});

publicRouter.get('/menu/:slug', async (req, res) => {
  const restaurant = await one<{ id: number; name: string; slug: string; currency: string; address: string }>(
    'SELECT id, name, slug, currency, address FROM restaurants WHERE slug = $1',
    [String(req.params.slug)],
  );
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  const menu = await menuFor(restaurant.id);
  res.json({ restaurant, menu });
});
