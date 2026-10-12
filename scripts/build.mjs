import assert from 'node:assert/strict'
import { lstatSync, rmSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { root, compiler } from './runtime.mjs'

// 清除旧声明/map，防止发布目录混入上一次构建的文件。
const output = resolve(root, 'dist')
assert.equal(relative(root, output), 'dist', '拒绝清理工作区以外的目录')
try { assert(!lstatSync(output).isSymbolicLink(), 'dist 不能是链接目录') }
catch (error) { if (error.code !== 'ENOENT') throw error }
rmSync(output, { recursive: true, force: true })
compiler('typescript', ['-p', 'tsconfig.build.json'])
