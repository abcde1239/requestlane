# 开发与发布

使用 Node 24.12.0、Bun 1.3.4，发布端使用 npm 11.6.2。

```bash
bun install --frozen-lockfile
npm run format
npm run verify
```

提交前 Husky 检查暂存内容的格式、类型、全部测试与构建，源码行和函数覆盖率均须达到 90%。完整 `verify` 还检查打包消费者、生产安装和浏览器请求。

## 一次性发布配置

`requestlane` 首次发布需要包维护者本机登录 npm 并完成 2FA。先通过完整验证，再发布生成的 tarball：

```bash
npm login --registry=https://registry.npmjs.org/
npm run verify
npm publish ./artifacts/requestlane-0.1.3.tgz --access public --tag latest --registry=https://registry.npmjs.org/
```

首次成功后，在 [npm 包设置](https://www.npmjs.com/package/requestlane/access) 中添加 GitHub Actions Trusted Publisher：

| 字段                 | 值                  |
| -------------------- | ------------------- |
| Organization or user | `abcde1239`         |
| Repository           | `requestlane`       |
| Workflow filename    | `publish.yml`       |
| Environment name     | 留空                |
| Allowed actions      | 允许发布（publish） |

无需设置 `NPM_TOKEN`。新绑定需在 npm 规定的有效期内完成第一次工作流发布（当前为两天），否则需要重新创建。认证要求以 [npm 官方文档](https://docs.npmjs.com/trusted-publishers/) 为准。

## 版本更新

先提交功能和相关源码、锁文件、指南与脚本，再升版本并推送：

```bash
npm version patch --no-git-tag-version
git add package.json
git commit -m "chore(release): 更新补丁版本"
git push origin master
```

`master` 推送中 `package.json` 的版本变化触发自动发布；仅本地修改版本不会触发。完整验证通过后发布同一份验收 tarball，任何验证失败都会阻止发布。正式版使用 `latest`，预发布版使用 `next`；版本遵循 SemVer，不使用 build metadata。已发布版本跳过，禁止标签回退，注册表错误时停止。

失败后可以在 GitHub **Actions → Publish npm package → Run workflow** 选择 `master` 重试，无需再次升版本。工作流串行运行；快速连续推送可能替换尚未运行的排队任务，逐版发布应等待上一版完成再推送。

提交说明采用 Conventional Commits 类型前缀和中文描述。`docs/`、`verification/`、`verficaction/`、`.agent/` 保留本地，不加入提交。
