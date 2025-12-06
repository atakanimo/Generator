import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, cpSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';

const buildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  external: ['electron'],
  sourcemap: isDev,
  minify: !isDev,
};

// Build main process
build({
  ...buildOptions,
  entryPoints: [join(__dirname, 'src/main/index.ts')],
  outfile: join(__dirname, 'dist-electron/main.js'),
}).catch(() => process.exit(1));

// Build preload script
build({
  ...buildOptions,
  entryPoints: [join(__dirname, 'src/preload/index.ts')],
  outfile: join(__dirname, 'dist-electron/preload.js'),
  format: 'cjs', // Preload scripts should be CommonJS
}).catch(() => process.exit(1));

// Copy templates directory
const templatesSrc = join(__dirname, 'src/main/templates');
const templatesDest = join(__dirname, 'dist-electron/main/templates');
if (existsSync(templatesSrc)) {
  if (!existsSync(templatesDest)) {
    mkdirSync(templatesDest, { recursive: true });
  }
  cpSync(templatesSrc, templatesDest, { recursive: true });
  console.log('Templates copied to dist-electron/main/templates');
}

