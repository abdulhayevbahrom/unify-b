import { Expense } from '../models/expense.model.js';

const paymentMethods = ['cash', 'bank_transfer', 'click'];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildExpenseFilter(query) {
  const filter = {};

  if (query.search?.trim()) {
    const search = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
    filter.$or = [{ name: search }, { note: search }, { category: search }];
  }

  if (query.category?.trim()) {
    filter.category = query.category.trim();
  }

  if (paymentMethods.includes(query.method)) {
    filter.method = query.method;
  }

  if (query.dateFrom || query.dateTo) {
    filter.spentAt = {};

    if (query.dateFrom) {
      filter.spentAt.$gte = new Date(query.dateFrom);
    }

    if (query.dateTo) {
      filter.spentAt.$lte = new Date(query.dateTo);
    }
  }

  return filter;
}

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);

  return { page, limit, skip: (page - 1) * limit };
}

function normalizeExpensePayload(body, createdByName) {
  const payload = {
    name: body.name?.trim(),
    category: body.category?.trim(),
    method: body.method,
    amount: Number(body.amount),
    spentAt: body.spentAt || new Date(),
    note: body.note?.trim() || '',
  };

  if (createdByName) {
    payload.createdByName = createdByName;
  }

  return payload;
}

function emptyMethodTotals() {
  return Object.fromEntries(paymentMethods.map((method) => [method, 0]));
}

export async function getExpenses(req, res) {
  try {
    const filter = buildExpenseFilter(req.query);
    const { page, limit, skip } = getPagination(req.query);
    const [expenses, total, groupedTotals, categories] = await Promise.all([
      Expense.find(filter).sort({ spentAt: -1, createdAt: -1 }).skip(skip).limit(limit),
      Expense.countDocuments(filter),
      Expense.aggregate([
        { $match: filter },
        { $group: { _id: '$method', amount: { $sum: '$amount' } } },
      ]),
      Expense.distinct('category'),
    ]);
    const totalsByMethod = emptyMethodTotals();

    groupedTotals.forEach((item) => {
      totalsByMethod[item._id] = item.amount;
    });

    return res.json({
      data: expenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalAmount: Object.values(totalsByMethod).reduce((sum, amount) => sum + amount, 0),
        totalsByMethod,
      },
      categories: categories.filter(Boolean).sort((first, second) => first.localeCompare(second, 'uz')),
    });
  } catch (error) {
    return res.status(500).json({ message: "Xarajatlar ro'yxatini olishda xatolik", error: error.message });
  }
}

export async function createExpense(req, res) {
  try {
    const expense = await Expense.create(normalizeExpensePayload(req.body, req.user.fullName));
    return res.status(201).json(expense);
  } catch (error) {
    return res.status(400).json({ message: "Xarajat qo'shishda xatolik", error: error.message });
  }
}

export async function updateExpense(req, res) {
  try {
    const expense = await Expense.findByIdAndUpdate(req.params.id, normalizeExpensePayload(req.body), {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!expense) {
      return res.status(404).json({ message: 'Xarajat topilmadi' });
    }

    return res.json(expense);
  } catch (error) {
    return res.status(400).json({ message: 'Xarajatni yangilashda xatolik', error: error.message });
  }
}

export async function deleteExpense(req, res) {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: 'Xarajat topilmadi' });
    }

    return res.json({ message: "Xarajat o'chirildi", id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: "Xarajatni o'chirishda xatolik", error: error.message });
  }
}
