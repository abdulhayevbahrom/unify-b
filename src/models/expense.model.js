import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    method: {
      type: String,
      enum: ['cash', 'card', 'bank_transfer', 'click', 'payme', 'other'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    spentAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    createdByName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: 'Esther Howard',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

expenseSchema.index({ spentAt: -1, createdAt: -1 });
expenseSchema.index({ category: 1, spentAt: -1 });
expenseSchema.index({ method: 1, spentAt: -1 });

export const Expense = mongoose.model('Expense', expenseSchema);
