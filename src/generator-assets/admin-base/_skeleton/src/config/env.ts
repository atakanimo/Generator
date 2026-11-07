export type AppEnv = 'prod' | 'test';

export const getAppEnv = (): AppEnv => {
  const env = import.meta.env.VITE_APP_ENV;
  if (env === 'prod' || env === 'test') {
    return env;
  }
  return import.meta.env.PROD ? 'prod' : 'test';
};

export const getAppEnvLabel = (env: AppEnv): string => (env === 'prod' ? 'Production' : 'Test');
