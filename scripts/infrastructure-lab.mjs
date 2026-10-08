import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'examples/infrastructure');
const composeFile = path.join(directory, 'compose.yaml');
const solution = path.join(directory, 'Infrastructure.slnx');
const mode = process.argv[2] ?? 'test';
const allowedKeys = new Set([
  'LAB_POSTGRES_USER', 'LAB_POSTGRES_PASSWORD', 'LAB_RABBITMQ_USER', 'LAB_RABBITMQ_PASSWORD',
  'LAB_POSTGRES_PORT', 'LAB_REDIS_PORT', 'LAB_RABBITMQ_PORT', 'LAB_RABBITMQ_MANAGEMENT_PORT',
]);
let settings;
try { settings = await readFile(path.join(directory, '.env'), 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  settings = await readFile(path.join(directory, '.env.example'), 'utf8');
}
const parsed = {};
for (const line of settings.split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  assert.ok(match && allowedKeys.has(match[1]), '實驗設定包含未知欄位；請依 .env.example 填寫。');
  parsed[match[1]] = match[2];
}
const cliHome = process.env.DOTNET_CLI_HOME ?? path.join(tmpdir(), 'devwiki-infrastructure-dotnet');
await mkdir(cliHome, { recursive: true });
const env = {
  ...parsed, ...process.env, DOTNET_CLI_HOME: cliHome,
  NUGET_PACKAGES: process.env.NUGET_PACKAGES ?? path.join(cliHome, 'packages'),
  DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
};
for (const key of ['LAB_POSTGRES_USER', 'LAB_POSTGRES_PASSWORD', 'LAB_RABBITMQ_USER', 'LAB_RABBITMQ_PASSWORD'])
  assert.ok(env[key], '缺少 ' + key);
const project = mode === 'test' ? 'devwiki-check-' + randomUUID().replaceAll('-', '').slice(0, 12) : 'devwiki-labs';
if (mode === 'test') {
  Object.assign(env, {
    LAB_POSTGRES_USER: 'wiki', LAB_POSTGRES_PASSWORD: 'test-' + randomUUID(),
    LAB_RABBITMQ_USER: 'wiki', LAB_RABBITMQ_PASSWORD: 'test-' + randomUUID(),
    LAB_POSTGRES_PORT: '0', LAB_REDIS_PORT: '0', LAB_RABBITMQ_PORT: '0', LAB_RABBITMQ_MANAGEMENT_PORT: '0',
  });
}

const dockerEnv = { ...env };
function command(binary, args, { capture = false, timeout = 180000, environment = env } = {}) {
  const result = spawnSync(binary, args, {
    cwd: root, env: environment, encoding: 'utf8', timeout, stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, binary + ' 執行失敗' + (capture ? '\n' + result.stderr : ''));
  return result.stdout?.trim();
}
const compose = (...args) => command('docker', ['compose', '--project-name', project, '--file', composeFile, ...args], {
  environment: dockerEnv, timeout: mode === 'redis-cli' ? 0 : 300000,
});
const compiled = (name) => path.join(directory, name, 'bin/Debug/net10.0', name + '.dll');
function build() {
  command('dotnet', ['restore', solution, '--locked-mode', '--disable-parallel']);
  command('dotnet', ['build', solution, '--no-restore', '--disable-build-servers', '-m:1']);
}
function dotnet(name, args = [], capture = false) {
  return command('dotnet', [compiled(name), ...args], { capture, timeout: ['OrderApi', 'OrderWorker'].includes(name) ? 0 : 180000 });
}
function resolvePorts() {
  for (const [key, service, port] of [
    ['LAB_REDIS_PORT', 'redis', '6379'],
    ['LAB_POSTGRES_PORT', 'postgres', '5432'],
    ['LAB_RABBITMQ_PORT', 'rabbitmq', '5672'],
    ['LAB_RABBITMQ_MANAGEMENT_PORT', 'rabbitmq', '15672'],
  ]) {
    const address = command('docker', ['compose', '-p', project, '-f', composeFile, 'port', service, port], { capture: true, environment: dockerEnv });
    const match = address.match(/^127\.0\.0\.1:(\d+)$/);
    assert.ok(match, '實驗服務必須只綁定本機且有獨立 port。');
    env[key] = match[1];
  }
}
async function waitForPorts() {
  for (const key of ['LAB_REDIS_PORT', 'LAB_POSTGRES_PORT', 'LAB_RABBITMQ_PORT']) {
    const deadline = Date.now() + 30000;
    let connected = false;
    while (!connected && Date.now() < deadline) {
      connected = await new Promise((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port: Number(env[key]) });
        const finish = (ready) => { socket.destroy(); resolve(ready); };
        socket.setTimeout(1000);
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.once('timeout', () => finish(false));
      });
      if (!connected) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(connected, key + ' 的本機連線未在期限內就緒。');
  }
}
function expectedDemo(name, expected) {
  assert.equal(dotnet(name, [], true).replace(/\r\n/g, '\n'), expected);
  console.log('✓ ' + name + ' 的預期輸出');
}
async function httpChecks() {
  const api = spawn('dotnet', [compiled('OrderApi'), '--urls', 'http://127.0.0.1:0'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let exited = false;
  api.stdout.on('data', (data) => { output += data.toString(); });
  api.stderr.on('data', (data) => { output += data.toString(); });
  api.on('exit', () => { exited = true; });
  let worker;
  try {
    const deadline = Date.now() + 20000;
    let match;
    while (!(match = output.match(/Now listening on:\s*(http:\/\/127\.0\.0\.1:\d+)/))) {
      assert.ok(!exited && Date.now() < deadline, '實驗 API 啟動失敗。\n' + output);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const url = match[1];
    const request = (pathname, options = {}) => fetch(new URL(pathname, url), { ...options, signal: AbortSignal.timeout(5000) });
    const json = (body, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await request('/products/2147483647')).status, 404);
    assert.equal((await request('/orders', json({ productId: 1, quantity: 0 }))).status, 400);
    assert.equal((await request('/orders', json({ productId: 2147483647, quantity: 1 }))).status, 404);
    assert.equal((await request('/products/1/price', json({ price: -1 }, 'PUT'))).status, 400);
    assert.equal((await request('/products/1/price', json({ price: 1.001 }, 'PUT'))).status, 400);
    assert.equal((await request('/products/1/price', json({}, 'PUT'))).status, 400);
    const created = await request('/orders', json({ productId: 1, quantity: 2 }));
    assert.equal(created.status, 201);
    const order = await created.json();
    assert.ok(order.orderId && order.messageId);
    const location = created.headers.get('location');
    const pending = await (await request(location)).json();
    assert.equal(pending.notificationRecorded, false);
    worker = spawn('dotnet', [compiled('OrderWorker')], { cwd: root, env, stdio: 'ignore' });
    let complete = false;
    const workDeadline = Date.now() + 15000;
    while (Date.now() < workDeadline) {
      const status = await (await request(location)).json();
      if (status.notificationRecorded) { complete = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(complete, 'API 建立的訂單應由獨立 Worker 記錄模擬通知。');
    console.log('✓ HTTP 輸入邊界、建立訂單、狀態查詢與獨立 Worker');
  } finally {
    await stop(worker);
    await stop(api);
  }
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

if (mode === 'up') {
  compose('up', '--detach', '--wait', '--wait-timeout', '120');
  resolvePorts();
  await waitForPorts();
  console.log('實驗環境已啟動；RabbitMQ 管理介面：http://127.0.0.1:' + env.LAB_RABBITMQ_MANAGEMENT_PORT + '/');
} else if (mode === 'down') {
  compose('down');
} else if (mode === 'redis-cli') {
  compose('exec', 'redis', 'redis-cli');
} else if (mode === 'test') {
  build();
  let failed = true;
  try {
    console.log('啟動隔離驗證環境：' + project);
    compose('up', '--detach', '--wait', '--wait-timeout', '120');
    resolvePorts();
    await waitForPorts();
    expectedDemo('RedisDemo', 'IDistributedCache: 商品快取\nHash: 商品名稱\nString TTL 已設定: True');
    expectedDemo('RabbitMqDemo', '發布確認: broker 已接收\n消費內容: 商品 1，數量 2\n消費確認: 已完成處理');
    dotnet('IntegrationChecks', ['initial']);
    compose('stop', 'redis');
    dotnet('IntegrationChecks', ['redis-down']);
    compose('up', '--detach', '--wait', '--wait-timeout', '120', 'redis');
    compose('restart', 'redis', 'rabbitmq');
    compose('up', '--detach', '--wait', '--wait-timeout', '120');
    resolvePorts();
    await waitForPorts();
    dotnet('IntegrationChecks', ['recovery']);
    await httpChecks();
    failed = false;
    console.log('Redis、RabbitMQ、PostgreSQL、HTTP 與重啟恢復驗證全部通過。');
  } finally {
    try { if (failed) compose('logs', '--no-color', '--tail', '30'); }
    finally { compose('down', '--volumes', '--remove-orphans'); }
  }
} else if (['redis', 'rabbit', 'api', 'worker'].includes(mode)) {
  resolvePorts();
  await waitForPorts();
  build();
  const name = { redis: 'RedisDemo', rabbit: 'RabbitMqDemo', api: 'OrderApi', worker: 'OrderWorker' }[mode];
  dotnet(name, mode === 'api' ? ['--urls', 'http://127.0.0.1:5080'] : []);
} else {
  throw new Error('指令必須是 up、down、redis-cli、redis、rabbit、api、worker 或 test。');
}
