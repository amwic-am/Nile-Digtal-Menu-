import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { getStaffFromAccessToken } from './auth.js';
import { one } from './db.js';

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    socket.on('customer:join', async (payload: { qrToken?: string; sessionId?: number }) => {
      if (!payload?.qrToken || !payload?.sessionId) return;
      const row = await one<{ id: number }>(
        `SELECT s.id FROM table_sessions s
         JOIN dining_tables t ON t.id = s.table_id
         JOIN table_qr_codes q ON q.table_id = t.id AND q.status = 'active'
         WHERE s.id = $1 AND s.status = 'open' AND q.token = $2`,
        [payload.sessionId, payload.qrToken],
      );
      if (row) {
        socket.join(`table:${payload.sessionId}`);
        socket.emit('customer:joined', { sessionId: row.id });
      }
    });

    if (!token) return;
    void getStaffFromAccessToken(token)
      .then((staff) => {
        if (!staff || !socket.connected) return;
        socket.join('staff');
        if (['chef', 'manager', 'super_admin'].includes(staff.role)) socket.join('kitchen');
        if (['waiter', 'manager', 'super_admin'].includes(staff.role)) socket.join('service');
        if (['cashier', 'manager', 'super_admin'].includes(staff.role)) socket.join('cashier');
        socket.emit('staff:ready', { name: staff.name, role: staff.role });
      })
      .catch((error: unknown) => {
        console.error('[nile] could not authenticate realtime socket:', error);
        socket.disconnect(true);
      });
  });
}

export function emitTo(rooms: string | string[], event: string, payload: unknown) {
  if (!io) return;
  io.to(rooms).emit(event, payload);
}
