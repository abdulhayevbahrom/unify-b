import cors from 'cors';
import express from 'express';
import teachersRouter from './routes/teachers.routes.js';
import groupsRouter from './routes/groups.routes.js';
import studentsRouter from './routes/students.routes.js';
import financeRouter from './routes/finance.routes.js';
import expensesRouter from './routes/expenses.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';
import authRouter from './routes/auth.routes.js';
import usersRouter from './routes/users.routes.js';
import notificationsRouter from './routes/notifications.routes.js';
import settingsRouter from './routes/settings.routes.js';
import reportsRouter from './routes/reports.routes.js';
import extraLessonsRouter from './routes/extra-lessons.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, requireAnyPermission } from './middleware/auth.js';
import { notFound } from './middleware/notFound.js';
import { connectDB } from './config/db.js';
import { runBalanceMaintenance } from './services/balance-maintenance.service.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'oquv-markaz-api' });
});

app.use(async (_req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error('MongoDB ulanishida xatolik:', error.message);
    return res.status(503).json({ message: 'Ma’lumotlar bazasiga ulanib bo‘lmadi' });
  }
});

app.get('/api/cron/balances', async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Cron uchun ruxsat yo‘q' });
  }

  try {
    await runBalanceMaintenance();
    return res.json({ ok: true });
  } catch (error) {
    console.error('Balans cron xatosi:', error);
    return res.status(500).json({ message: 'Balanslarni yangilab bo‘lmadi' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/dashboard', authenticate, requireAnyPermission('dashboard'), dashboardRouter);
app.use('/api/notifications', authenticate, notificationsRouter);
app.use('/api/teachers', authenticate, requireAnyPermission('teachers', 'groups'), teachersRouter);
app.use(
  '/api/groups',
  authenticate,
  requireAnyPermission('groups', 'archived_groups', 'students', 'reception'),
  groupsRouter,
);
app.use('/api/students', authenticate, requireAnyPermission('students', 'reception', 'groups'), studentsRouter);
app.use('/api/finance', authenticate, requireAnyPermission('payments', 'students'), financeRouter);
app.use('/api/extra-lessons', authenticate, requireAnyPermission('payments', 'students'), extraLessonsRouter);
app.use('/api/expenses', authenticate, requireAnyPermission('expenses'), expensesRouter);
app.use('/api/users', authenticate, requireAnyPermission('employees'), usersRouter);
app.use('/api/reports', authenticate, requireAnyPermission('dashboard', 'payments', 'expenses'), reportsRouter);

app.use(notFound);

app.use((error, _req, res, _next) => {
  console.error('Kutilmagan server xatosi:', error);
  res.status(500).json({ message: 'Ichki server xatosi' });
});

export default app;
