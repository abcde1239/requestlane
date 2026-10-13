import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { root, run } from './runtime.mjs'

export async function browserSmoke() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const chrome = candidates.find((path) => path && existsSync(path))
  if (!chrome)
    throw new Error('Set CHROMIUM_PATH to run the real browser smoke test')
  mkdirSync(resolve(root, '.cache'), { recursive: true })
  run('bun', [
    'build',
    'test/browser.fixture.ts',
    '--target',
    'browser',
    '--outfile',
    '.cache/browser.js',
  ])
  const counts = new Map()
  const server = createServer(async (request, response) => {
    const path = request.url.split('?')[0]
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html')
      response.end(
        '<body>pending<script type="module" src="/browser.js"></script></body>',
      )
      return
    }
    if (path === '/browser.js') {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(readFileSync(resolve(root, '.cache/browser.js')))
      return
    }
    if (path === '/binary') {
      response.setHeader('Content-Type', 'application/octet-stream')
      response.end(Buffer.from([1, 2, 3]))
      return
    }
    if (path === '/unauthorized') {
      response.writeHead(401, { 'Content-Type': 'text/html' })
      response.end('<html>denied</html>')
      return
    }
    response.setHeader('Content-Type', 'application/json')
    if (path.startsWith('/data/')) {
      counts.set(path, (counts.get(path) ?? 0) + 1)
      response.end(JSON.stringify({ value: 7, count: counts.get(path) }))
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString()
    if (path === '/write')
      response.end(JSON.stringify({ body: JSON.parse(text) }))
    else if (path === '/form')
      response.end(
        JSON.stringify({
          text,
          contentType: request.headers['content-type'] ?? '',
        }),
      )
    else {
      response.writeHead(404)
      response.end('{}')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const profile = mkdtempSync(join(tmpdir(), 'frontcache-chrome-'))
  try {
    const child = spawn(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--dump-dom',
        '--virtual-time-budget=5000',
        `http://127.0.0.1:${port}/`,
      ],
      { windowsHide: true },
    )
    let output = ''
    let diagnostic = ''
    child.stdout.on('data', (data) => {
      output += data
    })
    child.stderr.on('data', (data) => {
      diagnostic += data
    })
    const timeout = setTimeout(() => child.kill(), 25000)
    const status = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', resolve)
    }).finally(() => clearTimeout(timeout))
    if (status !== 0 || !output.includes('data-result="passed"'))
      throw new Error(
        `Browser smoke failed (${status}): ${output || diagnostic}`,
      )
    console.log('[browser] real Chromium Axios/Fetch: 16 assertions passed')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await browserSmoke()
