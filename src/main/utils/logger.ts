import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

/**
 * Get the Generator project root directory
 */
function getGeneratorRoot(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;

  if (isDev) {
    const __filename = fileURLToPath(import.meta.url);
    let currentDir = dirname(__filename);

    while (currentDir !== dirname(currentDir)) {
      const packageJsonPath = join(currentDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        return currentDir;
      }
      currentDir = dirname(currentDir);
    }

    return join(dirname(__filename), '..', '..');
  } else {
    return app.getAppPath();
  }
}

/**
 * Get the logs directory path
 */
function getLogsDir(): string {
  const generatorRoot = getGeneratorRoot();
  const logsDir = join(generatorRoot, 'logs');

  // Create logs directory if it doesn't exist
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  return logsDir;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current timestamp in HH:MM:SS format
 */
function getCurrentTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Log a generate operation
 * @param fileName - Name of the generated file
 * @param filePath - Full path of the generated file
 * @param error - Optional error message
 */
export function logGenerate(fileName: string, filePath: string, error?: string): void {
  try {
    const logsDir = getLogsDir();
    const today = getTodayDate();
    const logFilePath = join(logsDir, `${today}.log`);
    const timestamp = getCurrentTime();

    let logEntry = `[${timestamp}] Generate: ${fileName} | Path: ${filePath}`;

    if (error) {
      logEntry += ` | Error: ${error}`;
    }

    logEntry += '\n';

    appendFileSync(logFilePath, logEntry, 'utf-8');
  } catch (err) {
    // Silently fail if logging fails to avoid breaking the main functionality
  }
}

/**
 * Log multiple generate operations at once
 * @param operations - Array of generate operations to log
 */
export function logGenerates(operations: Array<{ fileName: string; filePath: string; error?: string }>): void {
  try {
    const logsDir = getLogsDir();
    const today = getTodayDate();
    const logFilePath = join(logsDir, `${today}.log`);
    const timestamp = getCurrentTime();

    let logEntries = '';
    for (const op of operations) {
      let logEntry = `[${timestamp}] Generate: ${op.fileName} | Path: ${op.filePath}`;
      if (op.error) {
        logEntry += ` | Error: ${op.error}`;
      }
      logEntries += logEntry + '\n';
    }

    appendFileSync(logFilePath, logEntries, 'utf-8');
  } catch (err) {
    // Silently fail if logging fails
  }
}

/**
 * Log a general message to the log file
 * @param message - Message to log
 * @param level - Log level (info, error, warn)
 */
export function log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  try {
    const logsDir = getLogsDir();
    const today = getTodayDate();
    const logFilePath = join(logsDir, `${today}.log`);
    const timestamp = getCurrentTime();

    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    appendFileSync(logFilePath, logEntry, 'utf-8');
  } catch (err) {
    // Silently fail if logging fails
  }
}
