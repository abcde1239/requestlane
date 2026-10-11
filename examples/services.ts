import { BaseService, type Client, defineEndpoint, createClient, type SessionOptions } from '../src/index.js'
import { createFetchTransport } from '../src/adapters/fetch.js'
import { sendsCodec } from '../src/response/sends.js'

interface Section { section_id: string; title: string }
interface Page<T> { list: T[]; total?: number }
const sections = defineEndpoint<{ data: Page<Section> }>({ method: 'GET', path: '/sections', cache: { tags: ['community'] } })
const posts = defineEndpoint<{ query: { user_id?: string; status: 'draft' | 'active'; p: number; limit: number }; data: Page<{ post_id: string; title: string }> }>({ method: 'GET', path: '/user/posts', cache: { tags: ['community'] } })
const members = defineEndpoint<{ data: Page<{ user_id: string; username: string }> }>({ method: 'GET', path: '/list', cache: { tags: ['members'] } })
class CommonService {
  constructor(private readonly http: Client) {}
  getSections(signal?: AbortSignal) { return this.http.call(sections, {}, { signal }) }
  getUserPosts(query: { user_id?: string; status: 'draft' | 'active'; p: number; limit: number }, signal?: AbortSignal) { return this.http.call(posts, { query }, { signal }) }
  deletePost(id: string) { return this.http.withInvalidation(['community'], () => this.http.delete(`/post/${encodeURIComponent(id)}`)) }
}
export class CommunityService extends BaseService {
  readonly common: CommonService
  constructor(client: Client) { super('community', client); this.common = new CommonService(client) }
}
export class UserService extends BaseService {
  constructor(client: Client) { super('user', client) }
  getUserList() { return this.http.call(members, {}) }
  updateInfo(body: { username: string; contact1: string; contact2: string; intro: string }) {
    return this.http.withInvalidation(['members'], () => this.http.patch('', body))
  }
}
export function createAppServices(session: SessionOptions) {
  const transport = createFetchTransport()
  return {
    community: new CommunityService(createClient({ baseURL: '/api/community', transport, codec: sendsCodec, session })),
    user: new UserService(createClient({ baseURL: '/api/user', transport, codec: sendsCodec, session }))
  }
}
