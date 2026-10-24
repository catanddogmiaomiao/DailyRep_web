# dailyRep Web + API

个人运动打卡网站，也是 [dailyRep App](https://github.com/catanddogmiaomiao/dailyRep) 的共用后端。深海蓝、暖米色、柔金色主题，海岸照片渐变淡入深色内容区。无模拟业务数据，首次登录后从空记录开始。

## 功能

- 四项运动：首页跑步、游泳、俯卧撑、腹肌训练；分别累计 km、m、次、分钟。
- 记录实际运动时间（默认当前时间，可补录）、运动量、持续时长，可上传一张 JPEG/PNG/WebP 照片（最大8MB）。
- 周／月／年柱状图，按浏览设备本地日历分组，周从周一开始；支持前后周期查看。
- 最近记录、照片查看、确认后删除；按当前运动项目导出全部记录为 `.xlsx`。导出时间使用明确标注的 UTC。
- 单人账号密码登录，无公开注册。SQLite 持久化记录，磁盘保存照片。所有数据、照片和导出接口均要求登录。

## 开发启动

要求 Node.js **24 LTS**（使用内置 `node:sqlite`）。

```sh
npm ci
cp .env.example .env
# 编辑 .env，设置 OWNER_EMAIL 和至少12位的 OWNER_PASSWORD
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

当前版本没有推送提醒、运动传感器自动采集和离线写入；运动数据由用户填写。App 和网页从同一 API 读取，打开／下拉刷新即可同步。

## 图片

`public/coast.jpg` 为本地打包的海岸照片，来源：[Unsplash](https://images.unsplash.com/photo-1475924156734-496f6cac6ec1)（图片源 `images.unsplash.com/photo-1475924156734-496f6cac6ec1`）。运行时不依赖外部图片服务。主色 `#1F2A44` / `#E8DCC8` / `#C6A75E`。
