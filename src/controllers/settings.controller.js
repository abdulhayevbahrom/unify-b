import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { BrandingSettings } from '../models/branding-settings.model.js';

const uploadsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/branding');
const allowedImageTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const defaultSettings = {
  unify: { name: 'Unify', subtitle: 'Boshqaruv tizimi', logoUrl: '' },
  accounting: { name: 'Yagona buxgalteriya', subtitle: 'Buxgalteriya kurslari', logoUrl: '' },
};

async function getSettingsDocument() {
  return BrandingSettings.findOneAndUpdate(
    { key: 'branding' },
    { $setOnInsert: { key: 'branding', ...defaultSettings } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );
}

function normalizeBrand(value, current) {
  return {
    name: value?.name?.trim() || current.name,
    subtitle: value?.subtitle?.trim() || '',
    logoUrl: current.logoUrl,
  };
}

async function removeManagedLogo(logoUrl) {
  if (!logoUrl?.startsWith('/uploads/branding/')) return;

  const fileName = path.basename(logoUrl);
  await unlink(path.join(uploadsRoot, fileName)).catch(() => undefined);
}

export async function getBrandingSettings(_req, res) {
  try {
    return res.json(await getSettingsDocument());
  } catch (error) {
    return res.status(500).json({ message: 'Brending sozlamalarini olishda xatolik', error: error.message });
  }
}

export async function updateBrandingSettings(req, res) {
  try {
    const settings = await getSettingsDocument();
    settings.unify = normalizeBrand(req.body.unify, settings.unify);
    settings.accounting = normalizeBrand(req.body.accounting, settings.accounting);
    await settings.save();
    return res.json(settings);
  } catch (error) {
    return res.status(400).json({ message: 'Brending sozlamalarini saqlab bo‘lmadi', error: error.message });
  }
}

export async function uploadBrandLogo(req, res) {
  try {
    const brandKey = req.params.brand;
    const contentType = req.headers['content-type']?.split(';')[0];
    const extension = allowedImageTypes.get(contentType);

    if (!['unify', 'accounting'].includes(brandKey)) {
      return res.status(400).json({ message: 'Noto‘g‘ri brend tanlandi' });
    }

    if (!extension || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'PNG, JPG yoki WEBP rasm yuboring' });
    }

    if (process.env.VERCEL) {
      return res.status(503).json({ message: 'Vercelda logo yuklash uchun tashqi fayl saqlash xizmati kerak' });
    }

    const settings = await getSettingsDocument();
    const previousLogoUrl = settings[brandKey].logoUrl;
    const fileName = `${brandKey}-${randomUUID()}.${extension}`;
    await mkdir(uploadsRoot, { recursive: true });
    await writeFile(path.join(uploadsRoot, fileName), req.body);

    settings[brandKey].logoUrl = `/uploads/branding/${fileName}`;
    settings.markModified(brandKey);
    await settings.save();
    await removeManagedLogo(previousLogoUrl);
    return res.json(settings);
  } catch (error) {
    return res.status(500).json({ message: 'Logoni yuklab bo‘lmadi', error: error.message });
  }
}
