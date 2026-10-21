<h1 align="center">TokTik</h1>

<p align="center">
  把服务器上的视频库变成刷不完的抖音 —— 多账号、服务端信源、跨设备同步
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/zyronon/douyin" alt="License"></a>
  <img src="https://img.shields.io/badge/Vue-3-blue" alt="Vue 3">
  <img src="https://img.shields.io/badge/Node-20%2B-green" alt="Node 20+">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
</p>

TokTik 是一个**自托管**的本地视频库“抖音”客户端。它基于
[zyronon/douyin](https://github.com/zyronon/douyin) 的竖屏滑动播放内核改造而来：

- 前端是纯 Vue 页面，只与同源 `/api` 通信，**不持有任何信源凭据**，也没有 IndexedDB 业务数据。
- Node 后端直接连接**服务器本地目录 / WebDAV / FTP / SMB**，视频流与封面经后端转发并支持 Range 拖动。
- 账号、会话、喜欢、历史、播放进度、偏好都存在服务器上；换设备登录同一账号即可续看。
- 视频库（数据源、索引、封面、启用状态）**全服务器共享**，只有喜欢/历史/进度/偏好按账号隔离。
- 用服务器上的 `ffmpeg` / `ffprobe` 刮削时长、分辨率并抽帧做封面。

## 功能

| 能力 | 说明 |
| --- | --- |
| 多账号 | scrypt 密码哈希 + HttpOnly Cookie 会话（30 天滑动过期）；首个账号即管理员注册入口 |
| 数据源 | 服务器目录、WebDAV、FTP（含 FTPS）、SMB，全部由后端连接，凭据不出服务器 |
| 自动扫描 | 从根路径递归遍历（深度上限 64），识别视频扩展名、按目录聚合成“合集”、从文件名解析集数 |
| 服务端刮削 | `ffprobe` 读时长/分辨率，`ffmpeg` 抽一帧生成 WebP 封面；并发 2、失败自动降级为文字封面 |
| 媒体转发 | `GET/HEAD /api/media/stream/:id` 支持 `Range`（206/416），`/api/media/cover/:id?v=coverAt` 带版本缓存 |
| 视频筛选 | 逐条启用/禁用；按数据源、关键词、时长、大小、刮削状态筛选后批量操作，禁用项全局隐藏 |
| 竖屏推流 | 上下滑动切条、点击暂停、双击喜欢、进度条拖动，进度上报到服务器 |
| 推荐流 | seed 驱动的伪随机洗牌（每个账号独立），同合集交错，翻页稳定不重复 |
| 喜欢 / 历史 | 按账号保存，支持续播；历史可单条删除或清空 |
| 本地库管理 | 合集网格、标题搜索、失效条目清理、重新刮削、库统计 |

## 快速开始

```bash
pnpm install
pnpm dev:all        # 后端 127.0.0.1:8787 + 前端 http://localhost:3000
```

打开 http://localhost:3000 ，首次进入会要求**创建管理员账号**，随后即可添加数据源。

也可以分开启动：

```bash
pnpm dev:server     # tsx watch server/index.ts（后端，默认 8787）
pnpm dev            # vite（默认 3000，/api 代理到 127.0.0.1:8787）
```

生产部署：

```bash
pnpm build          # 产物在 dist/
pnpm start          # tsx server/index.ts，自动托管 dist/ 并做 SPA 回退
```

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 后端监听端口 |
| `HOST` | `0.0.0.0` | 后端监听地址（`127.0.0.1` 只允许本机） |
| `TOKTIK_DATA` | `./data` | 数据目录（账号、会话、索引、封面、喜欢/历史） |
| `TOKTIK_ALLOW_REGISTER` | `0` | 设为 `1` 允许任意人注册；关闭后只有已有账号可登录 |
| `TOKTIK_SECURE_COOKIE` | `0` | 走 HTTPS 反代时设为 `1`，Cookie 加 `Secure` |
| `TOKTIK_FFMPEG` / `TOKTIK_FFPROBE` | `ffmpeg` / `ffprobe` | 自定义二进制路径 |
| `TOKTIK_API` | `http://127.0.0.1:8787` | 仅开发态：vite 的 `/api` 代理目标 |

### 数据目录

```
data/
├── secret.key          # 媒体签名密钥（0600，ffmpeg 读取自身流用）
├── users.json          # 账号（scrypt 哈希）
├── sessions.json       # 会话
├── sources.json        # 全局数据源（含信源密码，建议把 data/ 设为 700）
├── videos.json         # 全局视频索引
├── meta.json           # 上次扫描时间等
├── covers/<sha1>       # 封面二进制（WebP）
├── likes/<userId>.json
├── history/<userId>.json
└── prefs/<userId>.json
```

首次进入引导页后点「添加数据源」：

1. **服务器目录** —— 填后端机器上的绝对路径，例如 `/mnt/media`；播放与刮削都由后端读文件。
2. **WebDAV** —— 填站点地址与账号，点「测试连接」由后端探测（不受浏览器 CORS 限制）。
3. **FTP / SMB** —— 填主机、端口与凭据，同样由后端连接。

保存后回到「数据源」页点「扫描」，扫描结束会自动开始刮削封面与时长。

### 生成测试素材

```bash
bash scripts/make-fixtures.sh /tmp/toktik-fixtures   # 需要 ffmpeg
pnpm dev-webdav /tmp/toktik-fixtures 8000            # 起一个带 CORS 的本地 WebDAV
```

然后把 `/tmp/toktik-fixtures` 作为「服务器目录」数据源，或把 `http://127.0.0.1:8000/` 作为 WebDAV 数据源，即可完整跑通链路。

## 架构

```
浏览器 (Vue + axios)
   │  同源 /api（HttpOnly Cookie 会话）
   ▼
Node 后端 (server/*.ts, tsx 运行)
   ├─ auth        注册/登录/会话（scrypt + Cookie/Bearer）
   ├─ store       JSON 持久层（原子写 + 200ms 防抖）
   ├─ drivers     local(fs) / webdav(fetch) / ftp(basic-ftp) / smb(@marsaud/smb2)
   ├─ scan        递归列目录、增量保存索引、失效标记
   ├─ meta        ffmpeg 刮削（经签名 URL 读自身流，不整片下载）
   ├─ media       Range 流与封面转发
   └─ static      生产环境托管 dist/，SPA 回退
```

```
shared/                 # 前后端共享的纯类型与工具（@shared 别名）
server/                 # 后端：http 入口、路由、驱动、扫描、刮削、媒体转发
├── http/{server,api,router}.ts
├── drivers/{local,webdav,ftp,smb}.ts
└── {store,auth,scan,meta,media,aweme,feed,manage,prefs}.ts
src/
├── api/                # 真实 axios 请求封装（auth/source/user/videos/library）
├── pages/              # login / home / collections / likes / history / search / sources / settings / me
│   ├── library/        # 视频管理（筛选与启用/禁用）
│   └── login/          # 登录 / 首次创建管理员
├── components/slide/   # 竖屏滑动内核
└── router/             # /login 与全局登录守卫
```

一次播放请求的链路：

```
组件 → api/videos.ts → utils/request.ts (axios, 同源 /api)
     → server/http/api.ts → store / drivers → aweme 组装（封面与播放地址指向 /api/media/*）
<video src="/api/media/stream/:id"> → server/media.ts → 驱动按 Range 读取 → 206 分片
```

## 安全说明

- 信源密码以明文保存在 `data/sources.json`（后端需要它主动登录 NAS），请限制数据目录权限并避免把 `data/` 提交到仓库。
- 所有业务端点除 `/api/health`、`/api/auth/login|register` 与短时效签名的媒体地址外，未登录一律返回 401。
- 登录失败按「IP + 账号」限流：10 次失败后锁定 5 分钟。
- 任何已登录账号都能增删数据源（共享库语义）；如需管理员分级可后续扩展角色。

## 已知限制

- **浏览器只认 mp4 / webm / mov 等容器**。`mkv`、`avi`、`flv` 会被索引并展示，但播放时会提示“浏览器不支持该格式”，需要事先转码。
- **ffmpeg 是可选依赖**。没有 ffmpeg 时扫描与播放仍可用，但时长/分辨率为 0、封面退化为文字兜底，`/api/health` 会返回 `ffmpeg:false`。
- **视频管理里的时长筛选依赖刮削完成**。`durationMs` 为 0 的条目不参与时长上下限筛选，管理页会单独提示待刮削数量。
- **不迁移旧版浏览器数据**。旧版把库放在 IndexedDB 里，与新服务器模型不同源；升级后需要重新添加数据源并扫描（旧的喜欢/历史不会带走）。
- **JSON 持久层适合中小规模库**（数千到数万条）；更大规模建议换数据库。
- **信源由服务器访问**，因此 SMB/WebDAV/FTP 必须能被这台服务器访问到；浏览器所在设备能否访问无关。

## 致谢与许可

播放内核、手势与整体视觉来自 [zyronon/douyin](https://github.com/zyronon/douyin)，遵循 GPL-3.0。
本项目同样以 GPL-3.0 发布，详见 [LICENSE](LICENSE)。
