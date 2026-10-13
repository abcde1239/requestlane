import { cancelled } from "@/response/errors";
import { raceSignal } from "@/request/lifecycle";

import { checkTTL } from "@/utils/checkTTL";
import type {
  CacheInvalidationFilter,
  CacheReadOptions,
  Entry,
} from "@/types/cache";

export class ReadCache {
  private entries = new Map<string, Entry>();
  private active = new Set<Entry>();

  constructor(
    private readonly ttl = 30000,
    private readonly capacity = 20,
  ) {
    checkTTL(ttl);

    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError("capacity must be a positive integer");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get pending(): number {
    return this.active.size;
  }

  clear(): void {
    this.invalidate();
  }

  invalidate(filter: CacheInvalidationFilter = {}): void {
    const entries = new Set([...this.entries.values(), ...this.active]);

    for (const entry of entries) {
      if (
        filter.key !== undefined &&
        entry.key !== filter.key &&
        entry.alias !== filter.key
      ) {
        continue;
      }

      if (filter.tag !== undefined && !entry.tags.includes(filter.tag)) {
        continue;
      }

      if (filter.prefix !== undefined && !entry.key.startsWith(filter.prefix)) {
        continue;
      }

      if (this.entries.get(entry.key) === entry) {
        this.entries.delete(entry.key);
      }

      this.active.delete(entry);
      entry.controller.abort(cancelled());
    }
  }

  get<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    options: CacheReadOptions = {},
  ): Promise<T> {
    const ttl = options.ttl ?? this.ttl;
    checkTTL(ttl);

    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? cancelled());
    }

    const entry =
      this.getValidEntry(key) ?? this.createEntry(key, load, ttl, options);

    return this.subscribe<T>(key, entry, signal);
  }

  private getValidEntry(key: string): Entry | undefined {
    const entry = this.entries.get(key);

    if (entry?.settled && entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry;
  }

  private createEntry<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    ttl: number,
    options: CacheReadOptions,
  ): Entry {
    while (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value;

      if (oldest === undefined) break;

      this.entries.delete(oldest);
    }

    const controller = new AbortController();

    const entry: Entry = {
      key,
      alias: options.alias ?? key,
      tags: [...(options.tags ?? [])],
      controller,
      promise: Promise.resolve(undefined),
      consumers: 0,
      settled: false,
      expires: 0,
    };

    entry.promise = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();

        return raceSignal(
          Promise.resolve(load(controller.signal)),
          controller.signal,
        );
      })
      .then((data) => {
        controller.signal.throwIfAborted();

        entry.settled = true;
        entry.expires = Date.now() + ttl;

        return data;
      })
      .catch((error) => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key);
        }

        throw error;
      })
      .finally(() => {
        this.active.delete(entry);
      });

    this.active.add(entry);
    this.entries.set(key, entry);

    return entry;
  }

  private subscribe<T>(
    key: string,
    entry: Entry,
    signal?: AbortSignal,
  ): Promise<T> {
    entry.consumers++;

    return new Promise<T>((resolve, reject) => {
      let finished = false;

      const finish = (): boolean => {
        if (finished) return false;

        finished = true;

        signal?.removeEventListener("abort", cancelConsumer);

        entry.controller.signal.removeEventListener("abort", cancelShared);

        entry.consumers--;

        return true;
      };

      const cancelConsumer = (): void => {
        if (!finish()) return;

        reject(signal?.reason ?? cancelled());

        if (!entry.settled && entry.consumers === 0) {
          if (this.entries.get(key) === entry) {
            this.entries.delete(key);
          }

          entry.controller.abort(cancelled());
        }
      };

      const cancelShared = (): void => {
        if (!finish()) return;

        reject(entry.controller.signal.reason ?? cancelled());
      };

      signal?.addEventListener("abort", cancelConsumer, { once: true });

      entry.controller.signal.addEventListener("abort", cancelShared, {
        once: true,
      });

      entry.promise.then(
        (data) => {
          if (finish()) resolve(data as T);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );

      // 处理订阅时共享请求已经被中止的情况。
      if (entry.controller.signal.aborted) {
        cancelShared();
      }
    });
  }
}
