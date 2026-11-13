# 播管家 — 阿里云轻量核销（独立库）

与金豆助手 **不共用** 核销库与 systemd 服务：

| | 金豆 | 播管家 |
|--|------|--------|
| 目录 | `/opt/jindou-license` | `/opt/boguanjia-license` |
| 库 | `.../data/cards.db` | `.../data/cards.db`（另一份） |
| 端口 | `127.0.0.1:8080` | `127.0.0.1:8081` |
| 域名 | `license.sugaiming.com` | `bgj-license.sugaiming.com` |
| 客户端 | 金豆助手 | 播管家桌面端 |

大陆用户直连 `POST /redeem`、`POST /validate`、`POST /bind-platform`。响应均含 `server_time`。

## 商品规则（播管家）

- **仅月卡**（30 天）：专业版 / 旗舰版  
- **同档续充**：叠加天数  
- **专业机上充旗舰卡**：升级为旗舰并叠加天数  
- **旗舰未到期充专业卡**：拒绝且不烧卡  
- **基础/专业单平台**：绑定成功后写入 `machines.bound_platform`；校验/心跳带回；本地清除后仍按服务端锁定，不可换绑  

## 已部署（目标形态）

- 公网入口（共用 HTTPS 域名，路径隔离）：`https://license.sugaiming.com/bgj/`
- 健康检查：`https://license.sugaiming.com/bgj/health`
- 核销：`https://license.sugaiming.com/bgj/redeem`
- 心跳：`https://license.sugaiming.com/bgj/validate`
- 平台绑定：`https://license.sugaiming.com/bgj/bind-platform`
- 埋点：`https://license.sugaiming.com/bgj/telemetry`
- 反馈：`https://license.sugaiming.com/bgj/feedback`
- 运营看板：`https://license.sugaiming.com/bgj/admin/`（需 `BGJ_ADMIN_PASSWORD`）
- 源站：本机 `127.0.0.1:8081`（nginx `/bgj/` 反代；金豆仍为 `/` → `:8080`）
- 数据：`/opt/boguanjia-license/data/cards.db`（**与金豆库分离**）
- 服务：`systemctl status boguanjia-license nginx`

桌面端核销地址：`https://license.sugaiming.com/bgj/redeem`。

> 说明：Cloudflare 上暂未加 `bgj-license` 子域名时，用路径 `/bgj/` 即可立即上线；库与进程仍完全独立。若以后要单独子域名，见 `nginx-bgj-license.conf.example`。

### 服务端密钥（必配）

在服务器创建 `/opt/boguanjia-license/secrets.env`（权限 600）：

```bash
JINDOU_SIGNING_SEED=<32字节hex，与客户端公钥配对>
JINDOU_API_KEY=<与客户端 license_crypto.API_REQUEST_KEY_HEX 一致>
JINDOU_SESSION_GRACE_DAYS=2
BGJ_ADMIN_PASSWORD=<播管家运营看板登录密码>
```


本地生成见 `deploy/aliyun/secrets.env.local`（已 gitignore）。部署后可自动上传；或：

```bash
sudo cp secrets.env.local /opt/boguanjia-license/secrets.env
sudo chmod 600 /opt/boguanjia-license/secrets.env
sudo systemctl restart boguanjia-license
```

成功响应会多返回 `license_token`（Ed25519 短时凭证）；客户端可离线验签，超过 `g` 天会话宽限必须重新 `/validate`。  
请求体需带 `ts` + `sig`（HMAC），否则返回 401。

## 协议摘要

### POST /redeem

```json
{ "card": "XXXX", "machine_id": "32位本机指纹" }
```

成功示例含 `plan` / `max_accounts` / `bound_platform`。规则：

- **同档续时长，高档可升级，低档在高档未到期时拒绝且不烧卡**
- `replay: true` 时不再加天
- 他机再用：`409`

### POST /validate

```json
{ "machine_id": "32位本机指纹", "bound_platform": "可选，本地已绑时用于治愈上报" }
```

返回 `server_time`、`known` / `revoked` / `expired`、`expires_at` / `plan` / `bound_platform`。  
若服务端尚未绑定且请求携带合法 `bound_platform`，会写入后带回；已绑定则不可覆盖。  
**首见落库**：库中尚无该 `machine_id` 时写入 `plan=free` 占位行（到期为占位时间），响应仍为 `known: false`；用于累计「打开过」的本机指纹。已有行会刷新 `updated_at`（last_seen），不影响授权。

### POST /bind-platform

```json
{ "machine_id": "32位本机指纹", "platform": "douyin" }
```

首次绑定写入服务端；同平台重放 `replay: true`；换绑 `409` 并带回已绑定平台。  
尚无卡密记录的机器会创建占位行（`plan=free`，到期为占位时间）；`/validate` 对此返回 `known: false` 但仍带回 `bound_platform`，避免基础版误报「授权已过期」。  
统计/导出「有效旗舰」须排除占位行与已过期：`plan='flagship' AND revoked=0 AND expires_at > now AND expires_at != '1970-01-01T00:00:00Z'`。

### POST /telemetry

桌面端运营埋点（HMAC 同核销）。事件名白名单：`app_launch` / `platform_selected` / `connect` / `task_start`。

```json
{
  "machine_id": "32位本机指纹",
  "events": [
    { "name": "app_launch", "props": { "app_version": "1.1.4", "plan": "pro" } },
    { "name": "connect", "props": { "platform": "douyin", "result": "ok" } }
  ]
}
```

`props` 仅允许：`platform` / `result` / `reason` / `task_type` / `app_version` / `plan`。  
事件保留约 90 天。

### POST /feedback

桌面端问题反馈（HMAC 同核销）。正文上限约 2000 字；可选最多 3 张 JPEG 截图（客户端先压缩）。  
请求体上限 **2MB**（与核销/埋点的 64KB 分开）；nginx `/bgj/` 需 `client_max_body_size 2m`。  
截图落盘到 DB 同级目录 `feedback_images/`，库表 `feedbacks` 只存元数据与张数。  
同一 `machine_id` 约每小时最多 5 条。

```json
{
  "machine_id": "32位本机指纹",
  "category": "bug",
  "title": "标题",
  "body": "描述",
  "contact": "可选",
  "app_version": "1.3.0",
  "plan": "pro",
  "bound_platform": "douyin",
  "images": [{ "mime": "image/jpeg", "data": "<base64>" }]
}
```

`category`：`bug` / `feature` / `other`。管理端状态：`open` → `read` → `done`（或 `ignored`）；处理后只改状态，不删除。

### POST /feedback/list

按 `machine_id` 拉取本机历史反馈（HMAC 同核销），供客户端「我的提交记录」展示状态。

### GET /admin/

简易运营看板（概览 / 平台与连接 / 功能使用 / 问题反馈）。  
`POST /admin/login` 用管理密码换 token；随后请求需带请求头 `X-Admin-Token`：

- `GET /admin/api/stats?day=YYYY-MM-DD&days=30`
- `GET /admin/api/feedback?status=&limit=50&offset=0`
- `POST /admin/api/feedback/status` `{ "id": 1, "status": "read" }`
- `GET /admin/api/feedback/{id}/image/{index}`（JPEG）

概览指标说明：

| 字段 | 含义 |
|------|------|
| `dau` / 今日启动人数 | 当日 `events.app_launch` 去重机器（需 ≥1.2.0 埋点） |
| `licensed_machines` / 有效授权机 | 未吊销且未过期的付费机（排除占位行） |
| `total_seen_machines` / 累计机器 | `machines` 表行数：曾打过 `/validate`（或核销/绑平台）的本机指纹 |

累计口径注意：

- 统计单位是 **本机指纹**，不是真实人数（一人多机会计多次）。
- 部署「validate 首见落库」**之前**、且当时未激活/未绑平台的打开 **无法回填**。
- 部署之后，各版本只要启动联网打 `/validate`，未激活也会计入；查总数：`SELECT COUNT(*) FROM machines;`

## HTTPS

1. DNS：`bgj-license.sugaiming.com` A 记录指向服务器  
2. 部署 `boguanjia-license` 监听 `127.0.0.1:8081`  
3. 参考 [nginx-bgj-license.conf.example](nginx-bgj-license.conf.example)，certbot 签证书  

## 导入卡密（仅月卡）

用卡密生成器「播管家」项目，或：

```bash
python scripts/generate_cards.py --days 30 --count 50 --plan pro --prefix BGJP
python3 /opt/boguanjia-license/import_cards.py out/cards_seed_pro.sql --db /opt/boguanjia-license/data/cards.db --plan pro

python scripts/generate_cards.py --days 30 --count 50 --plan flagship --prefix BGJF
python3 /opt/boguanjia-license/import_cards.py out/cards_seed_flagship.sql --db /opt/boguanjia-license/data/cards.db --plan flagship
```

## 重新部署

```bash
# 播管家独立服务
set PRODUCT=boguanjia
set JINDOU_SSH_HOST=...
set JINDOU_SSH_PASSWORD=...
python deploy/aliyun/deploy_remote.py

# 金豆（默认）
set PRODUCT=jindou
python deploy/aliyun/deploy_remote.py
```

## 吊销某机（可选）

```bash
sqlite3 /opt/boguanjia-license/data/cards.db \
  "UPDATE machines SET revoked=1 WHERE machine_id='...';"
```
