import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { npm, run } from './runtime.mjs'

export function installSmoke(tarball) {
  const directory = mkdtempSync(join(tmpdir(), 'frontcache-npm-install-'))
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'frontcache-consumer',
      private: true,
      type: 'module',
    }),
  )
  // 保留默认 lifecycle，验证 Axios/Zod 自动安装，开发工具不会进入生产依赖。
  npm(
    [
      'install',
      tarball,
      '--omit=dev',
      '--dry-run=false',
      '--json=false',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org/',
    ],
    { cwd: directory },
  )
  const require = createRequire(join(directory, 'smoke.mjs'))
  assert(require.resolve('axios'), '安装 frontcache 应自动安装 Axios')
  assert(require.resolve('zod'), '安装 frontcache 应自动安装 Zod')
  for (const dependency of ['husky', 'typescript'])
    assert.throws(
      () => require.resolve(dependency),
      `生产安装不应包含 ${dependency}`,
    )
  const installed = join(directory, 'node_modules/frontcache')
  const metadata = JSON.parse(
    readFileSync(join(installed, 'package.json'), 'utf8'),
  )
  assert(!metadata.private, '公开发布包不能是 private')
  assert.equal(metadata.license, 'MIT')
  assert.equal(metadata.dependencies.axios, '^1.20.0')
  assert.equal(metadata.dependencies.zod, '4.6.5')
  assert(
    !metadata.devDependencies?.zod &&
      !metadata.optionalDependencies?.zod &&
      !metadata.peerDependencies?.zod,
    'Zod 必须是运行依赖',
  )
  assert(
    !metadata.peerDependencies?.axios && !metadata.peerDependenciesMeta?.axios,
    'Axios 必须是自动安装的运行依赖',
  )
  assert(
    readFileSync(join(installed, 'LICENSE'), 'utf8').includes('MIT License'),
  )
  for (const name of readdirSync(installed))
    assert(
      ['dist', 'README.md', 'LICENSE', 'package.json'].includes(name),
      `产物含非公开文件：${name}`,
    )
  for (const entry of Object.values(metadata.exports))
    for (const target of Object.values(entry))
      assert(existsSync(join(installed, target)), `缺少导出文件：${target}`)
  function checkMaps(directory) {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name)
      if (name.isDirectory()) checkMaps(path)
      else if (name.name.endsWith('.map')) {
        assert(
          !name.name.endsWith('.d.ts.map'),
          '不应发布指向未打包源码的声明 map',
        )
        const map = JSON.parse(readFileSync(path, 'utf8'))
        assert.equal(
          map.sourcesContent.length,
          map.sources.length,
          'source map 应包含源码内容',
        )
      }
    }
  }
  checkMaps(join(installed, 'dist'))
  writeFileSync(
    join(directory, 'smoke.mjs'),
    `
import assert from 'node:assert/strict'
import { createClient, defineEndpoint } from 'frontcache'
import { createFetchTransport } from 'frontcache/fetch'
import { ReadCache } from 'frontcache/cache'
import { sendsCodec } from 'frontcache/response/sends'
import axios from 'axios'
import { z } from 'zod'
import { createAxiosTransport } from 'frontcache/axios'
const client = createClient({ transport: createFetchTransport({ fetcher: async () => new Response('42') }) })
assert.equal(await client.call(defineEndpoint({ method: 'GET', path: '/answer', cache: true }), {}), 42)
assert.equal(await new ReadCache().get('answer', async () => 42), 42)
assert.equal(sendsCodec.unwrap({ msg: 'ok', data: 42 }), 42)
const schema = z.number().transform(value => ({ answer: value }))
assert.deepEqual(await client.call(defineEndpoint({ method: 'GET', path: '/schema', validator: schema }), {}), { answer: 42 })
assert.deepEqual(await client.call(defineEndpoint({ method: 'GET', path: '/async-schema', validator: { parse: value => schema.parseAsync(value) } }), {}), { answer: 42 })
await assert.rejects(client.call(defineEndpoint({ method: 'GET', path: '/invalid-schema', cache: true, validator: z.string() }), {}), error => error.kind === 'validation' && error.cause instanceof z.ZodError)
client.dispose()
const adapter = async config => ({ data: JSON.stringify({ msg: 'ok', data: 42 }), status: 200, statusText: 'OK', headers: {}, config })
const axiosClient = createClient({ transport: createAxiosTransport({ instance: axios.create({ adapter }) }) })
assert.deepEqual(await axiosClient.get('/answer'), { msg: 'ok', data: 42 })
axiosClient.dispose()
`,
  )
  run(process.execPath, [join(directory, 'smoke.mjs')], { cwd: directory })
  console.log(
    '[install] npm production install / automatic Axios + Zod / schema sync + async + errors / Fetch + Axios / no dev tools / exports / license / maps passed',
  )
}
