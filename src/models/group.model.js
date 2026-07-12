import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Guruh nomi kiritilishi kerak'],
      trim: true,
      minlength: 2,
      maxlength: 80,
      unique: true,
    },
    subject: {
      type: String,
      required: [true, 'Fan kiritilishi kerak'],
      trim: true,
      maxlength: 80,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: [true, "O'qituvchi tanlanishi kerak"],
    },
    room: {
      type: String,
      required: [true, 'Xona kiritilishi kerak'],
      trim: true,
      maxlength: 40,
    },
    lessonDays: {
      type: [String],
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Kamida bitta dars kuni tanlanishi kerak',
      },
    },
    startTime: {
      type: String,
      required: [true, 'Boshlanish vaqti tanlanishi kerak'],
      trim: true,
      maxlength: 10,
    },
    endTime: {
      type: String,
      required: [true, 'Tugash vaqti tanlanishi kerak'],
      trim: true,
      maxlength: 10,
    },
    startDate: {
      type: Date,
      required: [true, 'Dars boshlanish sanasi tanlanishi kerak'],
    },
    monthlyPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    priceHistory: [
      {
        price: {
          type: Number,
          required: true,
          min: 1,
        },
        startedAt: {
          type: Date,
          required: true,
          default: Date.now,
        },
        endedAt: {
          type: Date,
          default: null,
        },
        reason: {
          type: String,
          trim: true,
          maxlength: 300,
          default: '',
        },
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
    },
    endedAt: {
      type: Date,
      default: null,
    },
    isEnrollmentOpen: {
      type: Boolean,
      default: true,
    },
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
        ret.teacherId = ret.teacherId?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

groupSchema.index({ teacherId: 1 });

export const Group = mongoose.model('Group', groupSchema);
