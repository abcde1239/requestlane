import type { Client } from '../core/client.js'
/** 领域 service 可继承，也可直接组合 client；基础包不规定业务路径。 */
export abstract class BaseService {
  constructor(readonly serviceName: string, protected readonly http: Client) {}
}
