import { Router } from 'express';
import type { AuthedRequest } from '../auth.js';
import { findStaffByEmail, hashPassword, requireRoles } from '../auth.js';
import { one, query } from '../db.js';
import { emitTo } from '../realtime.js';
import { getRestaurant, logActivity } from '../domain.js';

export const miscRouter = Router();

miscRouter.get('/dashboard', async (_req, res) => {
  const [statusRows, orderRows, sessionRow, revenueRow, recentOrders, topItems, tables, activity, reservations] =
    await Promise.all([
      query<{ status: string; count: number }>(
        'SELECT status, COUNT(*)::int AS count FROM dining_tables WHERE deleted_at IS NULL AND is_active = true GROUP BY status',
      ),
      query<{ status: string; count: number }>(
        `SELECT status, COUNT(*)::int AS count FROM orders
         WHERE created_at >= current_date AND status IN ('new','accepted','preparing','ready','served')
         GROUP BY status`,
      ),
      one<{ count: number }>("SELECT COUNT(*)::int AS count FROM table_sessions WHERE status = 'open'"),
      one<{ revenue: number; orders: number }>(
        `SELECT COALESCE((SELECT SUM(amount)::float8 FROM payments WHERE created_at >= current_date),0) AS revenue,
                (SELECT COUNT(*)::int FROM orders WHERE created_at >= current_date AND status <> 'cancelled') AS orders`,
      ),
      query(
        `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status,
                o.total::float8 AS total, o.created_at AS "createdAt", t.code AS "tableCode",
                a.name AS "areaName", o.payment_status AS "paymentStatus"
         FROM orders o JOIN dining_tables t ON t.id = o.table_id
         LEFT JOIN dining_areas a ON a.id = t.area_id
         ORDER BY o.created_at DESC LIMIT 8`,
      ),
      query(
        `SELECT oi.name, SUM(oi.qty)::int AS qty, SUM(oi.total)::float8 AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.created_at >= current_date AND o.status <> 'cancelled'
         GROUP BY oi.name ORDER BY qty DESC LIMIT 5`,
      ),
      query(
        `SELECT t.id, t.code, t.status, t.area_id AS "areaId", a.name AS "areaName",
                s.id AS "sessionId", s.guests_count AS "guestsCount",
                (SELECT COALESCE(SUM(o.total),0)::float8 FROM orders o WHERE o.session_id = s.id AND o.status <> 'cancelled') AS "billTotal"
         FROM dining_tables t
         LEFT JOIN dining_areas a ON a.id = t.area_id
         LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'open'
         WHERE t.deleted_at IS NULL AND t.is_active = true ORDER BY t.code`,
      ),
      query(
        `SELECT l.id, l.action, l.detail, l.created_at AS "createdAt", t.code AS "tableCode"
         FROM table_activity_logs l JOIN dining_tables t ON t.id = l.table_id
         ORDER BY l.created_at DESC LIMIT 8`,
      ),
      query(
        `SELECT r.id, r.customer_name AS "customerName", r.guests, r.reserved_at AS "reservedAt",
                t.code AS "tableCode", r.status
         FROM table_reservations r JOIN dining_tables t ON t.id = r.table_id
         WHERE r.status = 'confirmed' AND r.reserved_at >= now() - interval '30 minutes'
         ORDER BY r.reserved_at LIMIT 5`,
      ),
    ]);

  const statusMap = Object.fromEntries(statusRows.map((s) => [s.status, s.count]));
  const orderMap = Object.fromEntries(orderRows.map((s) => [s.status, s.count]));
  const salesToday = await one<{ sales: number }>(
    "SELECT COALESCE(SUM(total),0)::float8 AS sales FROM orders WHERE created_at >= current_date AND status <> 'cancelled'",
  );
  const revenue = revenueRow?.revenue ?? 0;
  const orders = revenueRow?.orders ?? 0;
  res.json({
    tables: {
      available: statusMap.available ?? 0,
      occupied: statusMap.occupied ?? 0,
      reserved: statusMap.reserved ?? 0,
      cleaning: statusMap.cleaning ?? 0,
      inactive: statusMap.inactive ?? 0,
      total: statusRows.reduce((sum, s) => sum + s.count, 0),
    },
    orders: {
      new: orderMap.new ?? 0,
      accepted: orderMap.accepted ?? 0,
      preparing: orderMap.preparing ?? 0,
      ready: orderMap.ready ?? 0,
      served: orderMap.served ?? 0,
    },
    openSessions: sessionRow?.count ?? 0,
    today: {
      revenue: Math.round(revenue * 100) / 100,
      sales: Math.round(Number(salesToday?.sales ?? 0) * 100) / 100,
      orders,
      avgTicket: orders ? Math.round((Number(salesToday?.sales ?? 0) / orders) * 100) / 100 : 0,
    },
    recentOrders,
    topItems,
    tablesMap: tables,
    activity,
    reservations,
  });
});

miscRouter.get('/reports/summary', requireRoles('super_admin', 'manager', 'auditor'), async (req, res) => {
  const range = String(req.query.range ?? 'today');
  const start = range === '30d' ? "current_date - interval '29 days'"
    : range === '7d' ? "current_date - interval '6 days'"
      : 'current_date';
  const [totals, byTable, topItems, byWaiter, hourly, methods, cancelled, reservations] = await Promise.all([
    one<{ orders: number; sales: number; service: number; tax: number; guests: number }>(
      `SELECT COUNT(*)::int AS orders, COALESCE(SUM(o.total),0)::float8 AS sales,
              COALESCE(SUM(o.service_charge),0)::float8 AS service,
              COALESCE(SUM(o.tax),0)::float8 AS tax,
              COALESCE(SUM((SELECT COALESCE(SUM(s.guests_count),0) FROM table_sessions s WHERE s.id = o.session_id)),0)::int AS guests
       FROM orders o WHERE o.status <> 'cancelled' AND o.created_at >= ${start}`,
    ),
    query(
      `SELECT t.code AS "tableCode", a.name AS "areaName", COUNT(*)::int AS orders,
              COALESCE(SUM(o.total),0)::float8 AS sales
       FROM orders o JOIN dining_tables t ON t.id = o.table_id
       LEFT JOIN dining_areas a ON a.id = t.area_id
       WHERE o.status <> 'cancelled' AND o.created_at >= ${start}
       GROUP BY t.code, a.name ORDER BY sales DESC LIMIT 8`,
    ),
    query(
      `SELECT oi.name, SUM(oi.qty)::int AS qty, SUM(oi.total)::float8 AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'cancelled' AND o.created_at >= ${start}
       GROUP BY oi.name ORDER BY qty DESC LIMIT 8`,
    ),
    query(
      `SELECT COALESCE(w.name,'Unassigned') AS waiter, COUNT(*)::int AS orders,
              COALESCE(SUM(o.total),0)::float8 AS sales
       FROM orders o LEFT JOIN staff w ON w.id = o.waiter_id
       WHERE o.status <> 'cancelled' AND o.created_at >= ${start}
       GROUP BY w.name ORDER BY sales DESC`,
    ),
    query(
      `SELECT EXTRACT(HOUR FROM o.created_at)::int AS hour, COUNT(*)::int AS orders,
              COALESCE(SUM(o.total),0)::float8 AS sales
       FROM orders o WHERE o.status <> 'cancelled' AND o.created_at >= ${start}
       GROUP BY 1 ORDER BY 1`,
    ),
    query(
      `SELECT method, COUNT(*)::int AS count, COALESCE(SUM(amount),0)::float8 AS amount
       FROM payments WHERE created_at >= ${start} GROUP BY method ORDER BY amount DESC`,
    ),
    one<{ count: number; value: number }>(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::float8 AS value
       FROM orders WHERE status = 'cancelled' AND created_at >= ${start}`,
    ),
    one<{ count: number; cancelled: number; noShow: number }>(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              COUNT(*) FILTER (WHERE status = 'no_show')::int AS "noShow"
       FROM table_reservations WHERE reserved_at >= ${start}`,
    ),
  ]);
  const paymentsTotal = await one<{ amount: number }>(
    `SELECT COALESCE(SUM(amount),0)::float8 AS amount FROM payments WHERE created_at >= ${start}`,
  );
  const tableTurns = await one<{ sessions: number }>(
    `SELECT COUNT(*)::int AS sessions FROM table_sessions WHERE opened_at >= ${start}`,
  );
  res.json({
    range,
    totals: {
      ...totals,
      sales: Math.round(Number(totals?.sales ?? 0) * 100) / 100,
      avgTicket: totals?.orders ? Math.round((Number(totals.sales) / totals.orders) * 100) / 100 : 0,
      payments: Math.round(Number(paymentsTotal?.amount ?? 0) * 100) / 100,
      cancelled: cancelled?.count ?? 0,
      cancelledValue: Math.round(Number(cancelled?.value ?? 0) * 100) / 100,
      sessions: tableTurns?.sessions ?? 0,
    },
    byTable,
    topItems,
    byWaiter,
    hourly,
    methods,
    reservations: reservations ?? { count: 0, cancelled: 0, noShow: 0 },
  });
});

miscRouter.get('/settings', async (_req, res) => {
  const restaurant = await getRestaurant(1);
  const staff = await query(
    `SELECT id, name, email, role, is_active AS "isActive" FROM staff ORDER BY
     CASE role WHEN 'super_admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'chef' THEN 3 WHEN 'waiter' THEN 4 WHEN 'cashier' THEN 5 ELSE 6 END`,
  );
  res.json({ restaurant, staff });
});

miscRouter.patch('/settings', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const b = req.body ?? {};
  const service = Math.min(30, Math.max(0, Number(b.serviceChargePct ?? 10)));
  const tax = Math.min(30, Math.max(0, Number(b.taxPct ?? 0)));
  await query(
    `UPDATE restaurants SET service_charge_pct = $1, tax_pct = $2,
       auto_accept_orders = $3, auto_open_sessions = $4, name = COALESCE($5, name),
       address = COALESCE($6, address), phone = COALESCE($7, phone)
     WHERE id = 1`,
    [service, tax, b.autoAcceptOrders === true, b.autoOpenSessions === true,
      b.name ?? null, b.address ?? null, b.phone ?? null],
  );
  await logActivity(
    (await one<{ id: number }>('SELECT id FROM dining_tables ORDER BY id LIMIT 1'))?.id ?? 1,
    'settings_updated',
    `Restaurant settings updated by ${staff.name}`,
    staff.id,
  );
  emitTo('staff', 'settings:updated', {});
  const restaurant = await getRestaurant(1);
  res.json({ restaurant });
});

miscRouter.get('/staff', async (_req, res) => {
  const staff = await query(
    `SELECT id, name, email, role, is_active AS "isActive", created_at AS "createdAt" FROM staff
     WHERE role IN ('waiter','manager','super_admin','cashier','receptionist','chef') ORDER BY name`,
  );
  res.json({ staff });
});

const assignableRoles = new Set(['manager', 'receptionist', 'waiter', 'cashier', 'chef', 'auditor']);

miscRouter.post('/staff', requireRoles('super_admin', 'manager'), async (req, res) => {
  const actor = (req as unknown as AuthedRequest).staff;
  const b = req.body ?? {};
  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const role = String(b.role ?? '');
  const password = String(b.password ?? '');

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Full name must be between 2 and 80 characters' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 160) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  if (!assignableRoles.has(role)) {
    res.status(400).json({ error: 'Choose a valid staff role' });
    return;
  }
  if (role === 'manager' && actor.role !== 'super_admin') {
    res.status(403).json({ error: 'Only a super admin can add another manager' });
    return;
  }
  if (password.length < 6 || password.length > 72) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  if (await findStaffByEmail(email)) {
    res.status(409).json({ error: 'A staff account with that email already exists' });
    return;
  }

  const staff = await one(
    `INSERT INTO staff (restaurant_id, name, email, password_hash, role)
     VALUES (1, $1, $2, $3, $4)
     RETURNING id, name, email, role, is_active AS "isActive", created_at AS "createdAt"`,
    [name, email, hashPassword(password), role],
  );
  emitTo('staff', 'staff:updated', { staffId: staff?.id });
  res.status(201).json({ staff });
});

miscRouter.get('/activity', async (_req, res) => {
  const activity = await query(
    `SELECT l.id, l.action, l.detail, l.created_at AS "createdAt", t.code AS "tableCode", s.name AS "staffName"
     FROM table_activity_logs l JOIN dining_tables t ON t.id = l.table_id
     LEFT JOIN staff s ON s.id = l.staff_id
     ORDER BY l.created_at DESC LIMIT 50`,
  );
  res.json({ activity });
});
