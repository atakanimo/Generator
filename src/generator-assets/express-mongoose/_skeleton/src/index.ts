// Ortam değişkenleri diğer import'lardan önce yüklenir (modül düzeyinde env okuyanlar için).
import 'dotenv/config';

import { createApp } from '@/app';
import { requireJwtSecret } from '@config/env';
import { connectDB } from '@db/connection';
import { getAppLogger } from '@core/logging/logger';

requireJwtSecret();

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  getAppLogger().info({ event: 'server.listening', port }, `__App__ API http://localhost:${port}/api/health`);
});

// Mongo kapalıyken de uygulama açılır; sağlık ucu `mongoConnected: false` döner.
void connectDB();
