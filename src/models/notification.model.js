import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['owner', 'admin', 'reception'],
      default: 'owner',
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['cash_closure', 'system'],
      default: 'system',
    },
    status: {
      type: String,
      enum: ['unread', 'read'],
      default: 'unread',
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        ret.relatedId = ret.relatedId?.toString() || null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

notificationSchema.index({ role: 1, status: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
