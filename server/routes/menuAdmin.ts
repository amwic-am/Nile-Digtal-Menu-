import { Router } from 'express';
import { requireRoles } from '../auth.js';
import { one, query } from '../db.js';
import { emitTo } from '../realtime.js';

export const menuAdminRouter = Router();

menuAdminRouter.get('/menu', async (_req, res) => {
  const [categories, stats] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT c.id, c.name, c.name_am AS "nameAm", c.description, c.sort,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', m.id, 'categoryId', m.category_id, 'name', m.name, 'nameAm', m.name_am,
                  'description', m.description, 'price', m.price::float8, 'image', m.image,
                  'available', m.is_available, 'isSignature', m.is_signature, 'arEnabled', m.ar_enabled,
                  'spiceLevel', m.spice_level, 'prepMinutes', m.prep_minutes, 'tags', m.tags, 'sort', m.sort
                ) ORDER BY m.sort, m.id)
                FROM menu_items m WHERE m.category_id = c.id
              ), '[]'::json) AS items
       FROM menu_categories c
       WHERE c.restaurant_id = 1
       ORDER BY c.sort, c.id`,
    ),
    one<{ items: number; available: number; avgPrice: number; categories: number }>(
      `SELECT COUNT(*)::int AS items,
              COUNT(*) FILTER (WHERE is_available)::int AS available,
              COALESCE(AVG(price),0)::float8 AS "avgPrice",
              (SELECT COUNT(*)::int FROM menu_categories WHERE restaurant_id = 1) AS categories
       FROM menu_items WHERE restaurant_id = 1`,
    ),
  ]);
  res.json({ categories, stats: stats ?? { items: 0, available: 0, avgPrice: 0, categories: 0 } });
});

function cleanImage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 600) return null;
  if (value.startsWith('/')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

menuAdminRouter.post(
  '/menu/items',
  requireRoles('super_admin', 'manager'),
  async (req, res) => {
    const b = req.body ?? {};
    const name = String(b.name ?? '').trim();
    const nameAm = String(b.nameAm ?? '').trim();
    const description = String(b.description ?? '').trim();
    const categoryId = Number(b.categoryId);
    const price = Number(b.price);
    const image = cleanImage(b.image);
    const tags = String(b.tags ?? '').trim();

    if (name.length < 2 || name.length > 120) {
      res.status(400).json({ error: 'Dish name must be between 2 and 120 characters' });
      return;
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      res.status(400).json({ error: 'Choose a menu category' });
      return;
    }
    if (!Number.isFinite(price) || price <= 0 || price > 100000) {
      res.status(400).json({ error: 'Price must be a positive amount' });
      return;
    }
    if (!image) {
      res.status(400).json({ error: 'Add a dish image — pick a preset or paste an image URL' });
      return;
    }
    const category = await one<{ id: number }>(
      'SELECT id FROM menu_categories WHERE id = $1 AND restaurant_id = 1',
      [categoryId],
    );
    if (!category) {
      res.status(400).json({ error: 'That category no longer exists' });
      return;
    }

    const spiceLevel = Math.min(3, Math.max(0, Math.floor(Number(b.spiceLevel ?? 0)) || 0));
    const prepMinutes = Math.min(180, Math.max(1, Math.floor(Number(b.prepMinutes ?? 15)) || 15));
    const sort = Math.floor(Number(b.sort ?? 0)) || 0;

    const item = await one(
      `INSERT INTO menu_items
         (restaurant_id, category_id, name, name_am, description, price, image,
          is_available, is_signature, ar_enabled, spice_level, prep_minutes, tags, sort)
       VALUES (1, $1, $2, NULLIF($3,''), NULLIF($4,''), $5, $6, $7, $8, $9, $10, $11, NULLIF($12,''), $13)
       RETURNING id, name, name_am AS "nameAm", description, price::float8 AS price, image,
                 is_available AS available, is_signature AS "isSignature", ar_enabled AS "arEnabled",
                 spice_level AS "spiceLevel", prep_minutes AS "prepMinutes", tags, category_id AS "categoryId"`,
      [categoryId, name, nameAm, description, price, image,
        b.available !== false, b.isSignature === true, b.arEnabled !== false, spiceLevel, prepMinutes, tags, sort],
    );

    emitTo('staff', 'menu:updated', { itemId: item?.id });
    res.status(201).json({ item });
  },
);

menuAdminRouter.patch(
  '/menu/items/:id',
  requireRoles('super_admin', 'manager'),
  async (req, res) => {
    const id = Number(req.params.id);
    const available = req.body?.available;
    if (!Number.isInteger(id) || typeof available !== 'boolean') {
      res.status(400).json({ error: 'Invalid availability update' });
      return;
    }
    const item = await one(
      `UPDATE menu_items SET is_available = $1 WHERE id = $2 AND restaurant_id = 1
       RETURNING id, is_available AS available`,
      [available, id],
    );
    if (!item) {
      res.status(404).json({ error: 'Dish not found' });
      return;
    }
    emitTo('staff', 'menu:updated', { itemId: id });
    res.json({ item });
  },
);
