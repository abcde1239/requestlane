import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  symlinkSync,
  copyFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { root, run } from "./runtime.mjs";
import { checkModules } from "./check-modules.mjs";

export function consumers(tarball) {
  const directory = mkdtempSync(join(tmpdir(), "requestlane-consumer-"));
  const install = join(directory, "node_modules/requestlane");
  mkdirSync(install, { recursive: true });
  run("tar", ["-xf", tarball, "-C", install, "--strip-components=1"]);
  const require = createRequire(join(directory, "consumer.mjs"));
  // 手工解压不安装 dependencies，仅验证核心/Fetch import 图不会加载 Axios；自动安装另由 install smoke 检查。
  assert.throws(
    () => require.resolve("axios"),
    "手工解压的隔离环境不应有 Axios",
  );
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  writeFileSync(
    join(directory, "consumer.mjs"),
    `
import assert from 'node:assert/strict'
import { createClient, defineEndpoint } from 'requestlane'
import { createFetchTransport } from 'requestlane/fetch'
import { sendsCodec } from 'requestlane/response/sends'
let requests = 0
const transport = createFetchTransport({ fetcher: async () => { requests++; return new Response(JSON.stringify({ msg: 'ok', data: { id: 'member' } })) } })
const endpoint = defineEndpoint({ method: 'GET', path: '/items', cache: true })
const client = createClient({ transport, codec: sendsCodec })
assert.equal((await client.call(endpoint, {})).id, 'member')
await client.call(endpoint, {}); assert.equal(requests, 1)
client.dispose()
`,
  );
  run(process.execPath, [join(directory, "consumer.mjs")], { cwd: directory });
  checkModules(join(install, "dist"));
  writeFileSync(
    join(directory, "modules.mjs"),
    `
import assert from 'node:assert/strict'
import { createClient, defineEndpoint } from 'requestlane/core'
import { ReadCache, createMemoryCache } from 'requestlane/cache'
import { createSession } from 'requestlane/session'
import { createFetchTransport } from 'requestlane/fetch'
let calls = 0
const transport = createFetchTransport({ fetcher: async () => { calls++; return new Response(JSON.stringify({ value: 7 })) } })
for (const cache of [false, true]) for (const session of [false, true]) {
  const client = createClient({ transport, cache: cache ? createMemoryCache() : undefined, session: session ? createSession() : undefined })
  const endpoint = defineEndpoint({ method: 'GET', path: '/modules', cache, validator: { parse: async value => value.value } })
  const before = calls
  if (session) client.setToken('current')
  assert.equal(await client.call(endpoint), 7)
  assert.equal(await client.call(endpoint), 7)
  assert.equal(calls - before, cache ? 1 : 2)
  assert.equal(client.cache === undefined, !cache)
  client.dispose()
}
const standalone = new ReadCache()
assert.equal(await standalone.get('work', async () => 42), 42)
standalone.clear()
console.log('[consumer] four capability combinations and standalone cache passed without Axios/Zod installed')
`,
  );
  run(process.execPath, [join(directory, "modules.mjs")], { cwd: directory });
  writeFileSync(
    join(directory, "consumer.ts"),
    `
import { createClient, defineEndpoint, type ReadonlyData, type ResponseType, type RequestOptions, type EndpointOptions, type TransportRequest, type ErrorKind, type ErrorInfo, type ErrorDetails, type Validator } from 'requestlane'
import { createFetchTransport } from 'requestlane/fetch'
import type { CacheReadOptions, CacheInvalidationFilter } from 'requestlane/cache'
const responseTypes: ResponseType[] = ['json', 'text', 'blob', 'arraybuffer']
for (const responseType of responseTypes) {
  const options: RequestOptions = { responseType }
  const endpointOptions: EndpointOptions<{}> = { path: '/types', method: 'GET', responseType }
  const request: Omit<TransportRequest, 'signal'> = { url: endpointOptions.path, method: endpointOptions.method, headers: {}, responseType: options.responseType ?? 'json' }
  void request
}
const cacheOptions: CacheReadOptions = { ttl: 30 }
const filter: CacheInvalidationFilter = { tag: 'items' }
const errorKind: ErrorKind = 'network'
const errorInfo: ErrorInfo = { kind: errorKind, message: 'offline', retryable: true }
const errorDetails: ErrorDetails = { cause: new Error('offline') }
// @ts-expect-error DOM response visibility is not a requestlane representation
const invalidResponseType: ResponseType = 'opaque'
void [cacheOptions, filter, invalidResponseType, errorInfo, errorDetails]
interface Member { id: string }
const endpoint = defineEndpoint<{ params: { id: string }; data: Member }>({ method: 'GET', path: '/members/:id' })
const client = createClient({ transport: createFetchTransport() })
const customInput: Validator<number, string> = { parse: value => Number(value) }
const parsedEndpoint = defineEndpoint({ method: 'POST', path: '/parsed', inputValidators: { body: customInput }, validator: { parse: () => true } })
const parsedResult: Promise<boolean> = client.call(parsedEndpoint, { body: '18' })
// @ts-expect-error callers provide raw input, not the parser output
client.call(parsedEndpoint, { body: 18 })
// @ts-expect-error required schema input cannot be omitted
client.call(parsedEndpoint)
const responseOnly = defineEndpoint({ method: 'GET', path: '/response-only', validator: { parse: () => 42 } })
const responseOnlyResult: Promise<number> = client.call(responseOnly)
void [parsedResult, responseOnlyResult]
const result: Promise<ReadonlyData<Member>> = client.call(endpoint, { params: { id: '1' } })
// @ts-expect-error wrong path type
client.call(endpoint, { params: { id: 1 } })
void result
import { createClient as createCoreClient } from 'requestlane/core'
import { createMemoryCache } from 'requestlane/cache'
import { createSession } from 'requestlane/session'
const core = createCoreClient({ transport: createFetchTransport() })
const composed = createCoreClient({ transport: createFetchTransport(), cache: createMemoryCache(), session: createSession() })
const coreResult: Promise<ReadonlyData<Member>> = core.call(endpoint, { params: { id: '1' } })
composed.cache?.invalidate({ tag: 'items' })
// @ts-expect-error core uses an explicit cache factory, not legacy full-client settings
createCoreClient({ transport: createFetchTransport(), cache: { ttl: 100 } })
// @ts-expect-error core uses an explicit session factory
createCoreClient({ transport: createFetchTransport(), session: { token: () => 'x' } })
// @ts-expect-error schema contract remains bound through the independent core entry
core.call(parsedEndpoint, { body: 18 })
void coreResult
`,
  );
  const config = {
    compilerOptions: {
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      types: [],
    },
    files: ["consumer.ts"],
  };
  writeFileSync(join(directory, "tsconfig.json"), JSON.stringify(config));
  const compilers = ["typescript", "typescript-min"];
  function checkConsumers() {
    for (const mode of ["NodeNext", "Bundler"]) {
      const options = {
        ...config,
        compilerOptions: {
          ...config.compilerOptions,
          module: mode === "Bundler" ? "ESNext" : "NodeNext",
          moduleResolution: mode,
        },
      };
      const path = join(directory, `tsconfig.${mode}.json`);
      writeFileSync(path, JSON.stringify(options));
      for (const compiler of compilers)
        run(process.execPath, [
          resolve(root, `node_modules/${compiler}/bin/tsc`),
          "-p",
          path,
        ]);
    }
  }
  checkConsumers();

  // 声明/JS import 图：核心与 Fetch 的传递依赖不加载 Axios/框架/业务 SDK。
  const visited = new Set();
  function inspect(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:from\s+|import\s*)['"]([^'"]+)['"]/g,
    )) {
      assert(
        !/^(axios|vue|pinia|@sends-member|cos-js-sdk)/.test(match[1]),
        `${file} has forbidden import ${match[1]}`,
      );
      if (match[1].startsWith(".")) {
        const target = resolve(file, "..", match[1]);
        if (existsSync(target)) inspect(target);
      }
    }
  }
  inspect(join(install, "dist/index.js"));
  inspect(join(install, "dist/adapters/fetch.js"));
  inspect(join(install, "dist/response/sends.js"));
  assert(
    !readdirSync(install).includes("src"),
    "Tarball should contain build artifacts, not source fixtures",
  );
  // 第二个阶段才显式安装 Axios：只链接开发依赖，不访问 registry。
  symlinkSync(
    resolve(root, "node_modules/axios"),
    join(directory, "node_modules/axios"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(
    join(directory, "axios.mjs"),
    `
import assert from 'node:assert/strict'
import axios from 'axios'
import { createClient } from 'requestlane'
import { createAxiosTransport } from 'requestlane/axios'
const adapter = async config => ({ data: JSON.stringify({ msg: 'ok', data: 7 }), status: 200, statusText: 'OK', headers: {}, config })
const client = createClient({ transport: createAxiosTransport({ instance: axios.create({ adapter }) }) })
assert.equal((await client.get('/items')).data, 7)
client.dispose()
`,
  );
  run(process.execPath, [join(directory, "axios.mjs")], { cwd: directory });
  writeFileSync(
    join(directory, "http.mjs"),
    `
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createClient } from 'requestlane'
import { createFetchTransport } from 'requestlane/fetch'
import { createAxiosTransport } from 'requestlane/axios'
const server = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks)
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ body: body.toString(), contentType: request.headers['content-type'], bytes: [...body] }))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
try {
  for (const transport of [createFetchTransport(), createAxiosTransport({ config: { proxy: false } })]) {
    const client = createClient({ baseURL: 'http://127.0.0.1:' + server.address().port, transport })
    assert.equal((await client.post('/json', { name: 'local' })).body, JSON.stringify({ name: 'local' }))
    assert.equal((await client.post('/form', new URLSearchParams({ a: 'b' }))).body, 'a=b')
    assert.deepEqual((await client.post('/binary', new Uint8Array([9, 1, 2, 9]).subarray(1, 3))).bytes, [1, 2])
    assert.equal((await client.post('/blob', new Blob(['hello'], { type: 'text/plain' }))).body, 'hello')
    const form = new FormData(); form.set('name', 'multipart')
    const uploaded = await client.post('/upload', form)
    assert(uploaded.contentType.includes('multipart/form-data; boundary=')); assert(uploaded.body.includes('multipart'))
    client.dispose()
  }
} finally { await new Promise(resolve => server.close(resolve)) }
console.log('[consumer] real Node HTTP JSON/form/binary/blob/multipart passed')
`,
  );
  run(process.execPath, [join(directory, "http.mjs")], { cwd: directory });
  writeFileSync(
    join(directory, "consumer.ts"),
    readFileSync(join(directory, "consumer.ts"), "utf8") +
      `
import axios from 'axios'
import { createAxiosTransport } from 'requestlane/axios'
const axiosClient = createClient({ transport: createAxiosTransport({ instance: axios.create() }) })
void axiosClient
`,
  );
  checkConsumers();
  // Zod 为宿主显式选择的库；先完成无 schema 依赖的消费验证，再检查真实 Zod 接入。
  symlinkSync(
    resolve(root, "node_modules/zod"),
    join(directory, "node_modules/zod"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(
    join(directory, "schema.ts"),
    `
import { z } from 'zod'
import { defineEndpoint, createClient, type ReadonlyData } from 'requestlane'
import { createFetchTransport } from 'requestlane/fetch'
const schema = z.object({ value: z.string().transform(value => Number(value)) })
const endpoint = defineEndpoint({ method: 'GET', path: '/schema', validator: schema })
const asyncEndpoint = defineEndpoint({ method: 'GET', path: '/schema', validator: { parse: (value: unknown) => schema.parseAsync(value) } })
const client = createClient({ transport: createFetchTransport() })
const result: Promise<ReadonlyData<z.output<typeof schema>>> = client.call(endpoint, {})
const asyncResult: Promise<ReadonlyData<z.output<typeof schema>>> = client.call(asyncEndpoint, {})
const inferredInputs = defineEndpoint({
  method: 'PATCH', path: '/members/:id',
  inputValidators: {
    params: z.object({ id: z.string() }),
    body: z.object({ age: z.string().transform(Number) }),
    query: z.object({ page: z.number() }).default({ page: 1 }),
  },
  validator: z.object({ age: z.number() }),
})
const inferredInputsResult: Promise<ReadonlyData<{ age: number }>> = client.call(inferredInputs, { params: { id: '1' }, body: { age: '18' } })
// @ts-expect-error schema input is a string even when its output is a number
client.call(inferredInputs, { params: { id: '1' }, body: { age: 18 } })
// @ts-expect-error required path parameters cannot be omitted
client.call(inferredInputs, { body: { age: '18' } })
const defaults = defineEndpoint({ method: 'GET', path: '/defaults', inputValidators: { query: z.object({ page: z.number() }).default({ page: 1 }) } })
client.call(defaults)
void inferredInputsResult
// @ts-expect-error runtime transform changes output to a number
const incorrect: Promise<{ value: string }> = client.call(endpoint, {})
void [result, asyncResult, incorrect]
`,
  );
  for (const mode of ["NodeNext", "Bundler"]) {
    const options = {
      ...config,
      files: ["consumer.ts", "schema.ts"],
      compilerOptions: {
        ...config.compilerOptions,
        module: mode === "Bundler" ? "ESNext" : "NodeNext",
        moduleResolution: mode,
      },
    };
    const path = join(directory, `tsconfig.schema.${mode}.json`);
    writeFileSync(path, JSON.stringify(options));
    run(process.execPath, [
      resolve(root, "node_modules/typescript/bin/tsc"),
      "-p",
      path,
    ]);
  }
  // 从 tarball 复制示例到真实消费工程，不借助仓库 paths 或源码验证公开入口。
  const examples = readdirSync(join(install, "examples")).filter((name) =>
    name.endsWith(".ts"),
  );
  assert.equal(examples.length, 4, "应包含四个使用示例");
  mkdirSync(join(directory, "examples"));
  for (const name of examples) {
    const source = readFileSync(join(install, "examples", name), "utf8");
    assert(
      !/from\s+["'](?:@|\.\.?\/)/.test(source),
      `示例不能依赖内部入口：${name}`,
    );
    copyFileSync(
      join(install, "examples", name),
      join(directory, "examples", name),
    );
  }
  for (const mode of ["NodeNext", "Bundler"]) {
    for (const compiler of compilers) {
      const options = {
        ...config,
        files: examples
          .filter(
            (name) =>
              compiler !== "typescript-min" || name !== "cache-schema.ts",
          )
          .map((name) => `examples/${name}`),
        compilerOptions: {
          ...config.compilerOptions,
          module: mode === "Bundler" ? "ESNext" : "NodeNext",
          moduleResolution: mode,
        },
      };
      const path = join(
        directory,
        `tsconfig.examples.${compiler}.${mode}.json`,
      );
      writeFileSync(path, JSON.stringify(options));
      run(process.execPath, [
        resolve(root, `node_modules/${compiler}/bin/tsc`),
        "-p",
        path,
      ]);
    }
  }
  console.log(
    "[consumer] all packaged examples passed without source aliases; Zod example uses current TS",
  );
  const versions = compilers.map(
    (name) =>
      JSON.parse(
        readFileSync(
          resolve(root, `node_modules/${name}/package.json`),
          "utf8",
        ),
      ).version,
  );
  const zod = JSON.parse(
    readFileSync(resolve(root, "node_modules/zod/package.json"), "utf8"),
  ).version;
  console.log(
    `[consumer] Fetch-only / Axios / TS ${versions.join(" / ")} / NodeNext + Bundler / Zod ${zod} passed`,
  );
}
