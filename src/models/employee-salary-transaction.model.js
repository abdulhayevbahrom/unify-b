import mongoose from 'mongoose';

const employeeSalaryTransactionSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      enum: ['user', 'teacher'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    kind: {
      type: String,
      enum: ['salary', 'advance', 'salary_payment'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    paidAt: {
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.targetId = ret.targetId?.toString();
        ret.createdBy = ret.createdBy?.toString() || null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

employeeSalaryTransactionSchema.index({ targetType: 1, targetId: 1, month: 1 });
employeeSalaryTransactionSchema.index({ month: 1, kind: 1 });
employeeSalaryTransactionSchema.index({ paidAt: -1 });

export const EmployeeSalaryTransaction = mongoose.model('EmployeeSalaryTransaction', employeeSalaryTransactionSchema);
