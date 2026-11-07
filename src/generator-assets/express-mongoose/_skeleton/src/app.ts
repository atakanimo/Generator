import express from 'express';

import '@config/i18n';

import {
  corsMiddleware,
  errorHandler,
  i18nMiddleware,
  notFoundHandler,
  requestContextMiddleware,
  requestIdMiddleware
} from '@middlewares';
import authRoutes from '@modules/auth/auth.routes';
import healthRoutes from '@modules/health/health.routes';

/**
 * HTTP uygulaması (sunucu `src/index.ts`'te açılır; testler de bunu kullanır).
 * Generator üretilen router'ları buraya bağlar: import + son `app.use('/…', …)` satırının altına `app.use(...)`
 * (admin: `/api/<modül>/admin`). Router bağlamaları 404 / hata handler'larından önce kalmalı.
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(requestContextMiddleware);
  app.use(i18nMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
