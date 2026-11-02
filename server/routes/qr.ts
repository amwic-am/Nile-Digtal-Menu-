import { Router } from 'express';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AuthedRequest } from '../auth.js';
import { requireRoles } from '../auth.js';
import { one, query } from '../db.js';
import { logActivity } from '../domain.js';
import { emitTo } from '../realtime.js';
import { appOrigin, ensureQr, qrDataUrl, qrPng, qrSvg, regenerateQr, revokeQr, scanUrl } from '../qr.js';

export const qrRouter = Router();

type QrTableRow = {
  id: number; code: string; capacity: number; status: string;
  areaId: number; areaName: string; floorId: number; floorName: string;
};

const tableBaseQuery = `
  SELECT t.id, t.code, t.capacity, t.status, t.area_id AS "areaId", a.name AS "areaName",
         t.floor_id AS "floorId", f.name AS "floorName",
         q.token, q.created_at AS "qrCreatedAt"
  FROM dining_tables t
  LEFT JOIN dining_areas a ON a.id = t.area_id
  LEFT JOIN dining_floors f ON f.id = t.floor_id
  LEFT JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
`;

async function loadQrTables(req: Parameters<typeof appOrigin>[0], filters: { areaId?: number; floorId?: number } = {}) {
  const clauses = ['t.deleted_at IS NULL', 't.is_active = true'];
  const params: unknown[] = [];
  if (filters.areaId) {
    params.push(filters.areaId);
    clauses.push(`t.area_id = $${params.length}`);
  }
  if (filters.floorId) {
    params.push(filters.floorId);
    clauses.push(`t.floor_id = $${params.length}`);
  }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    params.push(`%${req.query.q.trim()}%`);
    clauses.push(`t.code ILIKE $${params.length}`);
  }
  const rows = await query<QrTableRow & { token: string | null; qrCreatedAt: string | null }>(
    `${tableBaseQuery} WHERE ${clauses.join(' AND ')} ORDER BY t.code`,
    params,
  );
  const origin = appOrigin(req);
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const history = await one<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM table_qr_codes WHERE table_id = $1',
        [row.id],
      );
      const url = row.token ? scanUrl(origin, row.token) : null;
      return {
        ...row,
        qr: row.token && url
          ? { token: row.token, createdAt: row.qrCreatedAt, scanUrl: url, dataUrl: await qrDataUrl(url) }
          : null,
        qrHistoryCount: history?.count ?? 0,
      };
    }),
  );
  return enriched;
}

qrRouter.get('/qr', async (req, res) => {
  const tables = await loadQrTables(req, {
    areaId: req.query.areaId ? Number(req.query.areaId) : undefined,
    floorId: req.query.floorId ? Number(req.query.floorId) : undefined,
  });
  res.json({
    tables,
    counts: {
      active: tables.filter((t) => t.qr).length,
      missing: tables.filter((t) => !t.qr).length,
      total: tables.length,
    },
  });
});

qrRouter.post('/qr/generate-missing', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const tables = await loadQrTables(req, {
    areaId: req.query.areaId ? Number(req.query.areaId) : undefined,
  });
  let created = 0;
  for (const table of tables.filter((t) => !t.qr)) {
    await ensureQr(table.id, staff.id);
    await logActivity(table.id, 'qr_generated', `QR code generated for ${table.code}`, staff.id);
    created += 1;
  }
  emitTo('staff', 'qr:updated', { created });
  res.json({ created });
});

qrRouter.post('/qr/tables/:id/generate', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const table = await one<QrTableRow>(`${tableBaseQuery.replace(' q.token, q.created_at AS "qrCreatedAt"', '')} WHERE t.id = $1`, [id]);
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  const qr = await ensureQr(id, staff.id);
  const origin = appOrigin(req);
  const url = scanUrl(origin, qr.token);
  await logActivity(id, 'qr_generated', `QR code generated for ${table.code}`, staff.id);
  emitTo('staff', 'qr:updated', { tableId: id });
  res.json({ qr: { ...qr, scanUrl: url, dataUrl: await qrDataUrl(url) } });
});

qrRouter.post('/qr/tables/:id/regenerate', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const table = await one<{ code: string }>('SELECT code FROM dining_tables WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  const qr = await regenerateQr(id, staff.id);
  const origin = appOrigin(req);
  const url = scanUrl(origin, qr.token);
  await logActivity(id, 'qr_regenerated', `Previous QR revoked and a new code issued for ${table.code}`, staff.id);
  emitTo('staff', 'qr:updated', { tableId: id });
  res.json({ qr: { ...qr, scanUrl: url, dataUrl: await qrDataUrl(url) } });
});

qrRouter.post('/qr/tables/:id/revoke', requireRoles('super_admin', 'manager'), async (req, res) => {
  const staff = (req as unknown as AuthedRequest).staff;
  const id = Number(req.params.id);
  const table = await one<{ code: string }>('SELECT code FROM dining_tables WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!table) {
    res.status(404).json({ error: 'Table not found' });
    return;
  }
  await revokeQr(id);
  await logActivity(id, 'qr_revoked', `QR code revoked for ${table.code}`, staff.id);
  emitTo('staff', 'qr:updated', { tableId: id });
  res.json({ ok: true });
});

qrRouter.get('/qr/tables/:id/download', async (req, res) => {
  const table = await one<{ code: string; token: string }>(
    `SELECT t.code, q.token FROM dining_tables t
     JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
     WHERE t.id = $1`,
    [Number(req.params.id)],
  );
  if (!table) {
    res.status(404).json({ error: 'Generate a QR code for this table first' });
    return;
  }
  const url = scanUrl(appOrigin(req), table.token);
  const format = String(req.query.format ?? 'png');
  if (format === 'svg') {
    const svg = await qrSvg(url);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="Nile-Table-${table.code}-QR.svg"`);
    res.send(svg);
    return;
  }
  const png = await qrPng(url, 1024);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="Nile-Table-${table.code}-QR.png"`);
  res.send(png);
});

qrRouter.get('/download/:id', async (req, res) => {
  const table = await one<{ code: string; token: string }>(
    `SELECT t.code, q.token FROM dining_tables t
     JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
     WHERE t.id = $1`,
    [Number(req.params.id)],
  );
  if (!table) {
    res.status(404).json({ error: 'QR code not found' });
    return;
  }
  const png = await qrPng(scanUrl(appOrigin(req), table.token), 1024);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="Nile-Table-${table.code}-QR.png"`);
  res.send(png);
});

qrRouter.get('/qr/download-all', async (req, res) => {
  const tables = await loadQrTables(req, { areaId: req.query.areaId ? Number(req.query.areaId) : undefined });
  const withQr = tables.filter((t) => t.qr);
  if (!withQr.length) {
    res.status(404).json({ error: 'No active QR codes to download' });
    return;
  }
  const zip = new JSZip();
  const origin = appOrigin(req);
  const manifest: string[] = ['Table,Area,Scan URL'];
  for (const table of withQr) {
    const url = scanUrl(origin, table.qr!.token);
    const png = await qrPng(url, 1024);
    zip.file(`Nile-Table-${table.code}-QR.png`, png);
    manifest.push(`${table.code},${table.areaName},${url}`);
  }
  zip.file('qr-manifest.csv', manifest.join('\n'));
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="Nile-Table-QR-Codes.zip"');
  res.send(buffer);
});

qrRouter.get('/qr/sheet.pdf', async (req, res) => {
  const tables = await loadQrTables(req, {
    areaId: req.query.areaId ? Number(req.query.areaId) : undefined,
    floorId: req.query.floorId ? Number(req.query.floorId) : undefined,
  });
  const withQr = tables.filter((t) => t.qr);
  if (!withQr.length) {
    res.status(404).json({ error: 'No active QR codes to print' });
    return;
  }
  const origin = appOrigin(req);
  const doc = await PDFDocument.create();
  doc.setTitle('Nile Restaurant — Table QR cards');
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const cream = rgb(0.969, 0.945, 0.902);
  const ink = rgb(0.082, 0.078, 0.063);
  const gold = rgb(0.788, 0.643, 0.337);
  const muted = rgb(0.42, 0.39, 0.34);

  const cardW = 245;
  const cardH = 300;
  const gapX = 22;
  const gapY = 24;
  const marginX = 36;
  const cols = 2;
  const rows = 2;
  const perPage = cols * rows;

  for (let index = 0; index < withQr.length; index++) {
    const table = withQr[index];
    const pageIndex = Math.floor(index / perPage);
    const slot = index % perPage;
    let page = doc.getPages()[pageIndex];
    if (!page) {
      page = doc.addPage([595.28, 841.89]);
      page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: cream });
      page.drawText('NILE RESTAURANT', {
        x: marginX, y: 800, size: 9, font: sansBold, color: ink,
      });
      page.drawText('Table QR cards · scan to order', {
        x: marginX, y: 786, size: 8, font: sans, color: muted,
      });
      page.drawText(`Page ${pageIndex + 1}`, {
        x: 500, y: 800, size: 8, font: sans, color: muted,
      });
      page.drawLine({ start: { x: marginX, y: 775 }, end: { x: 559, y: 775 }, thickness: 0.7, color: gold });
    }
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = marginX + col * (cardW + gapX);
    const y = 440 - row * (cardH + gapY);

    page.drawRectangle({ x, y, width: cardW, height: cardH, color: rgb(1, 1, 1), borderColor: gold, borderWidth: 0.8 });
    page.drawRectangle({ x: x + 8, y: y + 8, width: cardW - 16, height: cardH - 16, borderColor: rgb(0.9, 0.86, 0.76), borderWidth: 0.5 });
    page.drawText('NILE', { x: x + 18, y: y + cardH - 36, size: 16, font: serif, color: ink });
    page.drawText('HOTEL RESTAURANT', { x: x + 18, y: y + cardH - 48, size: 5.5, font: sansBold, color: gold });
    page.drawText(table.areaName.toUpperCase(), {
      x: x + 18, y: y + cardH - 63, size: 6, font: sans, color: muted,
    });

    page.drawText('TABLE', { x: x + 18, y: y + cardH - 94, size: 7, font: sansBold, color: muted });
    page.drawText(table.code, { x: x + 18, y: y + cardH - 122, size: 24, font: serif, color: ink });

    const png = await qrPng(scanUrl(origin, table.qr!.token), 600);
    const image = await doc.embedPng(png);
    page.drawImage(image, { x: x + 61, y: y + 46, width: 118, height: 118 });

    page.drawText('Scan to view the menu', {
      x: x + 18, y: y + 30, size: 8.5, font: sansBold, color: ink,
    });
    page.drawText('Order directly from your table', {
      x: x + 18, y: y + 18, size: 6.5, font: sans, color: muted,
    });
  }

  const pdf = await doc.save();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="Nile-Table-QR-Cards.pdf"');
  res.send(Buffer.from(pdf));
});
