/**
 * Contract parity Express side (scripts/verify/contract-parity.mjs): Varlik360's HTTP app only — no cron jobs,
 * no Firebase, no real `.env` (run from a directory without one). Varlik360 sources are read, never changed.
 * `dotnet-e2e.mjs` copies it into an empty temp folder first: inside the Generator tree (`"type": "module"`) Node would
 * load it as ESM instead of through ts-node.
 *
 *   cp <this file> <empty dir>/host.ts && cd <empty dir> && env -i PATH=$PATH HOME=$HOME PORT=5092 MONGODB_URI=mongodb://localhost:27027/parity \
 *     JWT_SECRET=… ADMIN_USER_IDS=65f000000000000000000001 ISPRODUCTION=false MAIL_SERVICE_ENABLED=false \
 *     TS_NODE_PROJECT=$V/tsconfig.json TS_NODE_TRANSPILE_ONLY=true \
 *     node -r $V/node_modules/ts-node/register -r $V/node_modules/tsconfig-paths/register host.ts
 */
// Import order mirrors src/index.ts (module cycles depend on it).
import { connectDB } from '@db/connection';
import { logSystem } from '@helpers';
import { createApp } from '@/app';

void (async () => {
  await connectDB();
  createApp().listen(Number(process.env.PORT), () => logSystem('express parity host ready'));
})();
