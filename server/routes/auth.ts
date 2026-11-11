import { Router } from 'express';
import { authenticate } from '../auth.js';
import type { AuthedRequest } from '../auth.js';

export const authRouter = Router();

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: (req as AuthedRequest).staff });
});
