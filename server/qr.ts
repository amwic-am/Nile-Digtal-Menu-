import crypto from 'node:crypto';
import QRCode from 'qrcode';
import type { Request } from 'express';
import { one, query } from './db.js';

export function appOrigin(req: Request): string {
  const header = req.headers['x-app-origin'];
  if (typeof header === 'string' && header.startsWith('http')) return header.replace(/\/$/, '');
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/$/, '');
  return (process.env.APP_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5180}`).replace(/\/$/, '');
}

export function scanUrl(origin: string, token: string) {
  return `${origin}/menu/scan/${token}`;
}

export async function ensureQr(tableId: number, staffId?: number) {
  const existing = await one<{ id: number; token: string; createdAt: string }>(
    `SELECT id, token, created_at AS "createdAt" FROM table_qr_codes
     WHERE table_id = $1 AND status = 'active'`,
    [tableId],
  );
  if (existing) return existing;
  return createQr(tableId, staffId);
}

async function createQr(tableId: number, staffId?: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = crypto.randomBytes(16).toString('base64url');
    const clash = await one('SELECT 1 FROM table_qr_codes WHERE token = $1', [token]);
    if (clash) continue;
    const row = await one<{ id: number; token: string; createdAt: string }>(
      `INSERT INTO table_qr_codes (table_id, token, created_by)
       VALUES ($1,$2,$3) RETURNING id, token, created_at AS "createdAt"`,
      [tableId, token, staffId ?? null],
    );
    return row!;
  }
  throw new Error('Could not allocate a QR token');
}

export async function regenerateQr(tableId: number, staffId?: number) {
  await query(
    `UPDATE table_qr_codes SET status = 'revoked', revoked_at = now()
     WHERE table_id = $1 AND status = 'active'`,
    [tableId],
  );
  return createQr(tableId, staffId);
}

export async function revokeQr(tableId: number) {
  await query(
    `UPDATE table_qr_codes SET status = 'revoked', revoked_at = now()
     WHERE table_id = $1 AND status = 'active'`,
    [tableId],
  );
}

const qrOptions = {
  errorCorrectionLevel: 'M' as const,
  margin: 2,
  color: { dark: '#15120C', light: '#F7F1E6' },
};

export async function qrDataUrl(url: string) {
  return QRCode.toDataURL(url, { ...qrOptions, width: 640 });
}

export async function qrPng(url: string, width = 1024) {
  return QRCode.toBuffer(url, { ...qrOptions, width });
}

export async function qrSvg(url: string) {
  return QRCode.toString(url, { ...qrOptions, type: 'svg', width: 1024 });
}
