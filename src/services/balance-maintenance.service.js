import { StudentMonthlyBalance } from '../models/student-monthly-balance.model.js';
import { Student } from '../models/student.model.js';
import { rebuildStudentBalances } from '../controllers/finance.controller.js';

let refreshRunning = false;

export async function refreshAllStudentBalances() {
  if (refreshRunning) return;
  refreshRunning = true;
  try {
    const studentIds = await Student.find({}, { _id: 1 }).lean();
    const batchSize = 20;
    for (let index = 0; index < studentIds.length; index += batchSize) {
      await Promise.all(studentIds.slice(index, index + batchSize).map((student) => rebuildStudentBalances(student._id)));
    }
  } catch (error) {
    console.error('Balanslarni background yangilashda xatolik:', error.message);
  } finally {
    refreshRunning = false;
  }
}

export async function startBalanceMaintenance() {
  await runBalanceMaintenance();
  const timer = setInterval(() => void refreshAllStudentBalances(), 6 * 60 * 60 * 1000);
  timer.unref();
}

export async function runBalanceMaintenance() {
  await StudentMonthlyBalance.syncIndexes();
  await refreshAllStudentBalances();
}
