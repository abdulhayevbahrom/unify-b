import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "O'quvchi F.I.Sh kiritilishi kerak"],
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    phone: {
      type: String,
      required: [true, 'Telefon raqam kiritilishi kerak'],
      trim: true,
      maxlength: 32,
      unique: true,
    },
    secondaryPhone: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    parentName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    parentPhone: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: [true, 'Guruh tanlanishi kerak'],
    },
    enrollments: [
      {
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
        startedAt: { type: Date, required: true, default: Date.now },
        endedAt: { type: Date, default: null },
        status: { type: String, enum: ['active', 'finished'], default: 'active' },
        discountType: { type: String, enum: ['none', 'percentage', 'fixed'], default: 'none' },
        discountValue: { type: Number, min: 0, default: 0 },
        discountReason: { type: String, trim: true, maxlength: 300, default: '' },
        discountHistory: [{
          type: { type: String, enum: ['percentage', 'fixed'], required: true },
          value: { type: Number, min: 0, required: true },
          reason: { type: String, trim: true, maxlength: 300, default: '' },
          startedAt: { type: Date, required: true, default: Date.now },
          endedAt: { type: Date, default: null },
        }],
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused', 'left'],
      default: 'active',
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'debt'],
      default: 'debt',
    },
    advanceBalance: {
      type: Number,
      min: 0,
      default: 0,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    enrollmentHistory: [
      {
        groupId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Group',
          required: true,
        },
        groupName: {
          type: String,
          required: true,
          trim: true,
        },
        subject: {
          type: String,
          required: true,
          trim: true,
        },
        startedAt: {
          type: Date,
          required: true,
        },
        endedAt: {
          type: Date,
          default: null,
        },
        endReason: {
          type: String,
          trim: true,
          default: '',
        },
      },
    ],
    note: {
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
        ret.groupId = ret.groupId?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

studentSchema.index({ groupId: 1 });
studentSchema.index({ status: 1, leftAt: -1 });

export const Student = mongoose.model('Student', studentSchema);
