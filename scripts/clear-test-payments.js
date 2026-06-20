import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { CashClosure } from '../src/models/cash-closure.model.js';
import { Notification } from '../src/models/notification.model.js';
import { Payment } from '../src/models/payment.model.js';
import { StudentMonthlyBalance } from '../src/models/student-monthly-balance.model.js';
import { Student } from '../src/models/student.model.js';

dotenv.config();

if (!process.argv.includes('--confirm')) {
  console.error('Tozalash bekor qilindi. Ishga tushirish uchun --confirm talab qilinadi.');
  process.exit(1);
}

try {
  await connectDB();
  const [paymentsResult, closuresResult, notificationsResult] = await Promise.all([
    Payment.deleteMany({}),
    CashClosure.deleteMany({}),
    Notification.deleteMany({ type: 'cash_closure' }),
  ]);

  await StudentMonthlyBalance.updateMany({}, [
    {
      $set: {
        paidAmount: 0,
        advanceAppliedAmount: 0,
        debtAmount: '$chargedAmount',
        status: { $cond: [{ $gt: ['$chargedAmount', 0] }, 'unpaid', 'paid'] },
      },
    },
  ], { updatePipeline: true });
  await Student.updateMany({}, { $set: { advanceBalance: 0, paymentStatus: 'paid' } });
  const debtStudentIds = await StudentMonthlyBalance.distinct('studentId', { debtAmount: { $gt: 0 } });
  if (debtStudentIds.length) {
    await Student.updateMany({ _id: { $in: debtStudentIds } }, { $set: { paymentStatus: 'debt' } });
  }

  console.log(`Tozalandi: ${paymentsResult.deletedCount} ta to‘lov, ${closuresResult.deletedCount} ta kassa, ${notificationsResult.deletedCount} ta bildirishnoma.`);
  const [remainingPayments, remainingClosures] = await Promise.all([Payment.countDocuments(), CashClosure.countDocuments()]);
  console.log(`Bazadagi qoldiq: ${remainingPayments} ta to‘lov, ${remainingClosures} ta kassa.`);
} catch (error) {
  console.error('To‘lovlarni tozalashda xatolik:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
