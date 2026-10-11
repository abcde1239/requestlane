import { createClient, defineEndpoint, type ReadonlyData } from '../src/index.js'
import { createFetchTransport } from '../src/adapters/fetch.js'
import { z } from 'zod'

// 不作为运行时测试执行；由 strict tsc 同时检查正例与反例。
interface Member { id: string; profile: { name: string } }
const client = createClient({ transport: createFetchTransport() })
const detail = defineEndpoint<{ params: { id: string }; query: { sort: 'latest' | 'hot' }; data: Member }>({ method: 'GET', path: '/members/:id' })
const result: Promise<ReadonlyData<Member>> = client.call(detail, { params: { id: '1' }, query: { sort: 'latest' } })
const unknownResult: Promise<unknown> = client.get('/untyped')
const inferred = defineEndpoint({ method: 'GET', path: '/inferred', validator: { parse: () => 1 } })
const inferredResult: Promise<number> = client.call(inferred, {})
const write = defineEndpoint<{ body: { name: string }; data: Member }>({ method: 'PATCH', path: '/members' })
client.call(write, { body: { name: 'new' } })
// @ts-expect-error missing required path params
client.call(detail, { query: { sort: 'hot' } })
// @ts-expect-error enum constraint
client.call(detail, { params: { id: '1' }, query: { sort: 'wrong' } })
// @ts-expect-error wrong path field type
client.call(detail, { params: { id: 1 }, query: { sort: 'hot' } })
// @ts-expect-error fresh object excess field
client.call(write, { body: { name: 'new', unknown: 1 } })
// @ts-expect-error GET endpoint cannot declare a request body
defineEndpoint<{ body: string; data: string }>({ method: 'GET', path: '/bad' })
// @ts-expect-error caller cannot replace bound endpoint output
client.call<{ data: number }>(detail, {})
// @ts-expect-error undeclared GET body
client.get('/read', { body: {} })
// @ts-expect-error response remains unknown without a static declaration/schema
const unsafe: Promise<Member> = unknownResult
async function immutable() {
  const value = await result
  // @ts-expect-error cached/shared data exposes a recursive readonly view
  value.profile.name = 'mutation'
}
void [result, inferredResult, unsafe, immutable]
const binary = defineEndpoint<{ data: Blob }>({ method: 'GET', path: '/binary', responseType: 'blob' })
async function binaryMethods() { return (await client.call(binary, {})).arrayBuffer() }
const binaryResult: Promise<ArrayBuffer> = binaryMethods()
void binaryResult

const schema = z.object({ value: z.string().transform(value => Number(value)) })
const schemaEndpoint = defineEndpoint({ method: 'GET', path: '/schema', validator: schema })
const schemaResult: Promise<ReadonlyData<z.output<typeof schema>>> = client.call(schemaEndpoint, {})
// @ts-expect-error transformed output is number, not the input string
const schemaInputResult: Promise<{ value: string }> = client.call(schemaEndpoint, {})
const asyncSchemaEndpoint = defineEndpoint({ method: 'GET', path: '/async-schema', validator: { parse: (value: unknown) => schema.parseAsync(value) } })
const asyncSchemaResult: Promise<ReadonlyData<z.output<typeof schema>>> = client.call(asyncSchemaEndpoint, {})
// @ts-expect-error validator output must agree with an explicit data declaration
defineEndpoint<{ data: { value: boolean } }>({ method: 'GET', path: '/wrong-schema', validator: schema })
void [schemaResult, schemaInputResult, asyncSchemaResult]
