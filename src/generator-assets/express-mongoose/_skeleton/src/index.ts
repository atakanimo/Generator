// Ortam değişkenleri diğer import'lardan önce yüklenir (modül düzeyinde env okuyanlar için).
import 'dotenv/config';

import { createApp } from '@/app';
import { requireJwtSecret } from '@config/env';
import { connectDB, isMongoConnected } from '@db/connection';
import { getAppLogger } from '@core/logging/logger';
import { seedAuth } from '@modules/auth/auth.seed';

requireJwtSecret();

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  getAppLogger().info({ event: 'server.listening', port }, `__App__ API http://localhost:${port}/api/health`);
});

// Mongo kapalıyken de uygulama açılır; sağlık ucu `mongoConnected: false` döner. Bağlanınca ilk admin kurulur.
void connectDB().then(async () => {
  if (!isMongoConnected()) return;
  try {
    await seedAuth();
  } catch (error) {
    getAppLogger().error({ err: error, event: 'auth.seed-failed' }, 'İlk admin kurulamadı');
  }
});
