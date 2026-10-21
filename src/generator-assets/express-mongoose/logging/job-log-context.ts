import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

type JobLogStore = {
  jobName: string;
  correlationId: string;
};

const jobLogStorage = new AsyncLocalStorage<JobLogStore>();

/**
 * Cron / arka plan işlerinde HTTP `requestId` yok; Pino alanları **job** + **correlationId** (tasks §14.1).
 */
export function runWithJobLogContext<T>(jobName: string, fn: () => T): T;
export function runWithJobLogContext<T>(jobName: string, fn: () => Promise<T>): Promise<T>;
export function runWithJobLogContext<T>(jobName: string, fn: () => T | Promise<T>): T | Promise<T> {
  const store: JobLogStore = { jobName, correlationId: randomUUID() };
  return jobLogStorage.run(store, fn);
}

export function getJobLogContext(): JobLogStore | undefined {
  return jobLogStorage.getStore();
}
