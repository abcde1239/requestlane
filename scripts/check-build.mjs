import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import ts from 'typescript-min'

/** 所有 JS/声明都必须能脱离宿主别名配置解析，不能只检查根入口。 */
export function checkBuild(directory) {
  let checked = 0
  function inspect(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = resolve(folder, entry.name)
      if (entry.isDirectory()) inspect(file)
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
        const source = ts.createSourceFile(
          file,
          readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        )
        function visit(node) {
          let literal
          if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
            literal = node.moduleSpecifier
          else if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument)
          )
            literal = node.argument.literal
          else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
          )
            literal = node.arguments[0]
          if (literal && ts.isStringLiteral(literal)) {
            const specifier = literal.text
            assert(
              specifier !== '@' && !specifier.startsWith('@/'),
              `${file} 残留源码别名：${specifier}`,
            )
            if (specifier.startsWith('.')) {
              assert(
                specifier.endsWith('.js'),
                `${file} 的 ESM 引用缺少 .js：${specifier}`,
              )
              const target = resolve(dirname(file), specifier)
              const local = relative(directory, target)
              assert(
                !local.startsWith('..') && !isAbsolute(local),
                `${file} 引用超出发布目录：${specifier}`,
              )
              assert(existsSync(target), `${file} 引用不存在：${specifier}`)
              if (entry.name.endsWith('.d.ts'))
                assert(
                  existsSync(target.slice(0, -3) + '.d.ts'),
                  `${file} 缺少目标声明：${specifier}`,
                )
              checked++
            }
          }
          ts.forEachChild(node, visit)
        }
        visit(source)
      }
    }
  }
  inspect(directory)
  assert(checked > 0, '没有可检查的构建引用')
  console.log(
    `[build] ${checked} ESM/declaration references resolved; no source aliases`,
  )
}
