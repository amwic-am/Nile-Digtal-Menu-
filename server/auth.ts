import type { NextFunction, Request, Response } from 'express';
import { one, withTx } from './db.js';
import { supabaseAuth } from './supabase.js';

export type Role =
  | 'super_admin'
  | 'manager'
  | 'receptionist'
  | 'waiter'
  | 'cashier'
  | 'chef'
  | 'auditor';

export type StaffUser = {
  id: number;
  restaurant_id: number;
  name: string;
  email: string;
  role: Role;
};

export type AuthedRequest = Request & { staff: StaffUser };

async function bootstrapConfiguredSuperAdmin(authUser: { id: string; email: string; user_metadata?: Record<string, unknown> }) {
  const configuredEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail || authUser.email.toLowerCase() !== configuredEmail) return null;

  const fullName = authUser.user_metadata?.full_name;
  const name = typeof fullName === 'string' && fullName.trim()
    ? fullName.trim().slice(0, 80)
    : 'Abel Mesfin';

  return withTx(async (q) => {
    await q('SELECT pg_advisory_xact_lock(4310, 1)');
    const alreadyLinked = await q<StaffUser & { is_active: boolean }>(
      `SELECT id, restaurant_id, name, email, role, is_active
       FROM staff WHERE auth_user_id = $1 FOR UPDATE`,
      [authUser.id],
    );
    if (alreadyLinked[0]?.is_active) return alreadyLinked[0];

    const byEmail = await q<StaffUser & { is_active: boolean; auth_user_id: string | null }>(
      `SELECT id, restaurant_id, name, email, role, is_active, auth_user_id
       FROM staff WHERE lower(email) = $1 FOR UPDATE`,
      [configuredEmail],
    );
    if (byEmail[0] && (!byEmail[0].auth_user_id || byEmail[0].auth_user_id === authUser.id)) {
      const promoted = await q<StaffUser & { is_active: boolean }>(
        `UPDATE staff
         SET auth_user_id = $1, role = 'super_admin', is_active = true
         WHERE id = $2
         RETURNING id, restaurant_id, name, email, role, is_active`,
        [authUser.id, byEmail[0].id],
      );
      return promoted[0] ?? null;
    }

    const admins = await q<{ id: number; auth_user_id: string | null }>(
      "SELECT id, auth_user_id FROM staff WHERE role = 'super_admin' ORDER BY id FOR UPDATE",
    );
    if (admins.length === 1 && (!admins[0].auth_user_id || admins[0].auth_user_id === authUser.id)) {
      const promoted = await q<StaffUser & { is_active: boolean }>(
        `UPDATE staff
         SET email = $1, auth_user_id = $2, role = 'super_admin', is_active = true
         WHERE id = $3
         RETURNING id, restaurant_id, name, email, role, is_active`,
        [authUser.email, authUser.id, admins[0].id],
      );
      return promoted[0] ?? null;
    }

    if (admins.length === 0) {
      const restaurant = await q<{ id: number }>(
        'SELECT id FROM restaurants ORDER BY id LIMIT 1 FOR UPDATE',
      );
      if (!restaurant[0]) return null;
      const inserted = await q<StaffUser & { is_active: boolean }>(
        `INSERT INTO staff (restaurant_id, name, email, auth_user_id, role, is_active)
         VALUES ($1, $2, $3, $4, 'super_admin', true)
         RETURNING id, restaurant_id, name, email, role, is_active`,
        [restaurant[0].id, name, authUser.email, authUser.id],
      );
      return inserted[0] ?? null;
    }

    return null;
  });
}

async function authenticateAccessToken(token: string) {
  const { data, error } = await supabaseAuth.auth.getUser(token);
  const authUser = data.user;
  const authEmail = authUser?.email;
  if (error || !authUser || !authEmail) return { tokenValid: false, staff: null };

  const staff = await one<StaffUser & { is_active: boolean; auth_user_id: string | null }>(
    `SELECT id, restaurant_id, name, email, role, is_active, auth_user_id
     FROM staff
     WHERE auth_user_id = $1 OR (auth_user_id IS NULL AND lower(email) = lower($2))
     ORDER BY CASE WHEN auth_user_id = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [authUser.id, authEmail],
  );

  let resolved: (StaffUser & { is_active: boolean; auth_user_id?: string | null }) | null = staff;
  if (!resolved?.is_active || resolved.role !== 'super_admin'
      && authEmail.toLowerCase() === process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()) {
    resolved = await bootstrapConfiguredSuperAdmin({
      id: authUser.id,
      email: authEmail,
      user_metadata: authUser.user_metadata,
    }) ?? resolved;
  }
  if (!resolved?.is_active) return { tokenValid: true, staff: null };

  if (!resolved.auth_user_id) {
    const linked = await one<{ id: number }>(
      'UPDATE staff SET auth_user_id = $1 WHERE id = $2 AND auth_user_id IS NULL RETURNING id',
      [authUser.id, resolved.id],
    );
    if (!linked) return { tokenValid: true, staff: null };
  } else if (resolved.auth_user_id !== authUser.id) {
    return { tokenValid: true, staff: null };
  }

  return {
    tokenValid: true,
    staff: {
      id: resolved.id,
      restaurant_id: resolved.restaurant_id,
      name: resolved.name,
      email: resolved.email,
      role: resolved.role,
    },
  };
}

export async function getStaffFromAccessToken(token: string): Promise<StaffUser | null> {
  return (await authenticateAccessToken(token)).staff;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const { staff, tokenValid } = await authenticateAccessToken(header.slice(7));
  if (!tokenValid) {
    res.status(401).json({ error: 'Session expired, please sign in again' });
    return;
  }
  if (!staff) {
    res.status(401).json({ error: 'This Supabase account is not linked to an active staff account.' });
    return;
  }
  (req as AuthedRequest).staff = staff;
  next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const staff = (req as AuthedRequest).staff;
    if (!staff || !roles.includes(staff.role)) {
      res.status(403).json({ error: 'You do not have permission for this action' });
      return;
    }
    next();
  };
}

export async function findStaffByEmail(email: string) {
  return one<{
    id: number;
    restaurant_id: number;
    name: string;
    email: string;
    role: Role;
    is_active: boolean;
  }>(
    'SELECT id, restaurant_id, name, email, role, is_active FROM staff WHERE lower(email) = lower($1)',
    [email],
  );
}
