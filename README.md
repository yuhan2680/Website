# 小涵的星空手记

主站：https://naiwenel.com 。额外域名 yuhan2680.net 保留路径跳转到主站。

保留 HTML 静态页面，使用 Cloudflare Pages Functions + D1 提供动态留言。搜索和分类在浏览器本地完成，检索当前文章的标题、摘要与分类；本轮没有增加后台发文或更换数据库。

## 本地开发与验证

使用 Node.js 22.13+（推荐 24），无需安装第三方依赖。

```sh
node scripts/dev-server.js
node --test tests/comments.test.js tests/site.test.js
node scripts/build.js
```

本地预览为 http://localhost:4173；本地留言存放在内存 SQLite，进程结束即消失，绝不连接生产 D1。Node 22 可能显示 SQLite 实验性功能提示。

## Cloudflare Pages

- Git 仓库：`yuhan2680/Website`，生产分支 `main`。
- 构建命令：`node scripts/build.js`；构建输出目录：`dist`；无框架。
- `functions/` 位于仓库根目录；保留已有 D1 绑定 `blog_comments`。
- 沿用 `comments(id, post_id, nickname, content, created_at)` 表，不需要数据迁移。`id` 应为自增整数主键。数据多时可在 D1 增加 `CREATE INDEX IF NOT EXISTS comments_post_id_id ON comments(post_id, id DESC);`。
- `_routes.json` 仅让 `/api/*` 调用 Functions。静态资源继续由 Pages CDN 提供。
- `_headers` 配置静态安全头和模型缓存；API 自行返回 `Cache-Control: no-store`。
- 在 Pages → Custom domains 中绑定域名后，`_redirects` 才负责将额外域名跳转到主站，保留文章路径。

## 内容维护

复制 `template/post-template.html` 到 `posts/<slug>.html`，填写标题、简介、日期、正文、canonical URL 和 `data-post-id`。发布新文章时同步更新首页最新文章、博客归档卡片、RSS 和 sitemap。分类使用卡片的 `data-category`，筛选按钮使用 `data-filter`。

公共行为位于 `assets/site.js`、`assets/comments.js`、`assets/live2d.js`；早期主题初始化位于 `assets/theme.js`。主题变量集中在 `style.css`。HTML 保持独立可阅读，导航和友链不依赖 JavaScript。

Live2D 模型和原有皮肤参数保持原样。访客主动点击“召唤小涵”后加载约 16 MB 的原始模型资源；可收起、换装。后台标签页停止渲染，遵循系统减少动画偏好；星空上限 85 颗星、约 30 帧/秒，设备像素比最多 2。

## 本次修复与优化

- 最新文章指向错误、不可点击的 Steam 链接、友链头像错误 alt、HTTP 图片混合内容。
- 统一“星空手记”深浅色主题、响应式导航、键盘操作、跳到正文链接、表单标签与状态提示。
- 独立作品区、文章归档搜索和分类、相邻文章、404、SEO 元数据、RSS 与 sitemap。
- 删除各页面重复的动画与留言逻辑；取消外部字体请求，避免首屏加载整个 Live2D 模型。
- API 检查字段类型、长度、实际请求字节数与来源；查询分页；原子去重；不向访客泄露数据库异常。前端安全地使用 textContent 渲染留言，支持重试与分页。
- 去重和隐藏字段只是基础防护，不等于完整反垃圾系统。访问量增长后，可加入 Cloudflare Turnstile、边缘限流与审核队列。

设计方向参考 [Fuwari](https://github.com/saicaca/fuwari) 的博客功能组织和 [PaperMod](https://github.com/adityatelange/hugo-PaperMod) 的阅读优先思路；本仓库未复制这些模板的实现。

## 下一步：后台发文

保留现有静态发布结构，优先评估 GitHub 登录的内容管理后台，让文章和修改继续保存在 Git 历史；若需要即时发布、草稿和多作者，再考虑 D1 内容表与受保护的管理 API。正式启用前需要站长配合配置登录身份或 OAuth，不能将访问令牌放进前端或 Git 仓库。

部署后检查：首页、归档搜索/分类、手机导航、主题记忆、Live2D、留言读取、原文章 URL、RSS、404 和额外域名跳转。不要为了验证而向生产留言板发布测试内容。
