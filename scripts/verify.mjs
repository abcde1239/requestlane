import { compiler, run } from './runtime.mjs'
import { pack } from './pack.mjs'
import { consumers } from './consumer-smoke.mjs'
import { browserSmoke } from './browser-smoke.mjs'
console.log('[verify] strict types, including negative fixtures and examples')
compiler()
console.log('[verify] isolated adapter/cache/session/compat tests')
run('bun', ['test'])
console.log('[verify] ESM and declarations')
compiler('typescript', ['-p', 'tsconfig.build.json'])
console.log('[verify] local package and independent consumers')
consumers(pack())
await browserSmoke()
console.log('[verify] all checks passed')
