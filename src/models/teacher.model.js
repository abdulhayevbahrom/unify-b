import mongoose from 'mongoose';

const teacherSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "O'qituvchi F.I.Sh kiritilishi kerak"],
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    subject: {
      type: String,
      required: [true, 'Fan kiritilishi kerak'],
      trim: true,
      maxlength: 80,
    },
    phone: {
      type: String,
      required: [true, 'Telefon raqam kiritilishi kerak'],
      trim: true,
      maxlength: 32,
      unique: true,
    },
    telegram: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    gender: {
      type: String,
      enum: ['male', 'female'],
      default: 'male',
    },
    experienceYears: {
      type: Number,
      min: 0,
      max: 60,
      default: 0,
    },
    monthlySalary: {
      type: Number,
      min: 0,
      default: 0,
    },
    salaryType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    salaryPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
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
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

teacherSchema.index(
  { telegram: 1 },
  {
    unique: true,
    partialFilterExpression: { telegram: { $type: 'string', $ne: '' } },
  },
);

export const Teacher = mongoose.model('Teacher', teacherSchema);
