import { Router } from 'express';
import { AtaResponse } from '@core/response/response.helper';
import { isMongoConnected } from '@db/connection';

const router: Router = Router();

/** `GET /api/health`: sözleşme zarfıyla `{ status, environment, mongoConnected }` (auth yok). */
router.get('/health', (_req, res) => {
  AtaResponse(res, {
    isSuccess: true,
    data: { status: 'ok', environment: process.env.NODE_ENV ?? 'development', mongoConnected: isMongoConnected() },
    errorData: null,
    uiMessage: null
  });
});

export default router;
