import { Router } from 'express';
import type { AuthedRequest } from '../auth.js';
import { requireRoles } from '../auth.js';
import { one, query } from '../db.js';
import { emitTo } from '../realtime.js';
import { broadcastOrder, logActivity, orderDetail, recomputeBill } from '../domain.js';

export const ordersRouter = Router();

const transitions: Record<string, string[]> = {
  new: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served'],
  served: ['completed'],
  completed: [],
  cancelled: [],
};

const kitchenStatuses = ['new', 'accepted', 'preparing', 'ready'];

ordersRouter.get('/orders', async (req, res) => {
  const clauses = ['TRUE'];
  const params: unknown[] = [];
  const status = String(req.query.status ?? '');
  if (status === 'active') {
    clauses.push("o.status NOT IN ('completed','cancelled')");
  } else if (status && status !== 'all') {
    params.push(status);
    clauses.push(`o.status = $${params.length}`);
  }
  if (req.query.tableId) {
    params.push(Number(req.query.tableId));
    clauses.push(`o.table_id = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q)}%`);
    clauses.push(`(CAST(o.order_no AS text) ILIKE $${params.length} OR t.code ILIKE $${params.length} OR COALESCE(o.guest_name,'') ILIKE $${params.length})`);
  }
  if (req.query.history !== 'true') clauses.push('o.created_at >= current_date');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 60)));
  params.push(limit);
  const orders = await query<Record<string, unknown>>(
    `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status, o.source,
            o.total::float8 AS total, o.subtotal::float8 AS subtotal, o.service_charge::float8 AS "serviceCharge",
            o.tax::float8 AS tax, o.payment_status AS "paymentStatus", o.guest_name AS "guestName",
            o.created_at AS "createdAt", o.notes, o.table_id AS "tableId", t.code AS "tableCode",
            a.name AS "areaName", s.code AS "sessionCode", s.id AS "sessionId",
            w.name AS "waiterName",
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
            (SELECT string_agg(oi.name || ' × ' || oi.qty, ', ') FROM order_items oi WHERE oi.order_id = o.id) AS "itemsSummary"
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN table_sessions s ON s.id = o.session_id
     LEFT JOIN staff w ON w.id = o.waiter_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY o.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  const counts = await query<{ status: string; count: number }>(
    `SELECT status, COUNT(*)::int AS count FROM orders
     WHERE created_at >= current_date AND status IN ('new','accepted','preparing','ready','served')
     GROUP BY status`,
  );
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c.count]));
  res.json({
    orders,
    counts: {
      new: countMap.new ?? 0,
      accepted: countMap.accepted ?? 0,
      preparing: countMap.preparing ?? 0,
      ready: countMap.ready ?? 0,
      served: countMap.served ?? 0,
      active: kitchenStatuses.reduce((sum, s) => sum + (countMap[s] ?? 0), 0),
    },
  });
});

ordersRouter.get('/orders/kitchen', async (_req, res) => {
  const orders = await query<Record<string, unknown>>(
    `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status,
            o.notes, o.guest_name AS "guestName", o.created_at AS "createdAt",
            t.code AS "tableCode", t.capacity AS "seats", a.name AS "areaName", w.name AS "waiterName",
            s.guests_count AS "guests",
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', oi.id, 'name', oi.name, 'qty', oi.qty, 'notes', oi.notes,
                'addons', COALESCE((
                  SELECT json_agg(json_build_object('name', oa.name, 'price', oa.price::float8))
                  FROM order_item_addons oa WHERE oa.order_item_id = oi.id
                ), '[]'::json)
              ) ORDER BY oi.id)
              FROM order_items oi WHERE oi.order_id = o.id
            ), '[]'::json) AS items
     FROM orders o
     JOIN dining_tables t ON t.id = o.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN staff w ON w.id = o.waiter_id
     LEFT JOIN table_sessions s ON s.id = o.session_id
     WHERE o.status IN ('new','accepted','preparing','ready')
     ORDER BY o.created_at`,
  );
  res.json({ orders });
});

ordersRouter.get('/orders/:id', async (req, res) => {
  const order = await orderDetail(Number(req.params.id));
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order });
});

ordersRouter.patch('/orders/:id/status', async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const next = String(req.body?.status ?? '');
  const order = await one<{ status: string; orderNo: number; tableId: number; sessionId: number; tableCode: string }>(
    `SELECT o.status, o.order_no AS "orderNo", o.table_id AS "tableId", o.session_id AS "sessionId", t.code AS "tableCode"
     FROM orders o JOIN dining_tables t ON t.id = o.table_id WHERE o.id = $1`,
    [id],
  );
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (next === 'cancelled') {
    res.status(400).json({ error: 'Use the cancellation action with a reason' });
    return;
  }
  if (!transitions[order.status]?.includes(next)) {
    res.status(409).json({ error: `Cannot move order #${order.orderNo} from ${order.status} to ${next}` });
    return;
  }
  await query('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [id, next]);
  await query(
    `INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1,$2,$3,$4)`,
    [id, next, `Marked ${next} by ${staff.name}`, staff.name],
  );
  const payload = await broadcastOrder(id, 'order:status');
  const labels: Record<string, string> = {
    accepted: 'accepted', preparing: 'in the kitchen', ready: 'ready to serve',
    served: 'served', completed: 'completed',
  };
  emitTo('staff', 'notification', {
    id: `order-${id}-${next}`,
    kind: next === 'ready' ? 'ready' : 'order',
    message: `Order #${order.orderNo} · ${order.tableCode} is ${labels[next] ?? next}`,
    orderId: id,
    tableCode: order.tableCode,
    createdAt: new Date().toISOString(),
  });
  res.json({ order: payload });
});

ordersRouter.post('/orders/:id/cancel', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 3) {
    res.status(400).json({ error: 'A cancellation reason is required' });
    return;
  }
  const order = await one<{ status: string; orderNo: number; tableCode: string; sessionId: number }>(
    `SELECT o.status, o.order_no AS "orderNo", t.code AS "tableCode", o.session_id AS "sessionId"
     FROM orders o JOIN dining_tables t ON t.id = o.table_id WHERE o.id = $1`,
    [id],
  );
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (['completed', 'cancelled'].includes(order.status)) {
    res.status(409).json({ error: 'This order can no longer be cancelled' });
    return;
  }
  await query('UPDATE orders SET status = $2, cancel_reason = $3, updated_at = now() WHERE id = $1', [id, 'cancelled', reason]);
  await query(
    `INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1,$2,$3,$4)`,
    [id, 'cancelled', `Cancelled: ${reason}`, staff.name],
  );
  await recomputeBill(order.sessionId);
  await broadcastOrder(id, 'order:status');
  await logActivity(
    (await one<{ tableId: number }>('SELECT table_id AS "tableId" FROM orders WHERE id = $1', [id]))!.tableId,
    'order_cancelled',
    `Order #${order.orderNo} cancelled by ${staff.name}: ${reason}`,
    staff.id,
  );
  emitTo('staff', 'notification', {
    id: `cancel-${id}`,
    kind: 'cancel',
    message: `Order #${order.orderNo} · ${order.tableCode} cancelled`,
    orderId: id,
    tableCode: order.tableCode,
    createdAt: new Date().toISOString(),
  });
  res.json({ ok: true });
});

ordersRouter.post('/orders/:id/assign-waiter', requireRoles('super_admin', 'manager', 'receptionist'), async (req, res) => {
  const id = Number(req.params.id);
  const staffId = Number(req.body?.staffId);
  const waiter = await one<{ name: string }>(
    "SELECT name FROM staff WHERE id = $1 AND role IN ('waiter','manager','super_admin') AND is_active = true",
    [staffId],
  );
  if (!waiter) {
    res.status(400).json({ error: 'Select an active waiter' });
    return;
  }
  await query('UPDATE orders SET waiter_id = $2, updated_at = now() WHERE id = $1', [id, staffId]);
  await query(
    `INSERT INTO order_status_history (order_id, status, note, changed_by)
     SELECT id, status, $2, 'Nile staff' FROM orders WHERE id = $1`,
    [id, `${waiter.name} assigned to this order`],
  );
  const order = await orderDetail(id);
  emitTo('staff', 'order:updated', { id });
  res.json({ order });
});
