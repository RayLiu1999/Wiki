import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const packageInfo = JSON.parse(readFileSync('node_modules/astro/package.json', 'utf8'));
const cli = path.resolve('node_modules/astro', packageInfo.bin.astro);
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
});
child.on('error', (error) => { console.error(error.message); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 1));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
