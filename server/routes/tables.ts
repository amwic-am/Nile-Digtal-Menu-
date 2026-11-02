import { Router } from 'express';
import type { AuthedRequest } from '../auth.js';
import { requireRoles } from '../auth.js';
import { one, query, withTx } from '../db.js';
import { emitTo } from '../realtime.js';
import { getActiveSession, getBillForSession, logActivity, recomputeBill, setTableStatus } from '../domain.js';
import { ensureQr } from '../qr.js';

export const tablesRouter = Router();

const shapes = ['square', 'round', 'rect'];
const statuses = ['available', 'occupied', 'reserved', 'cleaning', 'inactive'];

const tableSelect = `
  SELECT t.id, t.code, t.name, t.capacity, t.shape, t.status,
         t.area_id AS "areaId", a.name AS "areaName",
         t.floor_id AS "floorId", f.name AS "floorName",
         t.location_label AS "locationLabel", t.is_active AS "isActive",
         t.pos_x AS "posX", t.pos_y AS "posY", t.width, t.height, t.rotation,
         t.created_at AS "createdAt",
         s.id AS "sessionId", s.code AS "sessionCode", s.guests_count AS "guestsCount",
         (SELECT COUNT(*)::int FROM orders o
           WHERE o.session_id = s.id AND o.status NOT IN ('cancelled','completed')) AS "orderCount",
         (SELECT COALESCE(SUM(o.total),0)::float8 FROM orders o
           WHERE o.session_id = s.id AND o.status <> 'cancelled') AS "billTotal",
         wa.staff_id AS "waiterId", w.name AS "waiterName",
         q.token AS "qrToken"
  FROM dining_tables t
  LEFT JOIN dining_areas a ON a.id = t.area_id
  LEFT JOIN dining_floors f ON f.id = t.floor_id
  LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status = 'open'
  LEFT JOIN LATERAL (
    SELECT staff_id FROM waiter_assignments
    WHERE table_id = t.id AND unassigned_at IS NULL
    ORDER BY assigned_at DESC LIMIT 1
  ) wa ON true
  LEFT JOIN staff w ON w.id = wa.staff_id
  LEFT JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
`;

tablesRouter.get('/floors', async (_req, res) => {
  const floors = await query(
    `SELECT id, name, level, sort FROM dining_floors ORDER BY sort, id`,
  );
  res.json({ floors });
});

tablesRouter.get('/areas', async (_req, res) => {
  const areas = await query(
    `SELECT a.id, a.name, a.description, a.floor_id AS "floorId", f.name AS "floorName",
            a.sort, (SELECT COUNT(*)::int FROM dining_tables t
                     WHERE t.area_id = a.id AND t.deleted_at IS NULL) AS "tableCount"
     FROM dining_areas a JOIN dining_floors f ON f.id = a.floor_id
     ORDER BY f.sort, a.sort, a.id`,
  );
  const floors = await query('SELECT id, name, level FROM dining_floors ORDER BY sort, id');
  res.json({ areas, floors });
});

tablesRouter.get('/tables', async (req, res) => {
  const clauses = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.status && statuses.includes(String(req.query.status))) {
    add('t.status = ?', String(req.query.status));
  }
  if (req.query.areaId) add('t.area_id = ?', Number(req.query.areaId));
  if (req.query.floorId) add('t.floor_id = ?', Number(req.query.floorId));
  if (req.query.q) {
    params.push(`%${String(req.query.q)}%`);
    clauses.push(`(t.code ILIKE $${params.length} OR COALESCE(t.name,'') ILIKE $${params.length})`);
  }
  if (req.query.includeInactive !== 'true') clauses.push('t.is_active = true');
  const rows = await query(
    `${tableSelect} WHERE ${clauses.join(' AND ')} ORDER BY t.code`,
    params,
  );
  res.json({ tables: rows });
});

tablesRouter.get('/tables/:id', async (req, res) => {
  const id = Number(req.params.id);
  const table = await one<Record<string, unknown>>(`${tableSelect} WHERE t.id = $1 AND t.deleted_at IS NULL`, [id]);
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  const sessionId = table.sessionId as number | null;
  const [guests, orders, bill, history, activity, reservations, qrHistory, waiters, upcoming] = await Promise.all([
    sessionId
      ? query('SELECT id, name, is_lead AS "isLead", joined_at AS "joinedAt" FROM table_session_guests WHERE session_id = $1 ORDER BY joined_at', [sessionId])
      : Promise.resolve([]),
    query(
      `SELECT o.id, o.order_no AS "orderNo", '#' || o.order_no AS "displayNo", o.status, o.source,
              o.total::float8 AS total, o.subtotal::float8 AS subtotal, o.payment_status AS "paymentStatus",
              o.guest_name AS "guestName", o.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
              (SELECT string_agg(oi.name || ' × ' || oi.qty, ', ') FROM order_items oi WHERE oi.order_id = o.id) AS "itemsSummary"
       FROM orders o
       WHERE o.table_id = $1 AND ($2::int IS NULL OR o.session_id = $2)
         AND ($2::int IS NOT NULL OR o.status NOT IN ('cancelled','completed'))
       ORDER BY o.created_at DESC`,
      [id, sessionId],
    ),
    sessionId ? getBillForSession(sessionId) : Promise.resolve(null),
    query(
      `SELECT id, order_no AS "orderNo", '#' || order_no AS "displayNo", status, total::float8 AS total,
              created_at AS "createdAt", payment_status AS "paymentStatus"
       FROM orders WHERE table_id = $1 AND status IN ('completed','cancelled')
       ORDER BY created_at DESC LIMIT 25`,
      [id],
    ),
    query(
      `SELECT l.id, l.action, l.detail, l.created_at AS "createdAt", s.name AS "staffName"
       FROM table_activity_logs l LEFT JOIN staff s ON s.id = l.staff_id
       WHERE l.table_id = $1 ORDER BY l.created_at DESC LIMIT 40`,
      [id],
    ),
    query(
      `SELECT r.id, r.customer_name AS "customerName", r.phone, r.guests, r.reserved_at AS "reservedAt",
              r.status, r.notes, r.duration_min AS "durationMin"
       FROM table_reservations r WHERE r.table_id = $1 AND r.status IN ('confirmed','seated')
       ORDER BY r.reserved_at LIMIT 10`,
      [id],
    ),
    query(
      `SELECT id, status, created_at AS "createdAt", revoked_at AS "revokedAt"
       FROM table_qr_codes WHERE table_id = $1 ORDER BY created_at DESC`,
      [id],
    ),
    query(
      `SELECT id, name, role FROM staff WHERE role IN ('waiter','manager','super_admin') AND is_active = true ORDER BY name`,
    ),
    Promise.resolve([]),
  ]);
  res.json({
    table,
    session: sessionId
      ? await one(
          `SELECT id, code, status, guests_count AS "guestsCount", opened_at AS "openedAt",
                  closed_at AS "closedAt", (SELECT name FROM staff WHERE id = opened_by) AS "openedByName"
           FROM table_sessions WHERE id = $1`,
          [sessionId],
        )
      : null,
    guests,
    orders,
    bill,
    history,
    activity,
    reservations,
    qrHistory,
    waiters,
    upcoming,
  });
});

tablesRouter.post('/tables', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const body = req.body ?? {};
  const code = String(body.code ?? '').trim();
  const areaId = Number(body.areaId);
  const capacity = Number(body.capacity ?? 4);
  const shape = shapes.includes(body.shape) ? body.shape : 'square';
  if (!code) {
    res.status(400).json({ error: 'Table number is required' });
    return;
  }
  if (!areaId) {
    res.status(400).json({ error: 'Dining area is required' });
    return;
  }
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 30) {
    res.status(400).json({ error: 'Capacity must be between 1 and 30' });
    return;
  }
  const area = await one<{ floorId: number }>('SELECT floor_id AS "floorId" FROM dining_areas WHERE id = $1', [areaId]);
  if (!area) {
    res.status(400).json({ error: 'Dining area not found' });
    return;
  }
  const duplicate = await one('SELECT 1 FROM dining_tables WHERE code = $1 AND deleted_at IS NULL', [code]);
  if (duplicate) {
    res.status(409).json({ error: `Table ${code} already exists` });
    return;
  }
  const row = await one<{ id: number }>(
    `INSERT INTO dining_tables
      (restaurant_id, floor_id, area_id, code, name, capacity, shape, status, location_label,
       pos_x, pos_y, width, height)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'available',$8,$9,$10,$11,$12) RETURNING id`,
    [staff.restaurant_id, area.floorId, areaId, code, body.name || code, capacity, shape,
      body.locationLabel || null, Number(body.posX ?? 140), Number(body.posY ?? 140),
      shape === 'rect' ? 170 : 112, shape === 'rect' ? 120 : 112],
  );
  const qr = await ensureQr(row!.id, staff.id);
  await logActivity(row!.id, 'table_created', `Table ${code} created with QR ordering`, staff.id);
  const table = await one(`${tableSelect} WHERE t.id = $1`, [row!.id]);
  emitTo('staff', 'table:updated', table);
  res.status(201).json({ table, qr });
});

tablesRouter.put('/tables/:id', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const existing = await one<{ code: string; areaId: number; status: string }>(
    'SELECT code, area_id AS "areaId", status FROM dining_tables WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!existing) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  const body = req.body ?? {};
  const code = String(body.code ?? existing.code).trim();
  const areaId = Number(body.areaId ?? existing.areaId);
  const area = await one<{ floorId: number }>('SELECT floor_id AS "floorId" FROM dining_areas WHERE id = $1', [areaId]);
  if (!area) {
    res.status(400).json({ error: 'Dining area not found' });
    return;
  }
  const duplicate = await one(
    'SELECT 1 FROM dining_tables WHERE code = $1 AND id <> $2 AND deleted_at IS NULL',
    [code, id],
  );
  if (duplicate) {
    res.status(409).json({ error: `Table ${code} already exists` });
    return;
  }
  const capacity = Number(body.capacity ?? 4);
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 30) {
    res.status(400).json({ error: 'Capacity must be between 1 and 30' });
    return;
  }
  const shape = shapes.includes(body.shape) ? body.shape : 'square';
  await query(
    `UPDATE dining_tables SET code = $2, name = $3, area_id = $4, floor_id = $5, capacity = $6,
       shape = $7, location_label = $8, is_active = $9
     WHERE id = $1`,
    [id, code, body.name || code, areaId, area.floorId, capacity, shape,
      body.locationLabel ?? null, body.isActive !== false],
  );
  await logActivity(id, 'table_updated', `Table ${code} details updated`, staff.id);
  const table = await one(`${tableSelect} WHERE t.id = $1`, [id]);
  emitTo('staff', 'table:updated', table);
  res.json({ table });
});

tablesRouter.patch('/tables/:id/status', async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? '');
  if (!statuses.includes(status)) {
    res.status(400).json({ error: 'Unknown table status' });
    return;
  }
  const table = await one<{ code: string; status: string }>(
    'SELECT code, status FROM dining_tables WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  const session = await getActiveSession(id);
  if (session && ['available', 'reserved', 'cleaning'].includes(status)) {
    res.status(409).json({ error: 'Close the active table session before changing this status' });
    return;
  }
  await setTableStatus(id, status, {
    staffId: staff.id,
    action: 'status_changed',
    detail: `Table ${table.code} changed from ${table.status} to ${status}`,
  });
  res.json({ ok: true });
});

tablesRouter.delete('/tables/:id', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const table = await one<{ code: string }>(
    'SELECT code FROM dining_tables WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  const session = await getActiveSession(id);
  if (session) {
    res.status(409).json({ error: 'This table has an open session. Close it before deleting.' });
    return;
  }
  const history = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM orders WHERE table_id = $1', [id]);
  await query(
    `UPDATE dining_tables SET deleted_at = now(), is_active = false, status = 'inactive' WHERE id = $1`,
    [id],
  );
  await query(
    `UPDATE table_qr_codes SET status = 'revoked', revoked_at = now() WHERE table_id = $1 AND status = 'active'`,
    [id],
  );
  await logActivity(id, 'table_deleted', `Table ${table.code} archived`, staff.id);
  emitTo('staff', 'table:removed', { id });
  res.json({ ok: true, softDeleted: (history?.count ?? 0) > 0 });
});

tablesRouter.patch('/tables/:id/layout', requireRoles('super_admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  await query(
    `UPDATE dining_tables SET pos_x = $2, pos_y = $3, width = $4, height = $5, rotation = $6
     WHERE id = $1`,
    [id, Math.round(Number(b.posX ?? 120)), Math.round(Number(b.posY ?? 120)),
      Math.max(60, Math.round(Number(b.width ?? 112))), Math.max(60, Math.round(Number(b.height ?? 112))),
      Math.round(Number(b.rotation ?? 0))],
  );
  const table = await one(`${tableSelect} WHERE t.id = $1`, [id]);
  emitTo('staff', 'table:updated', table);
  res.json({ table });
});

tablesRouter.post('/tables/layout', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const tables = Array.isArray(req.body?.tables) ? req.body.tables : [];
  if (!tables.length) {
    res.status(400).json({ error: 'No layout changes submitted' });
    return;
  }
  await withTx(async (q) => {
    for (const t of tables) {
      await q(
        `UPDATE dining_tables SET pos_x = $2, pos_y = $3, width = $4, height = $5, rotation = $6, shape = $7
         WHERE id = $1`,
        [Number(t.id), Math.round(Number(t.posX)), Math.round(Number(t.posY)),
          Math.max(60, Math.round(Number(t.width))), Math.max(60, Math.round(Number(t.height))),
          Math.round(Number(t.rotation ?? 0)), shapes.includes(t.shape) ? t.shape : 'square'],
      );
    }
    await q(
      'INSERT INTO table_activity_logs (table_id, action, detail, staff_id) VALUES ($1,$2,$3,$4)',
      [Number(tables[0].id), 'layout_saved', `Floor layout saved (${tables.length} table${tables.length === 1 ? '' : 's'})`, staff.id],
    );
  });
  emitTo('staff', 'layout:saved', { count: tables.length });
  res.json({ ok: true, saved: tables.length });
});

tablesRouter.post('/tables/:id/assign-waiter', requireRoles('super_admin', 'manager', 'receptionist'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
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
  await query('UPDATE waiter_assignments SET unassigned_at = now() WHERE table_id = $1 AND unassigned_at IS NULL', [id]);
  await query('INSERT INTO waiter_assignments (table_id, staff_id) VALUES ($1,$2)', [id, staffId]);
  const session = await getActiveSession(id);
  if (session) {
    await query('UPDATE orders SET waiter_id = $2 WHERE session_id = $1', [session.id, staffId]);
  }
  await logActivity(id, 'waiter_assigned', `${waiter.name} assigned to the table`, staff.id);
  const table = await one(`${tableSelect} WHERE t.id = $1`, [id]);
  emitTo('staff', 'table:updated', table);
  res.json({ table });
});

tablesRouter.post('/tables/:id/cleaned', async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const table = await one<{ status: string }>('SELECT status FROM dining_tables WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  if (table.status !== 'cleaning') {
    res.status(409).json({ error: 'Only tables marked for cleaning can be released' });
    return;
  }
  await setTableStatus(id, 'available', {
    staffId: staff.id,
    action: 'cleaned',
    detail: 'Housekeeping confirmed the table is ready for guests',
  });
  res.json({ ok: true });
});

tablesRouter.post('/tables/:id/transfer', requireRoles('super_admin', 'manager', 'receptionist', 'waiter'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const toId = Number(req.body?.toTableId);
  const session = await getActiveSession(id);
  if (!session) {
    res.status(409).json({ error: 'This table has no active session to transfer' });
    return;
  }
  const target = await one<{ id: number; code: string; status: string }>(
    'SELECT id, code, status FROM dining_tables WHERE id = $1 AND deleted_at IS NULL',
    [toId],
  );
  if (!target) {
    res.status(404).json({ error: 'Destination table not found' });
    return;
  }
  if (await getActiveSession(toId)) {
    res.status(409).json({ error: 'Destination table already has an open session' });
    return;
  }
  if (['inactive', 'cleaning'].includes(target.status)) {
    res.status(409).json({ error: 'Destination table is not available' });
    return;
  }
  const source = await one<{ code: string }>('SELECT code FROM dining_tables WHERE id = $1', [id]);
  await withTx(async (q) => {
    await q('UPDATE table_sessions SET table_id = $2 WHERE id = $1', [session.id, toId]);
    await q('UPDATE orders SET table_id = $2 WHERE session_id = $1', [session.id, toId]);
    await q('UPDATE table_bills SET table_id = $2 WHERE session_id = $1', [session.id, toId]);
    await q('UPDATE payments SET table_id = $2 WHERE session_id = $1', [session.id, toId]);
    await q("UPDATE dining_tables SET status = 'cleaning' WHERE id = $1", [id]);
    await q("UPDATE dining_tables SET status = 'occupied' WHERE id = $1", [toId]);
    await q(
      'INSERT INTO table_activity_logs (table_id, action, detail, staff_id) VALUES ($1,$2,$3,$4)',
      [id, 'transferred_out', `Guests transferred to ${target.code}`, staff.id],
    );
    await q(
      'INSERT INTO table_activity_logs (table_id, action, detail, staff_id) VALUES ($1,$2,$3,$4)',
      [toId, 'transferred_in', `Guests transferred from ${source?.code ?? 'another table'}`, staff.id],
    );
  });
  emitTo('staff', 'table:updated', { id, status: 'cleaning' });
  emitTo('staff', 'table:updated', { id: toId, status: 'occupied' });
  emitTo('staff', 'tables:reload', {});
  res.json({ ok: true });
});

tablesRouter.post('/tables/merge', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const primaryId = Number(req.body?.primaryTableId);
  const mergeIds: number[] = Array.isArray(req.body?.mergeTableIds)
    ? req.body.mergeTableIds.map(Number)
    : [];
  if (!primaryId || !mergeIds.length) {
    res.status(400).json({ error: 'Choose a primary table and at least one table to merge' });
    return;
  }
  const primary = await getActiveSession(primaryId);
  if (!primary) {
    res.status(409).json({ error: 'The primary table needs an open session' });
    return;
  }
  const merged: number[] = [];
  for (const sourceId of mergeIds) {
    if (sourceId === primaryId) continue;
    const source = await getActiveSession(sourceId);
    if (!source) continue;
    await withTx(async (q) => {
      await q(
        `UPDATE table_session_guests SET session_id = $2 WHERE session_id = $1`,
        [source.id, primary.id],
      );
      await q('UPDATE orders SET session_id = $2, table_id = $3 WHERE session_id = $1', [source.id, primary.id, primaryId]);
      await q('UPDATE payments SET session_id = $2, table_id = $3, bill_id = NULL WHERE session_id = $1', [source.id, primary.id, primaryId]);
      await q("UPDATE table_sessions SET status = 'closed', closed_at = now() WHERE id = $1", [source.id]);
      await q("DELETE FROM table_bills WHERE session_id = $1", [source.id]);
      await q("UPDATE dining_tables SET status = 'cleaning' WHERE id = $1", [sourceId]);
      await q(
        'INSERT INTO table_activity_logs (table_id, action, detail, staff_id) VALUES ($1,$2,$3,$4)',
        [sourceId, 'merged_out', `Merged into table ${primary.tableCode}`, staff.id],
      );
    });
    merged.push(sourceId);
  }
  await query('UPDATE table_sessions SET guests_count = (SELECT COUNT(*)::int FROM table_session_guests WHERE session_id = $1) WHERE id = $1', [primary.id]);
  await recomputeBill(primary.id);
  await logActivity(primaryId, 'merged_in', `${merged.length} table(s) merged into ${primary.tableCode}`, staff.id);
  emitTo('staff', 'tables:reload', {});
  res.json({ ok: true, merged });
});
