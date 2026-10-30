# dailyRep Web + API

当前简短网址：[dailyrep-j7h.pages.dev](https://dailyrep-j7h.pages.dev)。通过同账号的Pages服务绑定连接原Worker、D1和私有R2，所有请求保留原始来源和登录Cookie。首次换网址需重新登录，原网址与已安装App的后端地址继续有效。

网页交互回归可运行 `npm run test:ui`，验证周／月／年切换、Excel下载链接及失败提示。装饰背景不接收点击，避免覆盖顶部统计工具栏。Excel生成后保留手动保存链接，切换项目或筛选后释放下载资源。

个人运动打卡网站，也是 [dailyRep App](https://github.com/catanddogmiaomiao/dailyRep) 的共用后端。深海蓝、暖米色、柔金色主题，海岸照片渐变淡入深色内容区。无模拟业务数据，首次登录后从空记录开始。

## 功能

- 四项运动：首页跑步、游泳、俯卧撑、腹肌训练；分别累计 km、m、次、个。
- 记录实际运动时间（默认当前时间，可补录）、运动量、持续时长，可上传一张 JPEG/PNG/WebP 照片（最大8MB）。
- 周／月／年柱状图，按浏览设备本地日历分组，周从周一开始；支持前后周期查看。
- 最近记录、照片查看、确认后删除；按当前运动项目导出全部记录为 `.xlsx`。导出时间使用明确标注的 UTC。
- 单人账号密码登录，首次使用邀请码注册；创建个人账号后关闭注册。Cloudflare D1 持久化账号和记录，私有 R2 保存照片，所有数据、照片和导出接口均要求登录。

## Cloudflare 部署（当前推荐）

网站和 API 由同一个 Worker 提供，记录存 D1，照片存私有 R2；不需要持续运行 Mac。

```sh
npm ci
npx wrangler login
npm run cf:deploy
```

部署脚本复用或创建 `dailyrep` D1 数据库、`dailyrep-photos` R2 桶，更新数据库绑定、应用版本化迁移，生成12位随机邀请码并保存到忽略 Git 的 `.dev.vars`，再部署前端与接口并验证 `/api/health`。需在 Cloudflare 账号启用 R2。多个账号时须在 `wrangler.jsonc` 指定准确 `account_id`。

打开命令输出的 HTTPS 地址，点击“首次使用？创建个人账号”，输入自己的邮箱、至少8位密码和 `.dev.vars` 中的 `SETUP_CODE`。邀请码通过 Worker secret 上传，前端不包含该值。创建唯一账号后其他注册请求返回409。密码使用随机盐和 PBKDF2-SHA256（100000次），会话仅以 SHA256 哈希存储，7天过期。浏览器使用 HttpOnly / SameSite=Strict / HTTPS Secure Cookie，iPhone 使用 SecureStore 中的 Bearer Token。

将同一 HTTPS 地址填写到 App `.env` 的 `EXPO_PUBLIC_API_URL`，不含 `/api`，然后重新打包安装。不要只把 `dist/` 发布到静态 Pages：必须同时部署 Worker、D1、R2。

本地 Cloudflare 环境：复制 `.dev.vars.example` 为 `.dev.vars`，运行 `npx wrangler d1 migrations apply dailyrep --local` 和 `npm run cf:dev`。`npm run test:worker` 在隔离的真实 Workers 本地运行时中验证注册、会话、R2照片、打卡和 Excel，不会创建线上账号或业务数据。

下方 Node/Express 方式作为旧版自托管方案保留，使用独立的本地数据和账号，不会自动迁移到 D1。

## Node/Express 开发启动（旧版）

要求 Node.js **24 LTS**（使用内置 `node:sqlite`）。

```sh
npm ci
cp .env.example .env
# 编辑 .env，设置 OWNER_EMAIL 和至少8位的 OWNER_PASSWORD
npm run server
# 另一个终端
npm run dev
```

打开 Vite 显示的本机地址，使用 `.env` 中的账号登录。Vite 将 `/api` 转发到 `localhost:3001`。手机 App 的 `EXPO_PUBLIC_API_URL` 配置为此 API 的局域网地址或正式 HTTPS 地址。

首次启动创建唯一账号；以后修改 `.env` 不会重置现有账号。忘记密码时请由数据库管理员在备份后删除 `account` 表中的唯一行并重启，使用新环境变量重新初始化；运动记录不会删除。密码使用随机盐和 scrypt 哈希，浏览器使用 HttpOnly / SameSite=Strict Cookie，App 使用 Bearer Token，7天过期。生产默认 Secure Cookie。不要提交 `.env`、数据库和个人照片。

## 生产运行

```sh
npm ci
npm test
npm run build
npm start
```

反向代理将 HTTPS 转发至3001端口；网站和 `/api` 推荐同域。`DATA_DIR` 必须使用持久目录，备份时需包含 SQLite、WAL 文件和 `photos/`（推荐停止服务后统一备份）。仅做本机 HTTP 生产预览时设置 `ALLOW_INSECURE_HTTP=1`；公开服务请保持为空。

也可 Docker：

```sh
docker build -t dailyrep-web .
docker run --env-file .env -p 3001:3001 -v dailyrep-data:/app/data dailyrep-web
```

通过 HTTPS 反向代理访问。不要使用静态托管直接发布 `dist` 来替代 API，登录和同步依赖 Node 服务。CORS 仅在需要独立网页源时设置 `ALLOWED_ORIGIN`，当前客户端推荐同域。

## 验证

```sh
npm test
npm run build
```

测试覆盖记录校验、周月年边界、闰年、运动隔离及真实 HTTP 登录、图片、导出、删除。CI 使用 Node24 执行测试及构建。

当前版本支持iPhone本地系统提醒，没有运动传感器自动采集和离线打卡写入；运动数据由用户填写。App 和网页从同一 API 读取，打开／下拉刷新即可同步。

## 图片

`public/coast.jpg` 为本地打包的海岸照片，来源：[Unsplash](https://images.unsplash.com/photo-1475924156734-496f6cac6ec1)（图片源 `images.unsplash.com/photo-1475924156734-496f6cac6ec1`）。运行时不依赖外部图片服务。主色 `#1F2A44` / `#E8DCC8` / `#C6A75E`。


## 2026-10-28：游泳与腹肌训练分类

游泳打卡可下拉选择蛙泳、蝶泳、自由泳；腹肌训练可选择仰卧起坐、腹肌轮。一次打卡可以添加多条类型明细，每条分别记录运动量和时长，共用运动日期、照片和打卡编号。多种类型合计仍为一次打卡。周、月、年报告提供全部／单类型／未分类筛选；全部类型视图显示各类型累计运动量、时长和次数，柱状图和最近记录随筛选更新。

游泳沿用米；新的腹肌记录按组填写个数，并保留每项总时长。旧版腹肌分钟记录继续标为分钟，不计入个数柱状图。旧记录和旧版App未提供类型的新记录保留为“未分类”，不推测所属类型。

网页Excel导出跟随所选类型，新增中文“运动类型”列；导出仍覆盖该类型全部历史，不限当前报告周期。Cloudflare执行0002增量迁移，旧账号、记录、照片保持原样。


## 分组训练与最近记录

腹肌训练每个项目逐组填写个数，例如仰卧起坐20／20／15个、腹肌轮10／10／8个，同次合计6组83个、1次打卡；俯卧撑也支持逐组填写。支持添加和移除组，每项保留总时长。周月年报告汇总组数、个数、时长和打卡次数，最近记录及Excel展示每一组。

旧版腹肌计时记录原样保留：记录及Excel继续显示分钟，时长和打卡次数保留；分钟不与个数相加，报告给出旧记录说明。


## 长期计划与坚持下一阶段

可选100／150天或自定天数、结束日期，设置日／周／月／年重复。阶段结束后可继续到110／120天或自定新目标，沿用同一计划和打卡记录。支持暂停顺延、实际训练天数与训练日连续完成统计、可选记录关联及报告筛选。iPhone新增本地系统通知与iOS17+桌面小组件，网页可管理同一计划并按计划导出Excel。

安装更新、提醒覆盖范围与小组件连接步骤见 [使用说明](docs/TRAINING_PLANS.md)。新增原生模块需重新生成工程、安装Pods并在Xcode重新安装，Expo Go不包含这些模块。后端需先应用0005迁移；既有记录保留，planId为空即自由打卡。


`pages/` 只提供dailyRep独立网址入口，转发到现有dailyrep Worker，不复制账号或训练数据库。常规 `npm run cf:deploy` 更新Worker后此网址自动使用新版本。仅更改入口绑定时运行 `npx wrangler pages deploy --cwd pages --project-name dailyrep --branch main`。
