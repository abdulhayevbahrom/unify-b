import mongoose from 'mongoose';

let connectionPromise = null;

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 0) {
    connectionPromise = null;
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGODB;

  if (!mongoUri) {
    throw new Error('MongoDB ulanish manzili topilmadi. .env ichida MONGODB yoki MONGODB_URI yozing.');
  }

  mongoose.set('strictQuery', true);

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB_NAME || 'sab_center',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  const connection = await connectionPromise;
  return connection.connection;
}
