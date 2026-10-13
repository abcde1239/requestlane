import {
  createClient,
  createCodec,
  defineEndpoint,
  BusinessError,
} from '../src/index.js'
import { createFetchTransport } from '../src/adapters/fetch.js'
import { createAxiosTransport } from '../src/adapters/axios.js'
import axios from 'axios'

interface User {
  id: string
  name: string
}
export const getUser = defineEndpoint<{ params: { id: string }; data: User }>({
  method: 'GET',
  path: '/users/:id',
  cache: { ttl: 30000, tags: ['users'] },
})
export function fetchClient(fetcher = fetch) {
  return createClient({
    baseURL: '/api',
    transport: createFetchTransport({ fetcher }),
  })
}
export function axiosClient() {
  return createClient({
    baseURL: '/api',
    transport: createAxiosTransport({
      instance: axios.create(),
      cacheSafe: true,
    }),
  })
}
export const otherProtocol = createCodec<{ success: boolean; result: unknown }>(
  {
    parse(value) {
      if (!value || typeof value !== 'object' || !('success' in value))
        throw new Error('invalid envelope')
      return value as { success: boolean; result: unknown }
    },
    unwrap(envelope) {
      if (!envelope.success) throw new BusinessError(envelope, 'Rejected')
      return envelope.result
    },
  },
)
export async function updateUser() {
  const client = fetchClient()
  const user = await client.call(getUser, { params: { id: '1' } })
  const edited = { ...user, name: 'New name' }
  await client.withInvalidation(['users'], () =>
    client.patch('/users/1', edited),
  )
  client.dispose()
}
