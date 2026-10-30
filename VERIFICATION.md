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


## 2026-10-28：修正为一次打卡包含多条明细

- 一次游泳支持蛙泳／蝶泳／自由泳多行明细，一次腹肌训练支持仰卧起坐／腹肌轮多行明细；分别填写运动量、分秒，共享日期照片，只保存一条父记录。提供添加／移除行，避免重复选择同类。
- 后端校验非空明细、有效且不重复的项目类型、正运动量与正整数时长，重新计算父记录合计；拒绝用请求中的伪造总量覆盖明细总和。全部明细以一个SQLite/D1行原子保存。
- 按分类查询时只累计该分类的明细数值，总打卡数始终按匹配父记录计；混合记录不进入“未分类”。最近记录仍是一条，Excel按明细分行但共享打卡编号。
- 用户示例蛙泳400米／蝶泳100米／自由泳1000米验证：总计1500米、1次打卡，蝶泳筛选100米。周月年三种周期、混合腹肌与历史单类型／未分类混排均通过测试。
- Express/domain/statistics共12项测试、Cloudflare真实本地运行时1项测试通过，验证HTTP保存读取、按类型Excel和整次删除；App9项测试、类型检查、生产Hermes JS包导出通过。原生JSX静态检查未发现Text外裸文本。未新增原生依赖，未进行本轮真机交互验收。
- 兼容既有0001/0002数据，0003仅新增可空details列；不推测旧三次记录是否属于同一场运动，不自动合并旧记录。

- 网页及后台发布版本9ea4ac50-5aff-4808-ad59-f6885091df0a，0003增量迁移成功；已核验线上新静态资源、D1列定义与健康接口200。部署脚本首次健康请求连接重置，独立curl重试通过。未读取、创建或删除线上运动记录用于测试。


## 2026-10-28：分组训练、次数单位与手机记录操作

- 腹肌训练改为每项目逐组填写个数；俯卧撑也支持组数。保存每组正整数，自动合计数量，每项目保留总时长；重复类型及零值／小数／超过100组／超出总量限制均拒绝。一次含多项目仍只算一次打卡。
- 新腹肌quantityUnit=reps；历史及旧客户端总量输入仍为minutes，保留原记录，统计按组数／个数汇总，旧分钟不与个数合并；旧记录仍参与时长及打卡次数，报告说明并在记录与Excel保留原单位。0004只增加可空单位列。
- App右侧改为76×76私有照片缩略图，附带Bearer请求；无照片／加载中／失败均有占位反馈。卡片水平左滑露出红色删除，垂直滚动不抢手势，右滑及滚动收起，同时只展开一条。滑到底不会触发删除，点击删除后沿用确认框并删除整次记录及共享照片；VoiceOver提供删除辅助操作。
- App12项测试、TypeScript、原生JSX静态检查及生产Hermes JS包导出通过；网页／Express／domain/statistics15项测试、Cloudflare本地真实运行时1项测试和网页生产构建通过。覆盖每组数据往返、按组求和、个数和历史分钟隔离、组数汇总、Excel H列与真实单位，以及滑动阈值／边界。未新增原生依赖。
- 真机的滑动手感、缩略图首次加载和照片关闭安全区仍需安装后验收，本轮没有声称已完成真机触控验证。

- Cloudflare发布版本8904d1e2-7616-4131-8aca-4c1214a8474a，0004迁移与远端schema列核验成功，线上首页已返回新资源index-BPi41EV3.js。部署后首次健康自检和部分独立请求遭遇TLS连接重置；未把传输失败记作业务成功，未操作线上运动记录作测试。

- 后续独立核验：使用公共DNS核验得到的两条地址、保留原域名和TLS证书校验分别访问健康接口，均返回{ok:true}；确认后台业务健康。该核验不代表用户手机的DNS／蜂窝网络路径已恢复。
# Long-term plans (2026-10-28)

- All 23 Node tests and Cloudflare local runtime integration passed, including plan creation/conflicts, record linkage, pause/resume, milestone continuation, stale revision 409, Excel filtering and readonly widget link revocation.
- Vite production build passed. Both repositories have identical src/plans.js.
- Browser test with local simulated data confirmed a completed 100-day stage extends to 110 without resetting history. No production training records created.
- Additive migration 0005 preserves old records as unlinked; existing login/photo/data authentication remains required.
- iPhone unsigned Release and WidgetKit extension compiled. Notification delivery and live widget refresh still need physical-device acceptance.
# Web toolbar correction (2026-10-30)

The decorative header pseudo-element extends 35px over the toolbar and now has pointer-events:none. Export appends a download anchor to the document, retains a visible save link until navigation/replacement, surfaces API errors and has a 30s timeout. npm run test:ui verifies actual React DOM period changes (month/year/week), download attachment/fallback/error feedback and URL cleanup. All 23 backend tests, the Cloudflare local-runtime integration and Vite build passed. Full browser hit-testing was unavailable because the current macOS sandbox rejected browser Mach-port registration; DOM checks do not claim pixel-level verification. Published after OAuth renewal. The new assets are live, dailyrep-j7h.pages.dev is a custom domain on the same Worker, /api/health returns200, and unauthenticated /api/records returns401. Existing workers.dev remains enabled.

Independent dailyRep address correction (2026-10-30): dailyrep-j7h.pages.dev serves the real dailyRep title and current JS/CSS assets; /api/health returns200 and unauthenticated /api/records returns401. Pages forwards all requests to the existing dailyrep Worker through a service binding, preserving origin/cookies and database ownership. A local regression verifies origin/cookie preservation, XLSX bytes, Content-Disposition and Set-Cookie passthrough. The mistakenly attached unrelated custom domain was unbound; existing data and the original workers.dev endpoint remain in place.
