import { one, query } from './db.js';
import { emitTo } from './realtime.js';

export type SessionRow = {
  id: number;
  tableId: number;
  code: string;
  status: 'open' | 'closed';
  guestsCount: number;
  openedAt: string;
  openedBy: number | null;
  tableCode?: string;
};

export type Bill = {
  id: number | null;
  sessionId: number;
  tableId: number;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  orderCount: number;
  payments: Array<Record<string, unknown>>;
  items: Array<{ name: string; qty: number; unitPrice: number; total: number }>;
};

export const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export async function getRestaurant(restaurantId: number) {
  return one<{
    id: number; name: string; slug: string; currency: string; address: string; phone: string;
    serviceChargePct: number; taxPct: number; autoAcceptOrders: boolean;
    autoOpenSessions: boolean; menuLanguages: string;
  }>(
    `SELECT id, name, slug, currency, address, phone,
            service_charge_pct::float8 AS "serviceChargePct",
            tax_pct::float8 AS "taxPct",
            auto_accept_orders AS "autoAcceptOrders",
            auto_open_sessions AS "autoOpenSessions",
            menu_languages AS "menuLanguages"
     FROM restaurants WHERE id = $1`,
    [restaurantId],
  );
}

export async function getActiveSession(tableId: number) {
  return one<SessionRow>(
    `SELECT s.id, s.table_id AS "tableId", s.code, s.status, s.guests_count AS "guestsCount",
            s.opened_at AS "openedAt", s.opened_by AS "openedBy", t.code AS "tableCode"
     FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id
     WHERE s.table_id = $1 AND s.status = 'open'`,
    [tableId],
  );
}

export async function getBillForSession(sessionId: number): Promise<Bill | null> {
  const session = await one<{ tableId: number; table_id: number }>(
    'SELECT table_id AS "tableId", table_id FROM table_sessions WHERE id = $1',
    [sessionId],
  );
  if (!session) return null;
  const totals = await one<{
    subtotal: number; serviceCharge: number; tax: number; discount: number; total: number; orderCount: number;
  }>(
    `SELECT COALESCE(SUM(subtotal),0)::float8 AS subtotal,
            COALESCE(SUM(service_charge),0)::float8 AS "serviceCharge",
            COALESCE(SUM(tax),0)::float8 AS tax,
            COALESCE(SUM(discount),0)::float8 AS discount,
            COALESCE(SUM(total),0)::float8 AS total,
            COUNT(*)::int AS "orderCount"
     FROM orders WHERE session_id = $1 AND status <> 'cancelled'`,
    [sessionId],
  );
  const payments = await query<Record<string, unknown>>(
    `SELECT id, amount::float8 AS amount, method, reference, created_at AS "createdAt"
     FROM payments WHERE session_id = $1 ORDER BY created_at DESC`,
    [sessionId],
  );
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const billRow = await one<{ id: number; status: string }>(
    'SELECT id, status FROM table_bills WHERE session_id = $1',
    [sessionId],
  );
  const items = await query<{ name: string; qty: number; unitPrice: number; total: number }>(
    `SELECT oi.name, SUM(oi.qty)::int AS qty,
            MAX(oi.unit_price)::float8 AS "unitPrice",
            SUM(oi.total)::float8 AS total
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.session_id = $1 AND o.status <> 'cancelled'
     GROUP BY oi.name ORDER BY MIN(oi.id)`,
    [sessionId],
  );
  const total = money(totals?.total);
  return {
    id: billRow?.id ?? null,
    sessionId,
    tableId: session.tableId,
    subtotal: money(totals?.subtotal),
    serviceCharge: money(totals?.serviceCharge),
    tax: money(totals?.tax),
    discount: money(totals?.discount),
    total,
    paid: money(paid),
    balance: money(total - paid),
    status: billRow?.status ?? 'open',
    orderCount: totals?.orderCount ?? 0,
    payments,
    items,
  };
}

export async function recomputeBill(sessionId: number) {
  const bill = await getBillForSession(sessionId);
  if (!bill) return null;
  await query(
    `INSERT INTO table_bills (session_id, table_id, subtotal, service_charge, tax, discount, total, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (session_id) DO UPDATE SET
       subtotal = EXCLUDED.subtotal,
       service_charge = EXCLUDED.service_charge,
       tax = EXCLUDED.tax,
       discount = EXCLUDED.discount,
       total = EXCLUDED.total,
       status = EXCLUDED.status`,
    [sessionId, bill.tableId, bill.subtotal, bill.serviceCharge, bill.tax, bill.discount, bill.total,
      bill.balance <= 0 && bill.total > 0 ? 'settled' : 'open'],
  );
  const updated = await getBillForSession(sessionId);
  if (!updated) return null;
  emitTo(['staff', `table:${sessionId}`], 'bill:updated', updated);
  return updated;
}

export async function setTableStatus(
  tableId: number,
  status: string,
  options: { staffId?: number; action?: string; detail?: string } = {},
) {
  await query('UPDATE dining_tables SET status = $2 WHERE id = $1', [tableId, status]);
  const table = await one<{ id: number; code: string; status: string; areaId: number }>(
    'SELECT id, code, status, area_id AS "areaId" FROM dining_tables WHERE id = $1',
    [tableId],
  );
  if (options.action) {
    await logActivity(tableId, options.action, options.detail ?? `Table set to ${status}`, options.staffId);
  }
  emitTo('staff', 'table:updated', table);
  return table;
}

export async function logActivity(
  tableId: number,
  action: string,
  detail: string,
  staffId?: number | null,
) {
  await query(
    'INSERT INTO table_activity_logs (table_id, action, detail, staff_id) VALUES ($1,$2,$3,$4)',
    [tableId, action, detail, staffId ?? null],
  );
}

export type OrderEventPayload = {
  id: number;
  orderNo: number;
  status: string;
  tableId: number;
  tableCode: string;
  areaName: string | null;
  guestName: string | null;
  total: number;
  itemCount: number;
  createdAt: string;
  paymentStatus: string;
  source: string;
  displayNo: string;
};

export async function fetchOrderEvent(orderId: number): Promise<OrderEventPayload | null> {
  return one<OrderEventPayload>(
    `SELECT o.id, o.order_no AS "orderNo", o.status, o.table_id AS "tableId",
            t.code AS "tableCode", a.name AS "areaName", o.guest_name AS "guestName",
            o.total::float8 AS total, o.created_at AS "createdAt",
            o.payment_status AS "paymentStatus", o.source,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
            '#' || o.order_no AS "displayNo"
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     WHERE o.id = $1`,
    [orderId],
  );
}

export async function broadcastOrder(orderId: number, event: 'order:created' | 'order:status') {
  const payload = await fetchOrderEvent(orderId);
  if (!payload) return null;
  const order = await one<{ sessionId: number }>('SELECT session_id AS "sessionId" FROM orders WHERE id = $1', [orderId]);
  const rooms = ['staff', 'kitchen', 'service'];
  if (order) rooms.push(`table:${order.sessionId}`);
  emitTo(rooms, event, payload);
  return payload;
}

export async function orderDetail(orderId: number) {
  const order = await one<Record<string, unknown>>(
    `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status,
            o.source, o.notes, o.guest_name AS "guestName", o.guest_room AS "guestRoom",
            o.subtotal::float8 AS subtotal, o.service_charge::float8 AS "serviceCharge",
            o.tax::float8 AS tax, o.discount::float8 AS discount, o.total::float8 AS total,
            o.payment_status AS "paymentStatus", o.cancel_reason AS "cancelReason",
            o.created_at AS "createdAt", o.updated_at AS "updatedAt",
            o.session_id AS "sessionId", o.table_id AS "tableId",
            t.code AS "tableCode", t.capacity, a.name AS "areaName", f.name AS "floorName",
            s.code AS "sessionCode", s.opened_at AS "sessionOpenedAt",
            w.name AS "waiterName", w.id AS "waiterId",
            q.token AS "qrToken"
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN dining_floors f ON f.id = t.floor_id
     LEFT JOIN table_sessions s ON s.id = o.session_id
     LEFT JOIN staff w ON w.id = o.waiter_id
     LEFT JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
     WHERE o.id = $1`,
    [orderId],
  );
  if (!order) return null;
  const items = await query<Record<string, unknown>>(
    `SELECT oi.id, oi.name, oi.qty, oi.unit_price::float8 AS "unitPrice",
            oi.total::float8 AS total, oi.notes,
            COALESCE((SELECT json_agg(json_build_object('name', oa.name, 'price', oa.price::float8))
                      FROM order_item_addons oa WHERE oa.order_item_id = oi.id), '[]'::json) AS addons
     FROM order_items oi WHERE oi.order_id = $1 ORDER BY oi.id`,
    [orderId],
  );
  const history = await query<Record<string, unknown>>(
    `SELECT status, note, changed_by AS "changedBy", created_at AS "createdAt"
     FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id`,
    [orderId],
  );
  const staff = await query<{ id: number; name: string; role: string }>(
    "SELECT id, name, role FROM staff WHERE role IN ('waiter','manager','super_admin') AND is_active = true ORDER BY name",
  );
  return { ...order, items, history, waiters: staff };
}

export async function getSessionSummary(sessionId: number) {
  const session = await one<Record<string, unknown>>(
    `SELECT s.id, s.code, s.status, s.guests_count AS "guestsCount", s.opened_at AS "openedAt",
            s.closed_at AS "closedAt", t.id AS "tableId", t.code AS "tableCode",
            t.capacity, a.name AS "areaName", f.name AS "floorName",
            w.name AS "openedByName"
     FROM table_sessions s
     JOIN dining_tables t ON t.id = s.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN dining_floors f ON f.id = t.floor_id
     LEFT JOIN staff w ON w.id = s.opened_by
     WHERE s.id = $1`,
    [sessionId],
  );
  if (!session) return null;
  const guests = await query<Record<string, unknown>>(
    `SELECT id, name, is_lead AS "isLead", joined_at AS "joinedAt"
     FROM table_session_guests WHERE session_id = $1 ORDER BY joined_at`,
    [sessionId],
  );
  const orders = await query<Record<string, unknown>>(
    `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status,
            o.total::float8 AS total, o.payment_status AS "paymentStatus",
            o.created_at AS "createdAt", o.guest_name AS "guestName",
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount"
     FROM orders o WHERE o.session_id = $1 ORDER BY o.created_at`,
    [sessionId],
  );
  const bill = await getBillForSession(sessionId);
  const qr = await one<{ token: string }>(
    `SELECT q.token FROM table_qr_codes q WHERE q.table_id = $1 AND q.status = 'active'`,
    [Number(session.tableId)],
  );
  return { ...session, guests, orders, bill, qrToken: qr?.token ?? null };
}
