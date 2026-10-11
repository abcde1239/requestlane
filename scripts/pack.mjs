import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, run } from './runtime.mjs'
export function pack() {
  mkdirSync(resolve(root, 'artifacts'), { recursive: true })
  const npm = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  // Windows 使用 Node 执行 npm CLI，避免 cmd 拼接或依赖 .cmd 的 shell 行为。
  if (process.platform === 'win32') run(process.execPath, [npm, 'pack', '--ignore-scripts', '--loglevel', 'error', '--pack-destination', 'artifacts'])
  else run('npm', ['pack', '--ignore-scripts', '--loglevel', 'error', '--pack-destination', 'artifacts'])
  const metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  return resolve(root, 'artifacts', `${metadata.name}-${metadata.version}.tgz`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(pack())
