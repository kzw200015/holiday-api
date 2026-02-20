# E-Hentai / ExHentai 接口调用需求说明

## 1. 文档目的与范围
本文档用于说明客户端对 E-Hentai / ExHentai 的接口调用能力与业务用途，覆盖：
- 鉴权方式
- 接口地址
- 接口用途
- 接口参数
- 调用方法（HTTP Method / 请求体类型）
- 返回格式
- 关键业务逻辑

说明：
- 本文档只描述对 `e-hentai.org` / `exhentai.org` 及其官方相关域名的调用。
- 仅保留需求与接口语义，不包含实现代码细节。
- 原项目路径：`/Users/kzw200015/Projects/JHenTai`

---

## 2. 站点与鉴权总览

### 2.1 站点域名
- 主站：`https://e-hentai.org`
- 里站：`https://exhentai.org`
- 官方 API：
  - `https://api.e-hentai.org/api.php`
  - `https://exhentai.org/api.php`
- 上传检索：
  - `https://upld.e-hentai.org/image_lookup.php`
  - `https://exhentai.org/upld/image_lookup.php`
- 论坛：`https://forums.e-hentai.org/index.php`

### 2.2 鉴权机制
1. 基础会话 Cookie（必需）
- `ipb_member_id`
- `ipb_pass_hash`

2. EX 访问附加 Cookie（里站必需）
- `igneous`

3. 请求级自动携带 Cookie
- 所有 E/EX 相关域名请求自动附带 Cookie。

4. API 调用附加凭据
- `apiuid`：用户 ID（与 `ipb_member_id` 对应）
- `apikey`：从页面脚本中解析出的短期密钥
- 评分、标签投票、评论投票、标签集更新等能力依赖 `apiuid + apikey`

### 2.3 调用与容错特性
- 站点可在 EH/EX 间切换。
- 部分能力优先请求 EH，失败后回退 EX（或反向）。
- 部分接口返回 `302` 作为正常流程（如以图搜图、标签集更新、部分评论提交场景）。
- 可选“域名前置”策略：请求可改写为 IP + Host 头。

### 2.4 返回格式类型
- HTML 页面（多数业务接口）
- JSON（官方 API）
- `302 Location` 跳转（流程型接口）
- 二进制文件流（图片、归档文件）

---

## 3. 接口清单（按业务域）

## 3.1 登录与账户识别

### 3.1.1 账号密码登录
- 方法：`POST`
- 地址：`https://forums.e-hentai.org/index.php?act=Login&CODE=01`
- 参数（表单）：`UserName`、`PassWord`、`CookieDate` 等
- 鉴权：无（登录入口）
- 返回：HTML + `Set-Cookie`
- 用途：建立会话，获取登录态 Cookie
- 业务逻辑：
  - 成功后提取用户身份 Cookie
  - 失败时从页面提示中提取错误信息（如用户名密码错误、验证码问题）

### 3.1.2 Web 登录页（浏览器容器）
- 方法：`GET`
- 地址：`https://forums.e-hentai.org/index.php?act=Login&CODE=00`
- 鉴权：无
- 返回：HTML
- 用途：在嵌入浏览器中完成人工登录

### 3.1.3 Cookie 校验与用户资料拉取
- 方法：`GET`
- 地址：`https://forums.e-hentai.org/index.php?showuser={userId}`
- 鉴权：会话 Cookie
- 返回：HTML
- 用途：校验 Cookie 是否有效，获取昵称与头像

### 3.1.4 EX 访问凭据刷新（igneous）
- 方法：`GET`
- 地址：`https://exhentai.org`
- 请求头：仅携带 `ipb_member_id` + `ipb_pass_hash`
- 返回：`Set-Cookie`（期望包含 `igneous`）
- 用途：补齐/刷新里站访问所需 Cookie

---

## 3.2 首页、新闻、资产与配额

### 3.2.1 首页信息
- 方法：`GET`
- 地址：`https://e-hentai.org/home.php`
- 鉴权：会话 Cookie
- 返回：HTML
- 用途：读取图像配额、重置成本等账号状态

### 3.2.2 重置图像配额
- 方法：`POST`
- 地址：`https://e-hentai.org/home.php`
- 参数（表单）：`reset_imagelimit=Reset Limit`
- 鉴权：会话 Cookie
- 返回：HTML
- 用途：执行配额重置

### 3.2.3 新闻与事件
- 方法：`GET`
- 地址：`https://e-hentai.org/news.php`
- 鉴权：会话 Cookie
- 返回：HTML
- 用途：读取“每日奖励/事件链接”等动态信息

### 3.2.4 GP/Credits 资产
- 方法：`GET`
- 地址：`https://e-hentai.org/exchange.php?t=gp`
- 鉴权：会话 Cookie
- 返回：HTML
- 用途：读取 GP 与 Credits 当前资产

---

## 3.3 列表检索与排行

### 3.3.1 通用列表检索（主页/热门/收藏/关注）
- 方法：`GET`
- 地址：
  - `https://e-hentai.org` 或 `https://exhentai.org`
  - `https://e-hentai.org/popular` 或 `https://exhentai.org/popular`
  - `https://e-hentai.org/favorites.php` 或 `https://exhentai.org/favorites.php`
  - `https://e-hentai.org/watched` 或 `https://exhentai.org/watched`
- 关键参数（Query）：
  - 分页游标：`prev`、`next`
  - 日期跳转：`seek=YYYY-MM-DD`
  - 搜索词：`f_search`
  - 分类掩码：`f_cats`
  - 扩展过滤：`f_sh`、`f_sto`、`f_spf`、`f_spt`、`f_srdd`、`f_sfl`、`f_sfu`、`f_sft`
  - 收藏分类：`favcat`
- 鉴权：
  - 普通列表可匿名访问（受站点策略影响）
  - 收藏/关注等需登录
- 返回：HTML
- 用途：承载搜索、筛选、滚动翻页、跳转日期

### 3.3.2 排行榜
- 方法：`GET`
- 地址：`https://e-hentai.org/toplist.php`
- 参数：`tl`（日/月/年/总），`p`（页码）
- 鉴权：一般无需额外鉴权
- 返回：HTML
- 用途：展示各周期排行内容

### 3.3.3 收藏排序切换
- 方法：`GET`
- 地址：`https://e-hentai.org/favorites.php` 或 `https://exhentai.org/favorites.php`
- 参数：`inline_set=fs_p|fs_f`
- 鉴权：登录
- 返回：HTML（部分场景会出现重定向）
- 用途：按发布时间/收藏时间切换收藏排序

---

## 3.4 画廊详情、图片页、统计

### 3.4.1 画廊详情页
- 方法：`GET`
- 地址：`https://e-hentai.org/g/{gid}/{token}/` 或 `https://exhentai.org/g/{gid}/{token}/`
- 参数：
  - `p`：缩略图分页页号
  - `hc=1`：显示全部评论
- 鉴权：按站点与内容受限情况决定
- 返回：HTML
- 用途：获取详情、标签、评论、归档入口、种子入口、`apikey`

### 3.4.2 图片页
- 方法：`GET`
- 地址：`https://e-hentai.org/s/{imgToken}/{gid}-{pageNo}` 或 `https://exhentai.org/s/{imgToken}/{gid}-{pageNo}`
- 参数：`nl`（重载键，用于失败重试）
- 鉴权：按资源策略
- 返回：HTML
- 用途：
  - 从图片页解析原图/展示图 URL
  - 在在线阅读、下载任务中逐页解析实际图片地址

### 3.4.3 访问统计
- 方法：`GET`
- 地址：`https://e-hentai.org/stats.php?gid={gid}&t={token}`
- 鉴权：登录，且受权限限制
- 返回：HTML
- 用途：展示总访问量、各周期排名与曲线数据

---

## 3.5 官方 JSON API（`api.php`）

### 3.5.1 元数据查询（单个/批量）
- 方法：`POST`
- 地址：`https://api.e-hentai.org/api.php`（固定）
- 请求体（JSON）：
  - `method=gdata`
  - `gidlist=[[gid,token], ...]`
  - `namespace=1`
- 鉴权：可在受限内容下依赖登录态
- 返回：JSON（`gmetadata` 数组）
- 用途：
  - 详情页失效/下架时回退读取基础元数据
  - 定时刷新已下载内容标签

### 3.5.2 评分提交
- 方法：`POST`
- 地址：`https://api.e-hentai.org/api.php` 或 `https://exhentai.org/api.php`
- 请求体：`method=rategallery` + `gid` + `token` + `rating` + `apiuid` + `apikey`
- 鉴权：登录 + `apiuid/apikey`
- 返回：JSON（常见字段：`rating_usr`、`rating_cnt`、`rating_avg`）
- 用途：提交评分并刷新页面评分状态

### 3.5.3 标签投票/新增标签
- 方法：`POST`
- 地址：`https://api.e-hentai.org/api.php` 或 `https://exhentai.org/api.php`
- 请求体：`method=taggallery` + `gid` + `token` + `vote(1/-1)` + `tags` + `apiuid` + `apikey`
- 鉴权：登录 + `apiuid/apikey`
- 返回：JSON（失败时常带 `error`）
- 用途：标签点赞/点踩、新增标签

### 3.5.4 评论投票
- 方法：`POST`
- 地址：`https://api.e-hentai.org/api.php` 或 `https://exhentai.org/api.php`
- 请求体：`method=votecomment` + `gid` + `token` + `comment_id` + `comment_vote(1/-1)` + `apiuid` + `apikey`
- 鉴权：登录 + `apiuid/apikey`
- 返回：JSON（`comment_score`）
- 用途：评论点赞/点踩并刷新分值

### 3.5.5 标签建议
- 方法：`POST`
- 地址：`https://api.e-hentai.org/api.php` 或 `https://exhentai.org/api.php`
- 请求体：`method=tagsuggest` + `text`
- 鉴权：通常可匿名
- 返回：JSON（标签建议集合）
- 用途：搜索输入联想、标签输入补全

### 3.5.6 关注标签更新（通过 API）
- 方法：`POST`
- 地址：`https://api.e-hentai.org/api.php`（固定）
- 请求体：`method=setusertag` + `tagid/tagcolor/tagwatch/taghide/tagweight` + `apiuid` + `apikey`
- 鉴权：登录 + `apiuid/apikey`
- 返回：JSON
- 用途：修改关注标签的颜色、权重、显示/隐藏状态

---

## 3.6 收藏体系

### 3.6.1 收藏弹窗信息
- 方法：`GET`
- 地址：`https://e-hentai.org/gallerypopups.php` 或 `https://exhentai.org/gallerypopups.php`
- 参数：`gid`、`t`、`act=addfav`
- 鉴权：登录
- 返回：HTML
- 用途：读取收藏分类与已有备注

### 3.6.2 添加收藏 / 更新收藏备注
- 方法：`POST`
- 地址：同上（`gallerypopups.php?gid=...&t=...&act=addfav`）
- 参数（表单）：`favcat`、`favnote`、`apply`、`update=1`
- 鉴权：登录
- 返回：HTML
- 用途：执行收藏并写入备注/分类

### 3.6.3 取消收藏
- 方法：`POST`
- 地址：同上
- 参数（表单）：`favcat=favdel` 等
- 鉴权：登录
- 返回：HTML
- 用途：移除收藏关系

---

## 3.7 评论体系

### 3.7.1 发表评论
- 方法：`POST`
- 地址：画廊详情页地址（`/g/{gid}/{token}/`）
- 参数（表单）：`commenttext_new`
- 鉴权：登录
- 返回：HTML（成功通常无错误文本，失败返回错误提示）
- 用途：新增评论

### 3.7.2 编辑评论
- 方法：`POST`
- 地址：画廊详情页地址（`/g/{gid}/{token}/`）
- 参数（表单）：`edit_comment`、`commenttext_edit`
- 鉴权：登录
- 返回：HTML
- 用途：更新本人评论

---

## 3.8 种子与归档下载

### 3.8.1 种子列表
- 方法：`GET`
- 地址：`https://e-hentai.org/gallerytorrents.php` 或 `https://exhentai.org/gallerytorrents.php`
- 参数：`gid`、`t`
- 鉴权：登录
- 返回：HTML
- 用途：读取种子标题、体积、做种/下载数、下载地址

### 3.8.2 归档页信息
- 方法：`GET`
- 地址：由详情页返回（通常为 `archiver.php`）
- 鉴权：登录
- 返回：HTML
- 用途：读取原档/压缩档价格、体积、可用性

### 3.8.3 解锁归档下载
- 方法：`POST`
- 地址：归档页地址（动态）
- 参数（表单）：
  - `dltype=org|res`
  - `dlcheck=Download Original Archive|Download Resample Archive`
- 鉴权：登录
- 返回：HTML
- 用途：向服务器申请下载会话并获得“继续页”地址

### 3.8.4 获取归档最终下载地址
- 方法：`GET`
- 地址：继续页地址（动态）
- 鉴权：登录
- 返回：HTML（包含实际下载路径）
- 用途：解析出最终文件下载链接

### 3.8.5 取消归档会话
- 方法：`POST`
- 地址：继续页地址（动态）
- 参数（表单）：`invalidate_sessions=1`
- 鉴权：登录
- 返回：HTML
- 用途：释放归档会话

### 3.8.6 H@H 分辨率下载
- 方法：`POST`
- 地址：归档页地址（动态）
- 参数（表单）：`hathdl_xres`
- 鉴权：登录
- 返回：HTML
- 用途：触发指定分辨率的 H@H 下载流程

---

## 3.9 站点设置与标签集

### 3.9.1 站点设置读取
- 方法：`GET`
- 地址：`https://e-hentai.org/uconfig.php` 或 `https://exhentai.org/uconfig.php`
- 鉴权：登录
- 返回：HTML
- 用途：读取显示模式、标题偏好、缩略图设置、配置档列表

### 3.9.2 新建配置档（能力已封装）
- 方法：`POST`
- 地址：`uconfig.php`
- 参数（表单）：`profile_action=create`、`profile_name`、`profile_set`
- 鉴权：登录
- 返回：HTML
- 用途：创建新的站点配置档
- 备注：当前业务流中未发现显式触发入口

### 3.9.3 标签集读取
- 方法：`GET`
- 地址：`https://e-hentai.org/mytags?tagset={n}`
- 鉴权：登录
- 返回：HTML（含标签集列表、标签项、页面内 `apikey`）
- 用途：同步关注标签、隐藏标签、颜色、权重

### 3.9.4 新增关注/屏蔽标签
- 方法：`POST`
- 地址：`https://e-hentai.org/mytags?tagset={n}`
- 参数（表单）：`usertag_action=add`、`tagname_new`、`tagcolor_new`、`tagwatch_new/taghide_new`、`tagweight_new`
- 鉴权：登录
- 返回：常见为 `302` 跳转（视为成功）
- 用途：向标签集增加规则

### 3.9.5 删除标签
- 方法：`POST`
- 地址：同上
- 参数（表单）：`usertag_action=mass` + `modify_usertags[]`
- 鉴权：登录
- 返回：常见为 `302` 跳转
- 用途：批量入口下删除指定标签

### 3.9.6 更新标签集启用状态/背景色
- 方法：`POST`
- 地址：同上
- 参数（表单）：`tagset_action=update`、`tagset_enable`、`tagset_color`
- 鉴权：登录
- 返回：常见为 `302` 跳转
- 用途：编辑标签集属性

---

## 3.10 以图搜图

### 3.10.1 图片反查
- 方法：`POST`（`multipart/form-data`）
- 地址：
  - `https://upld.e-hentai.org/image_lookup.php`
  - `https://exhentai.org/upld/image_lookup.php`
- 参数：
  - 文件字段：`sfile`
  - 搜索开关：`fs_similar=on`、`fs_exp=on`
  - 触发字段：`f_sfile=File Search`
- 鉴权：按站点策略
- 返回：`302 Location`
- 用途：上传图片后获取重定向搜索结果页，再进入常规列表解析流程

---

## 4. 动态接口链路说明（关键业务流程）

## 4.1 详情/阅读主链路
1. 请求列表页（搜索/热门/收藏/关注）拿到画廊 URL。  
2. 请求画廊详情页拿到标签、评论、`apikey`、缩略图分页信息。  
3. 在线阅读时，请求图片页（`/s/...`）逐页解析真实图片下载地址。  
4. 如遇站点重定向策略，按配置进行 EH/EX 互相回退。

## 4.2 评分与投票链路
1. 先从详情页或标签页提取 `apikey`。  
2. 调用 `api.php`（`rategallery`/`taggallery`/`votecomment`）。  
3. 用返回 JSON 更新前端评分、标签投票态、评论分值。

## 4.3 收藏链路
1. 打开收藏弹窗接口获取现有备注与分类。  
2. 调用收藏写接口（新增/变更/删除）。  
3. 再刷新收藏计数与列表状态。

## 4.4 归档下载链路
1. 详情页拿到归档入口 URL。  
2. 请求归档页确认成本与可下载类型。  
3. 提交解锁请求拿到“继续页”。  
4. 从继续页解析最终下载链接并开始下载。  
5. 需要时可取消会话，或走 H@H 分辨率下载分支。

## 4.5 标签集链路
1. 读取 `mytags` 页面获取标签集、标签项和 `apikey`。  
2. 新增/删除走 `mytags` 表单接口。  
3. 颜色/权重/显示隐藏走 `setusertag` API 接口。

---

## 5. 返回与错误语义（业务侧需感知）
- 站点限制类：IP 封禁、Cloudflare 拦截、访问额度超限。
- 内容状态类：画廊删除、版权下架、会话过期。
- 能力限制类：归档余额不足、并发/频率限制（如 429）、无权限查看统计。
- 解析特征：
  - HTML 页内错误文案
  - JSON 的 `error` 字段
  - `302` 跳转（部分接口代表成功）

---

## 6. 调用边界结论
本项目中对 E-Hentai / ExHentai 的调用覆盖以下能力：
- 登录与 Cookie 鉴权（含 EX 凭据刷新）
- 列表检索、排序、分页、跳转日期
- 详情读取、在线阅读、图片地址解析
- 评分、标签投票、评论投票、标签建议
- 收藏管理
- 评论发布与编辑
- 归档下载与 H@H 下载
- 标签集管理
- 资产/配额/新闻/统计

即：业务上已形成“发现内容 -> 查看详情 -> 互动（评分/标签/评论/收藏） -> 下载（图片/归档） -> 设置与资产管理”的完整闭环。

---

## 7. 返回内容字段详细说明
以下字段说明基于实际调用后的页面/JSON解析结果，按业务接口分组给出。

## 7.1 登录与账户相关

### 7.1.1 密码登录（论坛登录接口）
- 返回介质：`Set-Cookie` + HTML
- 关键返回字段：
  - `Set-Cookie.ipb_member_id`（字符串）：用户 ID，会话标识之一。
  - `Set-Cookie.ipb_pass_hash`（字符串）：登录哈希，会话标识之一。
  - `Set-Cookie` 其他站点会话字段：用于维持论坛/站点会话。
  - 登录失败提示文本（HTML 文本）：典型语义为“用户名/密码错误”或“验证码错误”。

### 7.1.2 用户主页信息（论坛用户页）
- 返回介质：HTML
- 提取字段：
  - `用户名`（字符串）
  - `昵称`（字符串）
  - `头像地址`（URL，可空）
- 失败特征：页面出现游客/未登录标识时，视为 Cookie 无效。

### 7.1.3 EX 凭据刷新（访问 `https://exhentai.org`）
- 返回介质：`Set-Cookie`
- 关键字段：
  - `Set-Cookie.igneous`（字符串）：EX 访问关键凭据。
- 特殊值语义：
  - `igneous=mystery`：通常表示当前凭据不可用于里站访问。

---

## 7.2 列表检索与排行返回字段

### 7.2.1 通用画廊列表（搜索/热门/收藏/关注）
- 返回介质：HTML
- 列表项字段（每个画廊）：
  - `画廊链接`（URL，含 gid/token）
  - `标题`（字符串）
  - `分类`（字符串）
  - `封面`（对象）
  - `页数`（整数，可空，取决于页面展示模式）
  - `评分`（小数）
  - `是否已评分`（布尔）
  - `收藏分类序号`（整数 0-9，可空）
  - `收藏分类名称`（字符串，可空）
  - `语言`（字符串，可空）
  - `上传者`（字符串，可空）
  - `发布时间`（字符串）
  - `是否下架/屏蔽`（布尔）
  - `标签集合`（按命名空间分组）
- 分页与页面字段：
  - `prevGid`（字符串或数字，可空）：上一页游标。
  - `nextGid`（字符串或数字，可空）：下一页游标。
  - `总结果数`（对象，可空）：
    - 精确数值（如 `1,465,200`）
    - 模糊等级（hundreds/thousands）
  - `收藏排序方式`（枚举，可空）：按发布时间或按收藏时间。

### 7.2.2 排行榜
- 返回介质：HTML
- 除“通用画廊列表字段”外，额外字段：
  - `总页数`（整数）
  - `上一页页码`（整数，可空）
  - `下一页页码`（整数，可空）

---

## 7.3 画廊详情返回字段

### 7.3.1 详情主字段
- 返回介质：HTML
- 提取字段：
  - `画廊链接`（URL，gid/token）
  - `主标题`（字符串）
  - `日文标题`（字符串，可空）
  - `分类`（字符串）
  - `封面`（对象：`url`、`width`、`height`）
  - `页数`（整数）
  - `用户评分`（小数）
  - `全站平均分`（小数）
  - `是否已评分`（布尔）
  - `评分人数`（整数）
  - `收藏分类序号/名称`（可空）
  - `收藏总人数`（整数）
  - `语言`（字符串）
  - `上传者`（字符串，可空）
  - `发布时间`（字符串）
  - `是否下架/屏蔽`（布尔）
  - `标签`（按命名空间分组，见下）
  - `文件总大小`（字符串）
  - `种子数量`（字符串/整数语义）
  - `种子页地址`（URL）
  - `归档页地址`（URL）
  - `父画廊地址`（URL，可空）
  - `子画廊列表`（数组，可空）
  - `评论列表`（数组）
  - `缩略图列表`（数组）
  - `缩略图总页数`（整数）
  - `apikey`（字符串）：用于评分/投票等 API 请求。

### 7.3.2 标签字段结构
- `标签命名空间`（字符串，如 `artist`、`language`）
- `标签值`（字符串）
- `标签置信状态`（枚举）：可信/存疑/错误
- `当前用户投票状态`（枚举）：上票/下票/未投

### 7.3.3 子画廊字段
- `子画廊链接`（URL）
- `子画廊标题`（字符串）
- `关联时间`（字符串，格式示例 `YYYY-MM-DD HH:mm`）

### 7.3.4 评论字段
- `评论ID`（整数）
- `用户名`（字符串，可空）
- `用户ID`（整数，可空）
- `得分`（字符串，如 `+12`）
- `得分明细`（字符串数组）
- `评论正文`（HTML 片段）
- `发布时间`（字符串）
- `最后编辑时间`（字符串，可空）
- `是否本人评论`（布尔）
- `当前用户是否点赞`（布尔）
- `当前用户是否点踩`（布尔）

---

## 7.4 缩略图与在线阅读字段

### 7.4.1 缩略图分页信息（详情页分页拉取）
- 返回介质：HTML
- 提取字段：
  - `起始图片序号`（整数，0 基）
  - `结束图片序号`（整数，0 基）
  - `图片总数`（整数）
  - `当前缩略图页码`（整数）
  - `缩略图总页数`（整数）
  - `当前页缩略图数组`（见 7.4.2）

### 7.4.2 缩略图项字段
- `图片页链接`（URL，后续进入 `/s/...`）
- `缩略图地址`（URL）
- `是否大图缩略图`（布尔）
- `缩略图宽度`（数字）
- `缩略图高度`（数字）
- `裁剪偏移`（数字，可空）
- `原图哈希`（字符串，可空）

### 7.4.3 图片页字段（`/s/...`）
- 返回介质：HTML
- 提取字段：
  - `展示图地址`（URL）
  - `展示图宽高`（数字）
  - `原图地址`（URL，可空）
  - `原图宽高`（数字，可空）
  - `重载键 nl`（字符串，可空）
  - `图片哈希`（字符串）
- 异常语义：
  - 图片地址为 `509` 占位图时，表示额度受限。

---

## 7.5 官方 JSON API 返回字段

### 7.5.1 元数据接口（`method=gdata`）
- 返回 JSON 结构：
```json
{
  "gmetadata": [
    {
      "gid": 0,
      "token": "string",
      "title": "string",
      "title_jpn": "string",
      "category": "string",
      "thumb": "url",
      "filecount": "string-number",
      "rating": "string-number",
      "posted": "unix-seconds-string",
      "tags": ["namespace:tag", "..."],
      "uploader": "string",
      "expunged": false,
      "filesize": 0,
      "torrentcount": "string-number"
    }
  ]
}
```
- 字段说明：
  - `gid/token`：画廊标识。
  - `title/title_jpn`：标题。
  - `thumb`：封面图。
  - `filecount`：页数。
  - `rating`：评分。
  - `posted`：发布时间（Unix 秒）。
  - `tags`：标签数组。
  - `uploader`：上传者。
  - `expunged`：是否下架/不可见。
  - `filesize`：文件总字节数。
  - `torrentcount`：种子数量。

### 7.5.2 评分返回（`method=rategallery`）
- 常用字段：
  - `rating_usr`（数字）：当前用户评分。
  - `rating_cnt`（整数）：评分总人数。
  - `rating_avg`（数字）：平均分。
  - `rating_cls`（字符串）：前端显示样式信息（可选使用）。

### 7.5.3 标签投票返回（`method=taggallery`）
- 常用字段：
  - `error`（字符串，可空）：存在时表示操作失败原因。

### 7.5.4 评论投票返回（`method=votecomment`）
- 常用字段：
  - `comment_score`（整数）：评论最新分值。

### 7.5.5 标签建议返回（`method=tagsuggest`）
- 返回结构：
  - `tags`（对象/映射）
- 每个候选标签常用字段：
  - `ns`（字符串）：命名空间。
  - `tn`（字符串）：标签文本。

---

## 7.6 收藏、评论、种子返回字段

### 7.6.1 收藏弹窗返回
- 返回介质：HTML
- 提取字段：
  - `收藏分类名称列表`（长度通常为 10）
  - `当前画廊收藏备注`（字符串）

### 7.6.2 收藏页返回
- 返回介质：HTML
- 提取字段：
  - `收藏分类名称列表`（10 项）
  - `每个分类的数量`（10 项整数）

### 7.6.3 评论发布/编辑返回
- 返回介质：HTML
- 返回字段语义：
  - 成功：通常不返回错误文本。
  - 失败：页面中可提取到错误描述文本（如权限/内容限制等）。

### 7.6.4 种子列表返回
- 返回介质：HTML
- 每个种子字段：
  - `标题`（字符串）
  - `发布时间`（字符串）
  - `大小`（字符串）
  - `做种数`（整数）
  - `下载中人数`（整数）
  - `下载完成数`（整数）
  - `上传者`（字符串）
  - `种子下载地址`（URL）
  - `磁力链接`（字符串）
  - `是否过期`（布尔）

---

## 7.7 归档、H@H、统计、设置等返回字段

### 7.7.1 归档页（档案下载入口）
- 返回介质：HTML
- 提取字段：
  - `账户 GP`（整数，可空）
  - `账户 Credits`（整数，可空）
  - `原档价格`（字符串）
  - `原档大小`（字符串）
  - `原档按钮提示文案`（字符串）
  - `压缩档价格`（字符串，可空）
  - `压缩档大小`（字符串，可空）
  - `压缩档按钮提示文案`（字符串）

### 7.7.2 解锁归档返回
- 返回介质：HTML
- 提取结构：
  - `success`（布尔）
  - `msg`（字符串）
  - `continueUrl`（URL，可空）
- 典型失败语义：余额不足、会话不可用等。

### 7.7.3 继续页（最终下载链接）
- 返回介质：HTML
- 提取字段：
  - `downloadUrl`（URL）：归档文件最终下载地址。

### 7.7.4 H@H 信息页
- 返回介质：HTML
- 提取字段：
  - `账户 GP/Credits`（整数，可空）
  - `分辨率档位数组`：
    - `分辨率描述`（字符串）
    - `分辨率参数`（字符串，可空）
    - `大小`（字符串）
    - `成本`（字符串）

### 7.7.5 站点设置页（`uconfig.php`）
- 返回介质：HTML
- 提取字段：
  - `是否偏好日文标题`（布尔）
  - `配置档列表`（数组，每项：`编号`、`名称`、`是否选中`）
  - `首页展示模式`（枚举：Minimal/Compact/Extended/Thumbnail 等）
  - `缩略图尺寸模式`（大/小）
  - `缩略图行数`（整数）

### 7.7.6 首页配额信息（`home.php`）
- 返回介质：HTML
- 提取字段：
  - `是否捐赠用户`（布尔）
  - `当前消耗`（整数，可空）
  - `总额度`（整数，可空）
  - `重置成本`（整数，可空）

### 7.7.7 标签集页（`mytags`）
- 返回介质：HTML
- 提取字段：
  - `标签集列表`（数组，每项：`编号`、`名称`）
  - `当前标签集是否启用`（布尔）
  - `当前标签集背景色`（颜色值，可空）
  - `标签数组`（每项）：
    - `标签ID`（整数）
    - `命名空间`（字符串）
    - `标签值`（字符串）
    - `是否关注`（布尔）
    - `是否隐藏`（布尔）
    - `标签背景色`（颜色值，可空）
    - `权重`（整数）
  - `apikey`（字符串）

### 7.7.8 统计页（`stats.php`）
- 返回介质：HTML
- 提取字段：
  - `总访问量`（整数）
  - `全时段/年/月/日 排名`（整数，可空）
  - `全时段/年/月/日 分数`（整数，可空）
  - `年/月/日 趋势数组`（每项）：
    - `period`（字符串）
    - `visits`（数字）
    - `hits`（数字）

### 7.7.9 新闻事件页（`news.php`）
- 返回介质：HTML
- 提取字段：
  - `dawnInfo`（字符串，可空）：每日收益信息文本。
  - `hvUrl`（URL，可空）：事件跳转链接。

### 7.7.10 资产页（`exchange.php?t=gp`）
- 返回介质：HTML
- 提取字段：
  - `credit`（字符串）：当前 Credits。
  - `gp`（字符串）：当前 GP。

### 7.7.11 以图搜图返回
- 返回介质：`302` 响应头
- 提取字段：
  - `Location`（URL）：重定向到搜索结果页地址。
