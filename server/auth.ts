import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { one } from './db.js';

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

const JWT_SECRET = process.env.JWT_SECRET ?? 'nile-table-dev-secret';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

export function signToken(staff: StaffUser): string {
  return jwt.sign(
    { sub: staff.id, role: staff.role, name: staff.name, email: staff.email, rid: staff.restaurant_id },
    JWT_SECRET,
    { expiresIn: '12h' },
  );
}

export function verifyToken(token: string): StaffUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    return {
      id: Number(payload.sub),
      role: payload.role as Role,
      name: String(payload.name),
      email: String(payload.email),
      restaurant_id: Number(payload.rid),
    };
  } catch {
    return null;
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const staff = verifyToken(header.slice(7));
  if (!staff) {
    res.status(401).json({ error: 'Session expired, please sign in again' });
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
    password_hash: string;
    role: Role;
    is_active: boolean;
  }>('SELECT * FROM staff WHERE lower(email) = lower($1)', [email]);
}

export async function getStaff(id: number): Promise<StaffUser | null> {
  return one<StaffUser>(
    'SELECT id, restaurant_id, name, email, role FROM staff WHERE id = $1 AND is_active = true',
    [id],
  );
}
