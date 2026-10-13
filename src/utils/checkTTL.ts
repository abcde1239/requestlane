export function checkTTL(ttl: number): void {
  if (!Number.isFinite(ttl) || ttl < 0)
    throw new TypeError('ttl must be a finite non-negative number')
}
