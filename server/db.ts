import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, type QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Set it to your Supabase PostgreSQL connection string.');
}

export const pg = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pg.query<T>(text, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTx<T>(
  fn: (q: <R extends QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  const client = await pg.connect();
  try {
    await client.query('BEGIN');
    const txQuery = async <R extends QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []) => {
      const res = await client.query<R>(text, params as never[]);
      return res.rows;
    };
    const result = await fn(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[nile] failed to roll back database transaction:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function initDb() {
  const ddl = readFileSync(path.resolve('server/db/schema.sql'), 'utf8');
  await pg.query(ddl);
}
