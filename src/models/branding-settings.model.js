import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 100, required: true },
    subtitle: { type: String, trim: true, maxlength: 160, default: '' },
    logoUrl: { type: String, trim: true, default: '' },
    receiptFooter: { type: String, trim: true, maxlength: 160, default: 'To\'lovingiz uchun rahmat' },
  },
  { _id: false },
);

const brandingSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'branding', immutable: true },
    unify: { type: brandSchema, required: true },
    accounting: { type: brandSchema, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.key;
        return ret;
      },
    },
  },
);

export const BrandingSettings = mongoose.model('BrandingSettings', brandingSettingsSchema);
