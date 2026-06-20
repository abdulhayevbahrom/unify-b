import { Server } from 'socket.io';
import { User } from './models/user.model.js';
import { verifyToken } from './utils/auth.js';

let ioInstance = null;

export function initSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: '*',
    },
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Token talab qilinadi'));
      }

      const payload = verifyToken(token);
      const user = await User.findById(payload.sub);

      if (!user || user.status !== 'active') {
        return next(new Error('Sessiya faol emas'));
      }

      socket.user = {
        id: user._id.toString(),
        role: user.role,
      };
      socket.join(`role:${user.role}`);
      socket.join(`user:${user._id.toString()}`);

      return next();
    } catch (error) {
      return next(error);
    }
  });

  return ioInstance;
}

export function emitToRole(role, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(`role:${role}`).emit(event, payload);
}
