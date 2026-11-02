import crypto from 'node:crypto';
import { Router } from 'express';
import type { AuthedRequest } from '../auth.js';
import { requireRoles } from '../auth.js';
import { one, query } from '../db.js';
import { emitTo } from '../realtime.js';
import {
  getActiveSession, getBillForSession, getSessionSummary, logActivity, recomputeBill, setTableStatus,
} from '../domain.js';

export const sessionsRouter = Router();

const sessionCode = () => `S-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

sessionsRouter.get('/sessions', async (req, res) => {
  const status = String(req.query.status ?? 'open');
  const rows = await query<Record<string, unknown>>(
    `SELECT s.id, s.code, s.status, s.guests_count AS "guestsCount",
            s.opened_at AS "openedAt", s.closed_at AS "closedAt",
            t.id AS "tableId", t.code AS "tableCode", t.capacity,
            a.name AS "areaName", w.name AS "openedByName",
            (SELECT COUNT(*)::int FROM orders o WHERE o.session_id = s.id AND o.status <> 'cancelled') AS "orderCount",
            (SELECT COALESCE(SUM(o.total),0)::float8 FROM orders o WHERE o.session_id = s.id AND o.status <> 'cancelled') AS "total",
            (SELECT COALESCE(SUM(p.amount),0)::float8 FROM payments p WHERE p.session_id = s.id) AS paid,
            (SELECT COUNT(*)::int FROM table_session_guests g WHERE g.session_id = s.id) AS "guestRows"
     FROM table_sessions s
     JOIN dining_tables t ON t.id = s.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN staff w ON w.id = s.opened_by
     WHERE ($1 = 'all' OR s.status = $1)
     ORDER BY s.opened_at DESC
     LIMIT 60`,
    [status],
  );
  res.json({
    sessions: rows.map((r) => ({ ...r, balance: Math.round((Number(r.total) - Number(r.paid)) * 100) / 100 })),
  });
});

sessionsRouter.get('/sessions/:id', async (req, res) => {
  const session = await getSessionSummary(Number(req.params.id));
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ session });
});

sessionsRouter.post(
  '/sessions/tables/:id/open',
  requireRoles('super_admin', 'manager', 'waiter', 'receptionist'),
  async (req, res) => {
    const staff = (req as unknown as AuthedRequest).staff;
    const tableId = Number(req.params.id);
    const table = await one<{ id: number; code: string; status: string; isActive: boolean; deletedAt: string }>(
      'SELECT id, code, status, is_active AS "isActive", deleted_at AS "deletedAt" FROM dining_tables WHERE id = $1',
      [tableId],
    );
    if (!table || table.deletedAt) {
      res.status(404).json({ error: 'Table not found' });
      return;
    }
    if (!table.isActive || table.status === 'inactive') {
      res.status(409).json({ error: 'This table is deactivated' });
      return;
    }
    const existing = await getActiveSession(tableId);
    if (existing) {
      const session = await getSessionSummary(existing.id);
      res.json({ session, created: false });
      return;
    }
    if (table.status === 'cleaning') {
      res.status(409).json({ error: 'Mark the table as cleaned before seating guests' });
      return;
    }
    const guests = Math.min(30, Math.max(1, Number(req.body?.guestsCount ?? 2)));
    let row: { id: number } | null = null;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      row = await one<{ id: number }>(
        `INSERT INTO table_sessions (table_id, code, guests_count, opened_by)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [tableId, sessionCode(), guests, staff.id],
      ).catch(() => null);
    }
    if (!row) {
      res.status(500).json({ error: 'Could not open a table session' });
      return;
    }
    await query(
      'INSERT INTO table_session_guests (session_id, guest_key, name, is_lead) VALUES ($1,$2,$3,true)',
      [row.id, `staff-${staff.id}`, 'Walk-in guests'],
    );
    await query('UPDATE table_sessions SET guests_count = (SELECT COUNT(*)::int FROM table_session_guests WHERE session_id = $1) WHERE id = $1', [row.id]);
    await setTableStatus(tableId, 'occupied', {
      staffId: staff.id,
      action: 'session_opened',
      detail: `Table session ${await one<{ code: string }>('SELECT code FROM table_sessions WHERE id = $1', [row.id]).then((s) => s?.code)} opened by ${staff.name}`,
    });
    await query(
      `UPDATE table_reservations SET status = 'seated'
       WHERE id = (SELECT id FROM table_reservations
                   WHERE table_id = $1 AND status = 'confirmed'
                   ORDER BY abs(extract(epoch FROM (reserved_at - now()))) LIMIT 1)`,
      [tableId],
    );
    await recomputeBill(row.id);
    const session = await getSessionSummary(row.id);
    emitTo(['staff', `table:${row.id}`], 'session:opened', session);
    res.status(201).json({ session, created: true });
  },
);

sessionsRouter.post(
  '/sessions/:id/close',
  requireRoles('super_admin', 'manager', 'cashier'),
  async (req, res) => {
    const staff = (req as unknown as AuthedRequest).staff;
    const id = Number(req.params.id);
    const session = await one<{ id: number; tableId: number; status: string; tableCode: string }>(
      `SELECT s.id, s.table_id AS "tableId", s.status, t.code AS "tableCode"
       FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id WHERE s.id = $1`,
      [id],
    );
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'open') {
      res.status(409).json({ error: 'This session is already closed' });
      return;
    }
    const bill = await getBillForSession(id);
    if (!bill) {
      res.status(404).json({ error: 'Bill not found' });
      return;
    }
    const force = req.body?.force === true;
    if (bill.balance > 0.009 && !force) {
      res.status(409).json({ error: `Outstanding balance of ${bill.balance.toFixed(2)} ${'ETB'} must be settled first`, balance: bill.balance });
      return;
    }
    if (bill.balance > 0.009 && !['manager', 'super_admin'].includes(staff.role)) {
      res.status(403).json({ error: 'Only a manager can close a table with an outstanding balance' });
      return;
    }
    await query(
      "UPDATE table_sessions SET status = 'closed', closed_at = now(), closed_by = $2 WHERE id = $1",
      [id, staff.id],
    );
    await query(
      'UPDATE table_bills SET status = $2, closed_at = now() WHERE session_id = $1',
      [id, bill.balance <= 0.009 ? 'settled' : 'void'],
    );
    await setTableStatus(session.tableId, 'cleaning', {
      staffId: staff.id,
      action: 'session_closed',
      detail: `Bill ${bill.balance <= 0.009 ? 'settled' : 'closed with balance'} · table sent to cleaning`,
    });
    emitTo(['staff', `table:${id}`], 'session:closed', { sessionId: id, tableCode: session.tableCode });
    emitTo('staff', 'notification', {
      id: `session-${id}-closed`,
      kind: 'bill',
      message: `Table ${session.tableCode} closed · housekeeping required`,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true, bill });
  },
);

sessionsRouter.post(
  '/sessions/:id/payments',
  requireRoles('super_admin', 'manager', 'cashier'),
  async (req, res) => {
    const staff = (req as unknown as AuthedRequest).staff;
    const id = Number(req.params.id);
    const session = await one<{ id: number; status: string; tableId: number; tableCode: string }>(
      `SELECT s.id, s.status, s.table_id AS "tableId", t.code AS "tableCode"
       FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id WHERE s.id = $1`,
      [id],
    );
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.status !== 'open') {
      res.status(409).json({ error: 'This session is closed' });
      return;
    }
    const bill = await getBillForSession(id);
    if (!bill) {
      res.status(404).json({ error: 'Bill not found' });
      return;
    }
    const amount = Math.round(Number(req.body?.amount ?? 0) * 100) / 100;
    const method = String(req.body?.method ?? 'cash');
    if (!['cash', 'card', 'telebirr', 'room_charge'].includes(method)) {
      res.status(400).json({ error: 'Unsupported payment method' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Enter a payment amount greater than zero' });
      return;
    }
    if (amount > bill.balance + 0.009) {
      res.status(400).json({ error: `Payment exceeds the balance of ${bill.balance.toFixed(2)} ETB` });
      return;
    }
    await query(
      `INSERT INTO payments (session_id, bill_id, table_id, amount, method, reference, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, bill.id, bill.tableId, amount, method, req.body?.reference ?? null, staff.id],
    );
    const updated = await recomputeBill(id);
    const paidTotal = updated?.paid ?? 0;
    const paymentStatus = updated && paidTotal >= updated.total - 0.009 && updated.total > 0
      ? 'paid' : paidTotal > 0 ? 'partial' : 'unpaid';
    await query(
      "UPDATE orders SET payment_status = $2 WHERE session_id = $1 AND status <> 'cancelled'",
      [id, paymentStatus],
    );
    await logActivity(session.tableId, 'payment_received', `${amount.toFixed(2)} ETB received via ${method}`, staff.id);
    emitTo('staff', 'notification', {
      id: `pay-${id}-${Date.now()}`,
      kind: 'payment',
      message: `${amount.toFixed(2)} ETB received · Table ${session.tableCode}`,
      createdAt: new Date().toISOString(),
    });
    res.json({ bill: updated });
  },
);

sessionsRouter.get('/bills', async (req, res) => {
  const status = String(req.query.status ?? 'open');
  const rows = await query<Record<string, unknown>>(
    `SELECT b.id, b.session_id AS "sessionId", b.status, b.subtotal::float8 AS subtotal,
            b.service_charge::float8 AS "serviceCharge", b.tax::float8 AS tax,
            b.total::float8 AS total, b.created_at AS "createdAt",
            t.code AS "tableCode", t.id AS "tableId", a.name AS "areaName",
            s.code AS "sessionCode", s.opened_at AS "openedAt",
            (SELECT COALESCE(SUM(p.amount),0)::float8 FROM payments p WHERE p.session_id = b.session_id) AS paid
     FROM table_bills b
     JOIN dining_tables t ON t.id = b.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     JOIN table_sessions s ON s.id = b.session_id
     WHERE ($1 = 'all' OR b.status = $1)
     ORDER BY b.created_at DESC LIMIT 50`,
    [status],
  );
  res.json({
    bills: rows.map((b) => ({ ...b, balance: Math.round((Number(b.total) - Number(b.paid)) * 100) / 100 })),
  });
});

sessionsRouter.get('/bills/:sessionId', async (req, res) => {
  const bill = await getBillForSession(Number(req.params.sessionId));
  if (!bill) {
    res.status(404).json({ error: 'Bill not found' });
    return;
  }
  const session = await getSessionSummary(bill.sessionId);
  res.json({ bill, session });
});

sessionsRouter.get('/payments', async (req, res) => {
  const all = req.query.date === 'all';
  const payments = await query<Record<string, unknown>>(
    `SELECT p.id, p.amount::float8 AS amount, p.method, p.reference, p.created_at AS "createdAt",
            t.code AS "tableCode", s.code AS "sessionCode", u.name AS "receivedByName"
     FROM payments p
     JOIN dining_tables t ON t.id = p.table_id
     JOIN table_sessions s ON s.id = p.session_id
     LEFT JOIN staff u ON u.id = p.received_by
     WHERE $1 = true OR p.created_at >= current_date
     ORDER BY p.created_at DESC LIMIT 100`,
    [all],
  );
  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  res.json({ payments, total: Math.round(total * 100) / 100 });
});
