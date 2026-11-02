import { Router } from 'express';
import { authenticate, findStaffByEmail, getStaff, signToken, verifyPassword } from '../auth.js';
import type { AuthedRequest } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const staff = await findStaffByEmail(email);
  if (!staff || !staff.is_active || !verifyPassword(password, staff.password_hash)) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }
  const user = {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    restaurant_id: staff.restaurant_id,
  };
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', authenticate, async (req, res) => {
  const staff = await getStaff((req as unknown as AuthedRequest).staff.id);
  if (!staff) {
    res.status(401).json({ error: 'Account is no longer active' });
    return;
  }
  res.json({ user: staff });
});
