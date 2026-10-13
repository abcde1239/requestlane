import type { Client } from '@/core/client'
/** 领域 service 可继承，也可直接组合 client； */
export abstract class BaseService {
  constructor(
    readonly serviceName: string,
    protected readonly http: Client,
  ) {}
}
