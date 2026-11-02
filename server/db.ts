import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dataDir = process.env.PGDATA_DIR ?? path.resolve('.data/pgdata');
mkdirSync(dataDir, { recursive: true });

export const pg = new PGlite(dataDir);

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pg.query<T>(text, params as never[]);
  return res.rows;
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTx<T>(
  fn: (q: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  return pg.transaction(async (tx) => {
    const txQuery = async <R = Record<string, unknown>>(text: string, params: unknown[] = []) => {
      const res = await tx.query<R>(text, params as never[]);
      return res.rows;
    };
    return fn(txQuery);
  }) as Promise<T>;
}

export async function initDb() {
  const ddl = readFileSync(path.resolve('server/db/schema.sql'), 'utf8');
  await pg.exec(ddl);
}
