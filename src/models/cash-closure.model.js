import mongoose from 'mongoose';

function mapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}

const cashClosureSchema = new mongoose.Schema(
  {
    from: {
      type: Date,
      required: true,
    },
    to: {
      type: Date,
      required: true,
      default: Date.now,
    },
    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalsByMethod: {
      type: Map,
      of: Number,
      default: {},
    },
    paymentsCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    paymentIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Payment',
      default: [],
    },
    status: {
      type: String,
      enum: ['pending_owner', 'approved', 'rejected'],
      default: 'pending_owner',
    },
    ownerNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.paymentIds = ret.paymentIds?.map((id) => id.toString()) || [];
        ret.closedBy = ret.closedBy?.toString() || null;
        ret.totalsByMethod = mapToObject(ret.totalsByMethod);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

cashClosureSchema.index({ status: 1, createdAt: -1 });

export const CashClosure = mongoose.model('CashClosure', cashClosureSchema);
