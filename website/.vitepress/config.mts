import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "requestlane",
  description: "框架无关的 TypeScript HTTP 客户端 API 与使用文档",
  base: "/requestlane/",
  srcDir: fileURLToPath(new URL("../../docs/public", import.meta.url)),
  outDir: fileURLToPath(new URL("../../artifacts/docs-site", import.meta.url)),
  cacheDir: fileURLToPath(new URL("../../.cache/vitepress", import.meta.url)),
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "快速开始", link: "/guides/usage" },
      { text: "API", link: "/reference/client" },
    ],
    sidebar: [
      {
        text: "使用指南",
        items: [
          { text: "快速开始", link: "/guides/usage" },
          { text: "类型与校验", link: "/guides/validation" },
          { text: "模块组合", link: "/guides/modules" },
          { text: "与已有工具配合", link: "/guides/integrations" },
        ],
      },
      {
        text: "API 参考",
        items: [
          { text: "Client", link: "/reference/client" },
          { text: "Cache", link: "/reference/cache" },
          { text: "Session", link: "/reference/session" },
          { text: "Response", link: "/reference/response" },
          { text: "Service", link: "/reference/service" },
          { text: "包入口与运行环境", link: "/reference/exports" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/abcde1239/requestlane" },
    ],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "搜索文档", buttonAriaLabel: "搜索文档" },
              modal: {
                noResultsText: "未找到相关内容",
                resetButtonTitle: "清除搜索",
                footer: {
                  selectText: "选择",
                  navigateText: "切换",
                  closeText: "关闭",
                },
              },
            },
          },
        },
      },
    },
    outline: { label: "本页目录", level: [2, 3] },
    docFooter: { prev: "上一页", next: "下一页" },
    lastUpdated: { text: "更新于" },
    editLink: {
      pattern:
        "https://github.com/abcde1239/requestlane/edit/master/docs/public/:path",
      text: "在 GitHub 上编辑此页",
    },
    footer: { message: "基于 MIT 许可发布", copyright: "requestlane" },
  },
});
