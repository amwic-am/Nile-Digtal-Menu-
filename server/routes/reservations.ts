import { Router } from 'express';
import type { AuthedRequest } from '../auth.js';
import { requireRoles } from '../auth.js';
import { one, query } from '../db.js';
import { logActivity, setTableStatus } from '../domain.js';
import { emitTo } from '../realtime.js';

export const reservationsRouter = Router();

reservationsRouter.get('/reservations', async (req, res) => {
  const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : null;
  const params: unknown[] = [];
  let filter = `r.reserved_at >= now() - interval '2 hours'`;
  if (date) {
    params.push(date);
    filter = `r.reserved_at::date = $1::date`;
  }
  const reservations = await query<Record<string, unknown>>(
    `SELECT r.id, r.customer_name AS "customerName", r.phone, r.guests,
            r.reserved_at AS "reservedAt", r.duration_min AS "durationMin", r.status,
            r.notes, r.deposit::float8 AS deposit, r.created_at AS "createdAt",
            t.id AS "tableId", t.code AS "tableCode", t.capacity,
            a.name AS "areaName", f.name AS "floorName"
     FROM table_reservations r
     JOIN dining_tables t ON t.id = r.table_id
     LEFT JOIN dining_areas a ON a.id = t.area_id
     LEFT JOIN dining_floors f ON f.id = t.floor_id
     WHERE ${filter}
     ORDER BY r.reserved_at`,
    params,
  );
  res.json({ reservations });
});

reservationsRouter.post(
  '/reservations',
  requireRoles('super_admin', 'manager', 'receptionist'),
  async (req, res) => {
    const staff = (req as unknown as AuthedRequest).staff;
    const body = req.body ?? {};
    const tableId = Number(body.tableId);
    const customerName = String(body.customerName ?? '').trim();
    const guests = Number(body.guests ?? 2);
    const durationMin = Math.min(360, Math.max(30, Number(body.durationMin ?? 120)));
    const reservedAt = new Date(String(body.reservedAt ?? ''));
    if (!tableId || !customerName) {
      res.status(400).json({ error: 'Table and customer name are required' });
      return;
    }
    if (Number.isNaN(reservedAt.getTime())) {
      res.status(400).json({ error: 'Choose a valid reservation date and time' });
      return;
    }
    const table = await one<{ id: number; code: string; capacity: number; status: string }>(
      'SELECT id, code, capacity, status FROM dining_tables WHERE id = $1 AND deleted_at IS NULL',
      [tableId],
    );
    if (!table) {
      res.status(404).json({ error: 'Table not found' });
      return;
    }
    if (guests > table.capacity) {
      res.status(400).json({ error: `${table.code} seats ${table.capacity} guests. Choose a larger table.` });
      return;
    }
    const conflict = await one<{ id: number; reservedAt: string }>(
      `SELECT id, reserved_at AS "reservedAt" FROM table_reservations
       WHERE table_id = $1 AND status IN ('confirmed','seated')
         AND reserved_at < $2::timestamptz + ($3 || ' minutes')::interval
         AND reserved_at + (duration_min || ' minutes')::interval > $2::timestamptz
       LIMIT 1`,
      [tableId, reservedAt.toISOString(), durationMin],
    );
    if (conflict) {
      res.status(409).json({
        error: `${table.code} is already reserved at that time.`,
        conflict,
      });
      return;
    }
    const row = await one<{ id: number }>(
      `INSERT INTO table_reservations
        (restaurant_id, table_id, customer_name, phone, email, guests, reserved_at, duration_min, notes, deposit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [staff.restaurant_id, tableId, customerName, body.phone ?? null, body.email ?? null,
        Math.max(1, guests), reservedAt.toISOString(), durationMin, body.notes ?? null,
        Number(body.deposit ?? 0)],
    );
    const withinTwoHours = Math.abs(reservedAt.getTime() - Date.now()) < 2 * 60 * 60 * 1000;
    if (withinTwoHours && table.status === 'available') {
      await setTableStatus(tableId, 'reserved', {
        staffId: staff.id,
        action: 'reserved',
        detail: `Reserved for ${customerName} at ${reservedAt.toLocaleString('en-GB')}`,
      });
    } else {
      await logActivity(tableId, 'reserved', `Reserved for ${customerName} at ${reservedAt.toLocaleString('en-GB')}`, staff.id);
    }
    emitTo('staff', 'reservations:updated', { id: row!.id });
    res.status(201).json({ id: row!.id });
  },
);

reservationsRouter.patch(
  '/reservations/:id/status',
  requireRoles('super_admin', 'manager', 'receptionist'),
  async (req, res) => {
    const staff = (req as unknown as AuthedRequest).staff;
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? '');
    if (!['confirmed', 'seated', 'cancelled', 'no_show', 'completed'].includes(status)) {
      res.status(400).json({ error: 'Unknown reservation status' });
      return;
    }
    const reservation = await one<{ tableId: number; status: string; customerName: string; tableCode: string }>(
      `SELECT r.table_id AS "tableId", r.status, r.customer_name AS "customerName", t.code AS "tableCode"
       FROM table_reservations r JOIN dining_tables t ON t.id = r.table_id WHERE r.id = $1`,
      [id],
    );
    if (!reservation) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    await query('UPDATE table_reservations SET status = $2 WHERE id = $1', [id, status]);
    if (['cancelled', 'no_show', 'completed'].includes(status)) {
      const table = await one<{ status: string }>('SELECT status FROM dining_tables WHERE id = $1', [reservation.tableId]);
      const session = await one('SELECT 1 FROM table_sessions WHERE table_id = $1 AND status = \'open\'', [reservation.tableId]);
      if (table?.status === 'reserved' && !session) {
        await setTableStatus(reservation.tableId, 'available', {
          staffId: staff.id,
          action: 'reservation_released',
          detail: `Reservation for ${reservation.customerName} ${status}`,
        });
      }
    }
    await logActivity(reservation.tableId, 'reservation_' + status, `Reservation status set to ${status}`, staff.id);
    emitTo('staff', 'reservations:updated', { id });
    res.json({ ok: true });
  },
);
