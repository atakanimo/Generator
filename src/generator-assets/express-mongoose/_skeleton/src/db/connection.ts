import mongoose from 'mongoose';
import { getAppLogger } from '@core/logging/logger';

/** Bağlantı hatası loglanır, süreç kapanmaz (sağlık ucu `mongoConnected: false`). */
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    getAppLogger().error({ event: 'mongo.config' }, 'MONGODB_URI ayarlı değil (.env)');
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    getAppLogger().info({ event: 'mongo.connected', database: mongoose.connection.db?.databaseName ?? 'unknown' });
  } catch (error) {
    getAppLogger().error({ err: error, event: 'mongo.connect-failed' }, 'MongoDB bağlantısı kurulamadı');
  }
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
