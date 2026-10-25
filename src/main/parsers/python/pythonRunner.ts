/**
 * Runs the PY7 helper scripts (`pythonScripts.ts`) with the host's interpreter: `<root>/.venv/bin/python` when the
 * host has one (it also has PyMongo), else `python3` / `python` on PATH. Isolated mode (`-I`); nothing of the host is
 * imported or executed.
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export function pythonInterpreter(root?: string): string {
  if (root) {
    for (const candidate of [join(root, '.venv', 'bin', 'python'), join(root, '.venv', 'Scripts', 'python.exe')]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

export interface PythonRun {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runPythonScript(
  script: string,
  args: string[],
  options: { root?: string; input?: string; env?: Record<string, string>; timeoutMs?: number } = {}
): PythonRun {
  const python = pythonInterpreter(options.root);
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  delete env.PYTHONPATH;
  delete env.PYTHONSTARTUP;
  const r = spawnSync(python, ['-I', '-c', script, ...args], {
    encoding: 'utf8',
    input: options.input,
    env,
    timeout: options.timeoutMs ?? 30_000,
    maxBuffer: 32 * 1024 * 1024
  });
  if (r.error) return { ok: false, stdout: '', stderr: `${python}: ${r.error.message}` };
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
