import dotenv from 'dotenv';
import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocket } from './socket.js';
import { startBalanceMaintenance } from './services/balance-maintenance.service.js';

dotenv.config();

const port = process.env.PORT || 4000;

async function bootstrap() {
  try {
    const db = await connectDB();
    await startBalanceMaintenance();
    const server = createServer(app);

    initSocket(server);

    server.listen(port, () => {
      console.log(`MongoDB ulandi: ${db.name}`);
      console.log(`API server http://localhost:${port} da ishga tushdi`);
    });
  } catch (error) {
    console.error('Server ishga tushmadi. MongoDB ulanishida xatolik:', error.message);
    process.exit(1);
  }
}

bootstrap();
