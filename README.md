# SAB backend

Express API local serverda ham, Vercel Function sifatida ham ishlaydi.

## Vercelga joylash

1. Vercelda yangi project oching va `backend` papkasini Root Directory sifatida tanlang.
2. Build Command va Output Directory maydonlarini bo'sh qoldiring. Vercel `src/app.js` dagi Express exportni avtomatik aniqlaydi.
3. Environment Variables bo'limiga quyidagilarni kiriting:

   - `MONGODB_URI` - MongoDB Atlas connection string
   - `MONGODB_DB_NAME` - masalan, `sab_center`
   - `AUTH_SECRET` - uzun va o'zgarmaydigan tasodifiy qiymat
   - `CRON_SECRET` - `AUTH_SECRET`dan boshqa uzun tasodifiy qiymat

4. Deploy qiling va `https://<project>.vercel.app/api/health` manzilini tekshiring.
5. Frontenddagi `VITE_API_BASE_URL`ni `https://<project>.vercel.app/api` qilib belgilang.

Secret yaratish uchun:

```bash
openssl rand -base64 48
```

## Vaqtinchalik Vercel cheklovlari

- Socket.IO doimiy WebSocket ulanishi Vercel Functions ichida ishlamaydi. REST API ishlaydi, ammo real-time notification uchun keyinchalik oddiy server yoki alohida realtime provider kerak.
- `uploads` papkasi Vercelda doimiy storage emas. Logo upload vaqtinchalik o'chiriladi; production uchun S3, Cloudinary yoki Vercel Blob ulash kerak.
- Balanslarni davriy yangilash `vercel.json` ichidagi himoyalangan Cron orqali kuniga bir marta ishlaydi. Bu Vercel Hobby tarifiga mos; oddiy serverda mavjud 6 soatlik interval ishlashda davom etadi.

## Oddiy server

```bash
npm install
npm start
```

Oddiy serverga o'tilganda Socket.IO, lokal upload va background interval avvalgidek ishlaydi.
