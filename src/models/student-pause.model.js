import mongoose from 'mongoose';

const studentPauseSchema = new mongoose.Schema(
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
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'finished', 'cancelled'],
      default: 'active',
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

studentPauseSchema.index({ studentId: 1, status: 1 });
studentPauseSchema.index({ groupId: 1, startDate: 1 });

export const StudentPause = mongoose.model('StudentPause', studentPauseSchema);
