import mongoose from 'mongoose';

const studentMonthlyBalanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    month: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    monthlyPriceSnapshot: {
      type: Number,
      required: true,
      min: 0,
    },
    chargedAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    pauseDiscountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    courseDiscountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    paidAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    debtAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    advanceAppliedAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'overpaid'],
      default: 'unpaid',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.studentId = ret.studentId?.toString();
        ret.groupId = ret.groupId?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

studentMonthlyBalanceSchema.index({ studentId: 1, groupId: 1, month: 1 }, { unique: true });
studentMonthlyBalanceSchema.index({ groupId: 1, month: 1 });
studentMonthlyBalanceSchema.index({ debtAmount: 1 });

export const StudentMonthlyBalance = mongoose.model('StudentMonthlyBalance', studentMonthlyBalanceSchema);
