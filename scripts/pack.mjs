import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, npm } from './runtime.mjs'
export function pack() {
  mkdirSync(resolve(root, 'artifacts'), { recursive: true })
  // Windows 使用 Node 执行 npm CLI，避免 cmd 拼接或依赖 .cmd 的 shell 行为。
  npm([
    'pack',
    '--ignore-scripts',
    '--dry-run=false',
    '--json=false',
    '--loglevel',
    'error',
    '--pack-destination',
    'artifacts',
  ])
  const metadata = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  )
  return resolve(root, 'artifacts', `${metadata.name}-${metadata.version}.tgz`)
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(pack())
