# 理想主义者的自留地 · Smartisan Blog

一个向 Smartisan OS、锤子科技与工业设计黄金时代致敬的个人博客。深色拟物界面、细红线分隔、机械开关、滚花旋钮、便签长图、火漆落款、九宫格文集，以及对 1px 对齐的偏执——所有交互都在浏览器里真实可点、可听。

> “圆滑当道时代的锐利异类。”

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsjdjayjj%2Fsmartisan-blog&project-name=smartisan-blog&repository-name=smartisan-blog&env=GITHUB_OAUTH_CLIENT_ID,GITHUB_OAUTH_CLIENT_SECRET,AUTH_SECRET,ADMIN_GITHUB_LOGINS,SITE_URL,BLOG_REPO,BLOG_GITHUB_TOKEN,BLOG_BRANCH,R2_ACCOUNT_ID,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_BUCKET,R2_PUBLIC_BASE_URL)

一键部署会自动 Fork 仓库并逐项询问环境变量，**所有凭据只从环境变量读取，代码中没有任何硬编码**。

> **内容不在本仓库**：文章与便签存放在独立的私有内容仓，通过 `BLOG_REPO`、`BLOG_GITHUB_TOKEN`、`BLOG_BRANCH` 以及 `BLOG_POSTS_DIR`、`BLOG_NOTES_DIR` 读取；本仓库只保留 `_example.mdoc` 示例文件。Fork 后请自建内容仓并配置上述变量；未配置时站点回退读取 `src/content` 下的示例内容。内容授权见 [CONTENT-LICENSE.md](CONTENT-LICENSE.md)。

---

## 一、设计语言

整套视觉系统围绕“物理质感”构建，而非单纯的暗色主题：

| 元素 | 表现 |
| --- | --- |
| 卡片 `.st-card` | 多层内阴影模拟顶部高光与底部投影，悬停时高光增强、卡片轻微上浮 |
| 凹槽 `.st-well` | 反向内阴影，形成“嵌入面板”的凹陷感 |
| 按钮 `.st-btn` | 双层描边 + 按压位移，模拟机械按键的行程 |
| 细红线 | 头部与弹窗分割线使用红色渐变 + 发光，取自 Smartisan OS 的标志性红线 |
| 便签纸 `.st-note-paper` | 深色纸面 + 横向格线 + 顶部金属夹扣，落款处压一枚火漆正印 |
| 开关 `.switch-track` / `.switch-thumb` | 带轨道内阴影与滑块高光的物理拨动开关 |
| 旋钮 `.dial-knurl` | `repeating-conic-gradient` 生成的金属滚花纹理，可随播放状态旋转 |
| 小号朱印 `.st-seal` | 红描边 + 微旋转，用于 11px 级角标与“查无此页”这类状态戳记 |
| 火漆正印 `.wax-seal` | 不规则蜡体、隆起蜡沿、底部蜡泪、凹刻文字，用于正式落款（见下节） |

字体分工：

- `--font-serif`：Noto Serif SC / Playfair Display —— 标题、正文、引语
- `--font-sans`：Roboto / PingFang SC —— 界面文案
- `--font-mono`：Roboto Mono —— 日期、编号、状态、元信息

Noto Serif SC 走自托管子集（见 [fonts.css](src/app/fonts.css)）：`core`（首屏用字，首页只命中这一片）、`mid`（站点其余用字，现有文章最多命中 core + mid）、`tail-l1` / `tail-l2`（GB2312 一级 3755 字 / 二级 3008 字中尚未覆盖的生僻字），每片独立 `unicode-range`，浏览器只拉取命中的文件。

子集由 `npm run fonts:subset` 一次生成：字符来源 = 线上站点用字（首页 + sitemap 里的全部文章 + `src` 源码文案）+ GB2312 常用汉字表（`TextDecoder('gb18030')` 解码码位生成，可复现），脚本末尾会断言所有站点用字都被某个分片覆盖。产物随仓库提交，**日常开发与构建不需要重跑**；只有新增文章、想追最新用字时才重跑（需要能访问线上站点）。

所有色值、字体、阴影都定义在 [globals.css](src/app/globals.css) 的 `@theme` 块中（Tailwind CSS v4 语法），改一处即可全站生效。

### 火漆正印

便签落款与长图右下角压的是同一枚火漆印，不是一张贴图：

| 形制 | 尺寸 | 使用场景 |
| --- | --- | --- |
| L 正印 | 84px | 首页置顶便签落款、导出长图（96px） |
| M 小印 | 56px | 便签弹窗落款 |
| S 朱印 | ≤24px | 导航角标、登录页、404、编辑器空态 —— 仍用 `.st-seal` |

压印文字低于 14px（约等于印章缩到 24px 以下）时不启用火漆：蜡质纹理与凹凸光影会把字糊掉，这时退回扁平朱印反而更清楚。

实现上有三条硬约定：

1. **几何是常量**。轮廓由 24 个极坐标点 + 二次贝塞尔平滑成的不规则毛边构成，写在 [waxSeal.ts](src/lib/waxSeal.ts)，**不做随机扰动**——同一枚印章在任何界面、任何位置形态完全一致，随机会让它退化成装饰花纹。
2. **一份几何两处渲染**。[WaxSeal.tsx](src/components/WaxSeal.tsx) 画 SVG，[waxSealCanvas.ts](src/lib/waxSealCanvas.ts) 把它画进长图 Canvas，两者共用点集与压印文字排版，所以页面与导出的 PNG 不会长得不一样。
3. **只有既有色阶**。蜡体只用 `#d4232a` / `#ea353c` / `#7f1d1d`，厚度与受光靠黑、白透明度叠加，不引入新色值；光源统一左上 45°，与 `.st-card` 的顶部内高光同向。

印章本体不承担交互，永不 hover 高亮；入场只有一次 `sealPress`（1.06 → 1，0.26s），并在 `prefers-reduced-motion` 下关闭。纯装饰时 `aria-hidden`，需要被读屏时传 `label`。

---

## 二、交互功能

- **触感声效开关**：导航栏右侧的物理开关，用 Web Audio API 实时合成机械“咔哒”声；状态切换会写入 `localStorage`。
- **全局点击音**：`SoundEffects` 通过事件委托监听 `.st-btn` 与 `.category-btn`，每次点击播放不同频率的短促机械声。
- **分类筛选**：全部 / 产品美学 / 系统折腾 / 思考与架构，即时过滤九宫格，按钮带按压反馈。
- **文章弹窗**：点击卡片打开阅读层，正文由自研 `MarkdocContent` 渲染（支持图片与 `<video>` / `<audio>` 原生媒体标签）；支持 `Esc`、点击遮罩、右上角按钮三种关闭方式，打开时锁定页面滚动。
- **阅读辅助**：弹窗内提供目录（TOC，锚点偏移随字体加载重算）、阅读位置记忆、游标卡尺式的字号 / 行距调节、上下篇跳转，以及 `navigator.share` 分享；`?post=slug` 可直接深链到某篇文章。
- **便签长图**：置顶便签可展开为“锤子便签”风格弹窗，一键复制纯文本到剪贴板并弹出 Toast；“导出便签长图 PNG”用 Canvas 直绘 750px 长图（不依赖 DOM 截图库，避免字体加载与跨域图片的不确定性）。
- **阅读进度与回顶**：顶部细红线随滚动伸长；右下角水平仪浮标可一键回顶。
- **灵感胶囊**：仅作者可见的悬浮入口（`canEdit` 包裹），可把闪念转成便签草稿。
- **工匠电台**：滚花旋钮 + 播放按钮。播放时用粉红噪声（Pink Noise）合成环境底噪，旋钮缓慢旋转；旁边按钮切换频段并 Toast 提示当前 MHz。
- **Toast 通知**：右下角滑入，带金色描边，自动消失。
- **动效克制**：只用 `fadeIn` / `scaleUp` / `riseIn` / `sealPress` 与旋转，且完整支持 `prefers-reduced-motion`。

> 浏览器自动播放策略要求音频必须由用户手势触发，因此所有声音都在点击后初始化 `AudioContext`。

---

## 三、技术栈

- **框架**：Next.js 16.4（App Router + Turbopack + Cache Components）
- **UI**：React 19.3、Tailwind CSS v4（`@theme` 设计令牌）
- **内容**：GitHub 仓库 Contents API 读写（回退本地 `.mdoc` 文件），Markdoc 解析
- **认证**：GitHub OAuth + HMAC 签名 HttpOnly Cookie（无第三方鉴权依赖）
- **媒体**：Cloudflare R2（S3 兼容 API + 手写 AWS SigV4 签名）
- **图标**：lucide-react
- **字体**：自托管 woff2（Noto Serif SC 站点用字 + GB2312 子集 / Playfair Display / Roboto / Roboto Mono）
- **类型**：TypeScript 5

---

## 四、快速开始

要求 Node.js 20 以上。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。

生产构建与本地预览：

```bash
npm run build
npm run start
```

其他脚本：

```bash
npm run lint
```

---

## 五、目录结构

```
.
├── .env.example                 # 全部环境变量示例（复制为 .env.local）
├── keystatic.config.ts          # Keystatic 内容模型（可选后台）
├── next.config.ts               # Cache Components / Turbopack 配置
├── src
│   ├── app
│   │   ├── globals.css          # 设计令牌 + 拟物组件样式 + 动效
│   │   ├── layout.tsx           # 字体、metadata、全局壳层
│   │   ├── page.tsx             # 首页（RSC）：loadPosts() → 组装各区块
│   │   ├── not-found.tsx        # 404 页
│   │   ├── login/page.tsx       # 作者入口 / GitHub 登录
│   │   ├── account
│   │   │   ├── page.tsx         # 用户中心：状态凹槽 + 文章管理
│   │   │   ├── editor/page.tsx  # 文章编辑器（新增 / 编辑）
│   │   │   └── notes/editor/page.tsx  # 便签编辑器（新增 / 编辑 / 删除）
│   │   ├── api
│   │   │   ├── auth/github/...  # OAuth 授权跳转与回调
│   │   │   ├── auth/signout     # 退出登录
│   │   │   ├── avatar           # 头像代理兜底
│   │   │   ├── posts            # 文章保存 / 删除（写回仓库）
│   │   │   ├── notes            # 便签保存 / 删除（写回仓库）
│   │   │   ├── upload           # 媒体上传到 R2
│   │   │   └── keystatic/...    # Keystatic API 路由（可选）
│   │   ├── keystatic/...        # Keystatic 管理后台（可选）
│   │   ├── robots.ts            # robots.txt
│   │   ├── sitemap.ts           # sitemap.xml
│   │   ├── feed.xml/route.ts    # RSS 订阅
│   │   └── opengraph-image.tsx  # 默认社交分享图
│   ├── components
│   │   ├── Navbar.tsx           # 细红线头部、导航、触感开关、工坊入口
│   │   ├── Hero.tsx             # 个人卡片、统计凹槽
│   │   ├── FeaturedNote.tsx     # 置顶便签卡片（含火漆正印落款）
│   │   ├── ArticleGrid.tsx      # 九宫格、分类筛选、文章阅读弹窗
│   │   ├── MarkdocContent.tsx   # Markdoc AST → React 的轻量渲染器
│   │   ├── Gadget.tsx           # 工匠电台（滚花旋钮 + 粉红噪声）
│   │   ├── NoteModal.tsx        # 便签弹窗、复制正文、导出长图
│   │   ├── WaxSeal.tsx          # 火漆正印（SVG，L/M 两档）
│   │   ├── IdeaPills.tsx        # 灵感胶囊（仅作者，可转草稿）
│   │   ├── ReadingProgress.tsx  # 顶部细红线阅读进度
│   │   ├── LevelBubble.tsx      # 水平仪回顶浮标
│   │   ├── FlipCounter.tsx      # 古典翻页钟数字
│   │   ├── UserAvatar.tsx       # 头像（加载失败回退首字）
│   │   ├── Toast.tsx            # 全局 Toast
│   │   ├── SoundEffects.tsx     # 全局点击音（事件委托）
│   │   └── account
│   │       ├── AccountHeader.tsx  # 后台头部（账号 / 退出）
│   │       ├── EditorToolbar.tsx  # Markdown 工具栏
│   │       ├── SmartisanFields.tsx # 文章 / 便签共用的元信息字段
│   │       ├── PostEditor.tsx     # 分屏编辑器 + 实时预览 + 媒体弹窗
│   │       └── NoteEditor.tsx     # 便签编辑器（单屏）
│   ├── lib
│   │   ├── auth.ts              # OAuth、白名单、HMAC 会话 Cookie
│   │   ├── github.ts            # 文章读写、frontmatter、Markdoc 转换
│   │   ├── notes.ts             # 便签读写、分享文本、默认值
│   │   ├── noteImage.ts         # 便签长图的 Canvas 直绘（750px PNG）
│   │   ├── waxSeal.ts           # 火漆印几何与压印文字排版（SVG / Canvas 共用）
│   │   ├── waxSealCanvas.ts     # 火漆印在长图里的绘制
│   │   ├── r2.ts                # R2 SigV4 上传
│   │   ├── audio.ts             # AudioContext、点击音、粉红噪声、静音偏好
│   │   ├── clipboard.ts         # 复制兜底（Clipboard API → execCommand）
│   │   ├── bus.ts               # 轻量事件总线（打开便签 / 弹出 Toast）
│   │   ├── seo.ts               # metadata、JSON-LD、RSS 共用拼装
│   │   ├── avatar.ts            # 头像地址整理
│   │   └── site.ts              # 站点文案、导航项、分类元信息
│   ├── content/posts/*.mdoc    # 文章内容（Markdoc）
│   └── content/notes/*.mdoc    # 便签内容（与文章同构）
```

---

## 六、内容管理

### 1. 数据源优先级

内容和便签各有一个读写层，规则一致：

1. 配置了 `BLOG_REPO` + `BLOG_GITHUB_TOKEN`：通过 GitHub Contents API 读写内容仓中的文章（[github.ts](src/lib/github.ts)）与便签（[notes.ts](src/lib/notes.ts)），后台保存 / 删除会直接生成 commit；目录默认 `src/content/posts` / `src/content/notes`，可用 `BLOG_POSTS_DIR` / `BLOG_NOTES_DIR` 覆盖；
2. 未配置：回退读取本地 `src/content/`，只有本地开发环境可写。

首页 [page.tsx](src/app/page.tsx) 调用 `loadPosts()` / `loadNotes()`，把纯 JSON 的 Markdoc AST 交给 `ArticleGrid` 与 `FeaturedNote`。因此后台新增的文章与本地文章走完全相同的渲染链路，无需改任何组件。

### 2. 文章格式

文件由 YAML frontmatter + Markdoc 正文组成：

| 字段 | 说明 |
| --- | --- |
| `title` | 文章标题 |
| `date` | 发布日期，首页按此倒序排序 |
| `category` | `thinking` / `system` / `aesthetic`，对应三个分类筛选 |
| `summary` | 卡片摘要，建议 1–2 句 |
| 正文 | Markdoc，支持标题、列表、引用、代码块、图片、表格，以及 `<video>` / `<audio>` 原生媒体标签 |

### 3. 数据流细节

1. 读取文件后解析 frontmatter，正文交给 `Markdoc.parse()`；
2. 用 `JSON.parse(JSON.stringify(...))` 做一次序列化往返，把 Markdoc 的 `Node` 类实例变成纯对象 —— **直接传类实例跨 RSC 边界会触发 “Only plain objects … can be passed to Client Components”**；
3. 统计正文字数估算阅读时长；
4. 客户端 `MarkdocContent` 递归渲染为 React 节点。

> Keystatic 的 `DocumentRenderer` 期望文本在 `text` 字段，而 Markdoc AST 把文本放在 `attributes.content`。两者并不兼容，所以项目内实现了轻量渲染器 [MarkdocContent.tsx](src/components/MarkdocContent.tsx)。

### 4. 可选：Keystatic 后台

开发模式下仍可访问 <http://localhost:3000/keystatic>，用图形界面直接改本地 `.mdoc` 文件。线上以「作者工坊」为准，两者共享同一份文件格式。

### 5. 修改站点文案

导航项、引语、分类徽章等站点文案集中在 [site.ts](src/lib/site.ts)，改文案不需要碰 JSX；头像旁的统计由 `page.tsx` 按真实文章 / 便签数量与最早内容日期计算，不写死。

---

## 七、作者工坊：GitHub 登录与后台编辑器

### 1. 登录与权限

- 入口：导航栏右侧「工坊」，或直接访问 `/account`。
- 流程：`/api/auth/github` → GitHub 授权页 → `/api/auth/github/callback` → 校验 `state` → 换取 access token → 读取 GitHub 资料 → 白名单校验 → 写入 HMAC 签名的 HttpOnly Cookie（7 天）。
- 白名单：`ADMIN_GITHUB_LOGINS`，逗号分隔，不区分大小写；非白名单账号会回到 `/login?error=not_allowed`。
- OAuth access token 只用于读取身份，**不落盘、不写入 Cookie**；文章写入使用独立的 `BLOG_GITHUB_TOKEN`。

### 2. 后台功能

| 路由 | 功能 |
| --- | --- |
| `/account` | 用户卡片、文章总数、内容源与 R2 状态、文章列表 |
| `/account/editor` | 新增文章；Markdown 源码 + 实时预览分屏 |
| `/account/editor?slug=xxx` | 编辑既有文章；支持删除（生成删除 commit） |
| `/account/notes/editor` | 新增便签；支持删除（生成删除 commit） |

编辑器能力：

- 工具栏：H1 / H2、加粗、行内代码、无序 / 有序列表、引用、分隔线、插入媒体；
- 实时预览：左写右看，Markdoc 即时排版；
- 快捷键：`Ctrl/Cmd + S` 保存；
- 未保存提示：页面顶部 `UNSAVED` 标记 + 关闭页面前的浏览器确认；
- 媒体：上传至 R2，或直接粘贴外部链接，按图片 / 视频 / 文件生成对应 Markdown。

### 3. Cloudflare R2 媒体

[r2.ts](src/lib/r2.ts) 手写 AWS SigV4 签名，直接调用 S3 兼容接口上传，不依赖 AWS SDK：

- 对象路径：`blog/{yyyy}/{mm}/{随机串}-{文件名}`；
- 上传后返回 `${R2_PUBLIC_BASE_URL}/blog/...`，写入 Markdown；
- 单文件上限 60MB，允许 `image/*`、`video/*`、`audio/*`、`application/pdf`；
- 未配置 R2 时上传接口返回 503，但编辑器仍可粘贴外部链接。

### 4. 环境变量

复制 [.env.example](.env.example) 为 `.env.local`：

```bash
# GitHub OAuth App
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
AUTH_SECRET=              # openssl rand -hex 32
ADMIN_GITHUB_LOGINS=your-login
SITE_URL=https://your-domain.com

# 文章仓库（PAT 需 contents: write）
BLOG_REPO=owner/repo
BLOG_GITHUB_TOKEN=
BLOG_BRANCH=main

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

GitHub OAuth App 的 **Authorization callback URL** 填 `${SITE_URL}/api/auth/github/callback`。本地调试把 `SITE_URL` 设为 `http://localhost:3000`。

---

## 八、自定义指南

- **换主色**：修改 `--color-smartisan-red` / `--color-smartisan-gold`，红线、徽章、光晕与 `.st-seal` 朱印会一起变化；火漆正印的蜡体色写在 [WaxSeal.tsx](src/components/WaxSeal.tsx) 与 [waxSealCanvas.ts](src/lib/waxSealCanvas.ts) 的渐变里，**换色时两处都要改**。
- **换标题字体**：修改 `--font-serif`，同步调整 [fonts.css](src/app/fonts.css) 里的 `@font-face`；换 CJK 字体后重跑 `npm run fonts:subset` 生成新子集。
- **改印章文案**：`<WaxSeal lines={["工匠出品", "骄傲制造"]} size={84} />`，字数自动决定排版（4 字压两行、2 字放大做主体）；轮廓与字号规则在 [waxSeal.ts](src/lib/waxSeal.ts)，改点集会同时影响页面与导出长图。
- **加分类**：在 `keystatic.config.ts` 的 `category` 选项、`site.ts` 的 `categoryMeta` 与 `categoryFilters` 三处同步增加同一个 key。
- **调整声效**：`playMechanicalClick(frequency, duration)` 的频率与时长在 [audio.ts](src/lib/audio.ts)，电台底噪音量在 `createPinkNoise(volume)` 调用处。
- **新增全局提示**：任意客户端组件调用 `showToast("...")` 即可，无需自己渲染组件。

---

## 九、部署

### 1. 一键部署到 Vercel

点击顶部按钮，Vercel 会依次完成：Fork 仓库 → 创建项目 → 逐项询问环境变量 → 构建上线。构建命令保持默认的 `npm run build`，无需修改输出目录。

如果没有仓库权限，也可以手动导入：Vercel → Add New Project → 选择本仓库 → 在 **Environment Variables** 中按下方表格逐项添加。

### 2. 环境变量清单

所有凭据均在运行时从环境变量读取，不写死在任何源码里。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `SITE_URL` | 是 | 线上域名，如 `https://blog.example.com`，用于拼接 OAuth 回调；首次部署后需更新为最终域名 |
| `GITHUB_OAUTH_CLIENT_ID` | 是 | GitHub OAuth App 的 Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | 是 | GitHub OAuth App 的 Client Secret |
| `AUTH_SECRET` | 是 | 会话 Cookie 的 HMAC 密钥，用 `openssl rand -hex 32` 生成 |
| `ADMIN_GITHUB_LOGINS` | 是 | 站长 GitHub 用户名，多个用英文逗号分隔 |
| `BLOG_REPO` | 是 | 文章仓库，格式 `owner/repo`；可指向独立的私有内容库 |
| `BLOG_GITHUB_TOKEN` | 是 | 对该仓库有 `contents: write` 权限的 fine-grained PAT |
| `BLOG_BRANCH` | 否 | 默认 `main` |
| `BLOG_POSTS_DIR` | 否 | 文章在内容仓中的目录，默认 `src/content/posts`；不要包含空格 |
| `BLOG_NOTES_DIR` | 否 | 便签在内容仓中的目录，默认 `src/content/notes`；不要包含空格 |
| `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | 否 | 仅 Keystatic 切到 `github` 存储模式时需要 |
| `R2_ACCOUNT_ID` | 否 | Cloudflare R2 账号 ID；不填则媒体上传降级为粘贴外链 |
| `R2_ACCESS_KEY_ID` | 否 | R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | 否 | R2 Secret Key |
| `R2_BUCKET` | 否 | Bucket 名称 |
| `R2_PUBLIC_BASE_URL` | 否 | 公开访问域名，如 `https://media.example.com` |

### 3. 部署后必做

1. 把 `SITE_URL` 改成 Vercel 分配的正式域名（或自定义域），保存后重新部署；
2. 在 GitHub → Settings → Developer settings → OAuth Apps 中，把 **Authorization callback URL** 填为 `${SITE_URL}/api/auth/github/callback`；
3. 访问 `${SITE_URL}/login`，用白名单账号登录一次，确认能进入 `/account`；
4. 若使用 R2，确认 bucket 已绑定自定义域或开启 `r2.dev` 公开访问。

### 4. 其他部署方式

- **自托管**：`npm run build && npm run start`，默认端口 3000；同样通过环境变量注入配置。
- **Vercel 的只读文件系统**：未配置 `BLOG_REPO` 时后台会尝试写本地文件，这在 Vercel 上会失败，因此线上必须配置仓库与 PAT。
- **`BLOG_REPO` 指向独立仓库**：适合把内容与代码分离，PAT 只需授权内容仓库。

> `AUTH_SECRET` 一旦泄露即可伪造会话，请使用随机长字符串并定期轮换；GitHub OAuth App 的 Secret 也不要提交进仓库。

---

## 十、已知说明

1. **音频需要用户手势**：首次点击开关或电台按钮后才会创建 `AudioContext`。
2. **字体的覆盖边界**：字体已同源自托管，不依赖 Google Fonts；CJK 子集覆盖站点用字 + GB2312 全部 6763 个汉字，GB2312 之外的更生僻字（如「龘」）仍会回退系统衬线字体，布局不受影响。
3. **Markdoc 序列化**：文章 AST 是 Markdoc 的 `Node` 类实例，传给客户端前必须做 JSON 往返；`MarkdocContent` 按节点类型渲染，新增自定义节点时在它的 `switch` 中补分支即可。
4. **原始 HTML 媒体**：Markdoc 不解析 HTML，`<video>` / `<audio>` 会以文本节点保留，由 `MarkdocContent` 识别 `src` 后渲染为原生播放器。
5. **写入需要令牌**：未配置 `BLOG_GITHUB_TOKEN` 时后台会退回写本地文件，Vercel 等只读环境将无法保存文章。
6. **管理后台类型**：Keystatic 与 Next 16 的配置类型存在版本差异，[keystatic 页面](src/app/keystatic/[[...params]]/page.tsx) 中做了 `ComponentProps` 断言，升级依赖后可复查是否需要保留。
7. **火漆印只有一份几何**：轮廓点集与压印排版在 `waxSeal.ts`，SVG 与 Canvas 同时引用它，任何“只改一边”的调整都会让页面与导出长图对不上；`ctx.letterSpacing` 在不支持的浏览器上会被忽略，仅影响字距，不影响布局。
8. **小尺寸不用火漆**：压印文字低于 14px 时蜡质纹理会把字糊成一团，`≤24px` 的场景一律退回 `.st-seal` 朱印。

---

## 十一、致谢

设计灵感来自 Smartisan OS、锤子便签与那个仍然相信“工匠精神”的年代。代码与文案均为致敬性创作，与锤子科技无隶属关系。
