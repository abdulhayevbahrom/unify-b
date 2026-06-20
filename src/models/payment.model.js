import mongoose from 'mongoose';

const paymentAllocationSchema = new mongoose.Schema(
  {
    monthlyBalanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentMonthlyBalance',
      default: null,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      default: null,
    },
    month: {
      type: String,
      trim: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      default: '',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    method: {
      type: String,
      enum: ['cash', 'card', 'bank_transfer', 'click', 'payme', 'other'],
      required: true,
    },
    paidAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    allocations: {
      type: [paymentAllocationSchema],
      default: [],
    },
    advanceAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cashClosureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CashClosure',
      default: null,
    },
    cashStatus: {
      type: String,
      enum: ['open', 'pending_owner', 'approved', 'rejected'],
      default: 'open',
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
    status: {
      type: String,
      enum: ['active', 'cancelled', 'refunded'],
      default: 'active',
    },
    reversalReason: { type: String, trim: true, maxlength: 500, default: '' },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editHistory: [{
      amount: Number,
      method: String,
      paidAt: Date,
      note: String,
      editedAt: { type: Date, default: Date.now },
      editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    }],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.studentId = ret.studentId?.toString();
        ret.cashClosureId = ret.cashClosureId?.toString() || null;
        ret.createdBy = ret.createdBy?.toString() || null;
        ret.reversedBy = ret.reversedBy?.toString() || null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

paymentSchema.index({ studentId: 1, paidAt: -1 });
paymentSchema.index({ method: 1, paidAt: -1 });
paymentSchema.index({ cashClosureId: 1 });
paymentSchema.index({ cashStatus: 1, paidAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
