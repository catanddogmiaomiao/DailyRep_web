# 验证记录 · 2026-10-24

已在本地实际执行并通过：

- `npm test`：6项测试通过；其中真实HTTP集成测试覆盖登录失败／成功、未登录保护、记录保存、图片鉴权、ExcelJS读取导出文件内容、记录与照片删除、退出后会话失效。
- `npm run build`：Vite生产构建通过，1574模块，生成HTML、CSS、JS与本地图标／海岸素材。
- 本地生产服务首页HTTP200。
- 在浏览器实际登录测试账号，进入四项运动首页，打开跑步报告，填写7km／42分钟并保存；报告显示7km、1次、42分钟，周六柱状图与最近记录同步更新。
- 检查窄屏页面；修复登录或切换页面后未返回顶部的问题，同时修正周日图表提示文字。

`build` 和 `dev` 显式使用 Vite 的 `runner` 配置加载器，避免本机默认配置打包器停滞。

尚未完成：外部服务器部署、正式域名／HTTPS配置与个人账号初始化。当前源码上传不代表已经获得可从互联网访问的网站。实际个人数据由部署时的环境变量和持久数据目录管理，仓库不含个人密码或运动记录。


## 2026-10-27 Cloudflare 改造

- 新增 Worker API、D1 初始迁移、私有 R2 照片绑定、同域静态资源托管配置。
- 新增邀请码保护的单账号首次注册；唯一主键与 INSERT OR IGNORE 防止重复创建；之后注册关闭。
- PBKDF2-SHA256 随机盐密码哈希、服务端哈希会话、登录限流、跨站写请求校验、8MB照片签名验证。
- Workers 本地运行时集成测试通过：注册拒绝与成功、已注册拒绝、登录、会话哈希及过期、私有照片上传读取、运动记录增删、真实 Excel 解析、注销、限流。测试隔离，不创建线上账号。
- 原有6项测试通过，Vite生产打包通过，wrangler deploy --dry-run 打包通过（Worker gzip约303KB）。
- iPhone 新增首次注册表单、网络超时及面向用户的连接错误提示；类型检查和3项测试通过。
- Cloudflare OAuth 授权已完成；已创建 D1 dailyrep 和私有 R2 dailyrep-photos，应用7条初始化SQL并完成发布。
- 线上地址：https://dailyrep.catanddogmiaomiao.workers.dev 。版本 c0e9c7c8-c9c8-4e96-9a3c-7684ee319f11；发布脚本验证 /api/health 返回 ok=true。
- iPhone 本机 .env 已配置同一 HTTPS 地址，首次个人账号留给用户自行注册。

- 线上 HTTP 验证：首页200、health200、setup200且可注册，records/export/photos均401；Safari 实际显示登录页与完整首次注册表单。内置浏览器访问workers.dev出现连接重置，Safari与终端访问正常。
- 含线上URL和注册功能的 iPhone arm64 Release 原生构建再次通过（无签名；实际重新安装与真机登录仍待用户操作）。


## 2026-10-27 iPhone照片格式修复

- 根因：旧App把所有图片固定标为 image/jpeg/checkin.jpg，却未转换真实内容；PNG和HEIC可能被后端拒绝。
- Worker按实际JPEG/PNG/WebP文件签名确定Content-Type，不再把不准确的multipart MIME视为图片损坏；不支持的内容仍拒绝。
- Cloudflare真实本地运行时回归测试：把PNG内容标为JPEG上传成功，读取仍为image/png；伪造PNG内容仍返回400。
- 修复已发布，版本6b7ac98e-29b4-492b-9372-7e163ef16fea。未读取或修改用户线上照片和记录。


## 2026-10-28：分类打卡及报告

- 新增可空subtype字段：蛙泳breaststroke、蝶泳butterfly、自由泳freestyle；仰卧起坐situps、腹肌轮abwheel。验证拒绝不存在和跨项目类型，兼容旧客户端省略类型。
- App／网页打卡加入下拉选择；报告加入分类总量、总时长和次数，并同步筛选周月年柱状图与最近记录。历史无类型数据单列未分类。两个仓库的统计和类型定义源码一致。
- Express测试9项、Cloudflare真实本地运行时测试1项通过，覆盖五种类型持久化、非法类型拒绝、分类Excel真实文件、空值兼容和增量迁移保存旧数据；网页生产构建通过。
- App测试7项、TypeScript检查和iOS生产Hermes JS包导出通过。未新增原生依赖。Xcode命令行原生编译受本次运行环境服务权限限制，提示workspace无法识别；没有将其记为编译通过。未取得真机交互和截图验收结果。

- Cloudflare增量迁移0002成功，已部署版本6ba267ba-6a22-4213-9237-25251b1a9add；首次健康请求遇到ECONNRESET，独立重试返回{ok:true}。未创建或删除线上运动记录来测试。
