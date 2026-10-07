import { readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const expected = JSON.parse(await readFile('examples/csharp/expected.json', 'utf8'));
const cliHome = path.join(tmpdir(), 'devwiki-dotnet');
await mkdir(cliHome, { recursive: true });
const env = {
  ...process.env,
  DOTNET_CLI_HOME: cliHome,
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  DOTNET_NOLOGO: '1',
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
  NUGET_PACKAGES: path.join(cliHome, 'packages'),
};
for (const [slug, output] of Object.entries(expected)) {
  const source = await readFile('src/content/docs/languages/csharp/' + slug + '.md', 'utf8');
  const code = source.match(/~~~csharp[^\n]*\n([\s\S]*?)\n~~~/)?.[1];
  assert.ok(code, slug + ' 缺少可執行範例');
  const examplePath = path.resolve('examples/csharp/' + slug + '.cs');
  assert.equal((await readFile(examplePath, 'utf8')).trim(), code.trim(), slug + ' 的文章與範例程式不一致');
  const result = spawnSync('dotnet', [
    'run', '--project', 'examples/csharp/Example.csproj',
    '-p:ExampleName=' + slug,
    '--artifacts-path', path.join(cliHome, 'artifacts'),
    '--disable-build-servers',
  ], { encoding: 'utf8', env, timeout: 90000 });
  assert.equal(result.status, 0, slug + ' 執行失敗\n' + result.stdout + '\n' + result.stderr);
  assert.equal(result.stdout.replace(/\r\n/g, '\n').trim(), output, slug + ' 的輸出與文章不一致');
  console.log('✓ ' + slug);
}
console.log('15 個 C# 範例的編譯、執行與預期輸出皆通過。');
