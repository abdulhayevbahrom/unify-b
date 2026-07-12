import mongoose from 'mongoose';

const extraLessonSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 480, default: 60 },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    fee: { type: Number, required: true, min: 1000 },
    paidAmount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.studentId = ret.studentId?.toString();
        ret.groupId = ret.groupId?.toString();
        ret.createdBy = ret.createdBy?.toString() || null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

extraLessonSchema.index({ studentId: 1, scheduledAt: -1 });
extraLessonSchema.index({ groupId: 1, scheduledAt: -1 });
extraLessonSchema.index({ status: 1, scheduledAt: -1 });

export const ExtraLesson = mongoose.model('ExtraLesson', extraLessonSchema);
