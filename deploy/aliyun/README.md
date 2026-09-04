# 播管家 — 阿里云轻量核销

大陆用户直连 `POST /redeem`、`POST /validate`。响应均含 `server_time`。

## 已部署

- 域名（HTTPS）：`https://license.sugaiming.com`
- 健康检查：`https://license.sugaiming.com/health`
- 核销：`https://license.sugaiming.com/redeem`
- 心跳：`https://license.sugaiming.com/validate`
- 源站：本机 `127.0.0.1:8080`（nginx 反代）
- 数据：`/opt/jindou-license/data/cards.db`
- 服务：`systemctl status jindou-license nginx`

客户端授权与选择器已**内置**在程序中（`src/boguanjia/resources/`），发行包 `config/` 仅含 `default_settings.json`。用户修改安装目录旁的文件无法改核销地址或选择器。

开发态可读项目根 `config/license.json`（例如清空 `redeem_url` 走 DEMO）；打包后固定为：

```json
{
  "redeem_url": "https://license.sugaiming.com/redeem",
  "announcement": "购买卡密后在此激活；未到期续充将叠加剩余时长。\n卡密购买：https://www.zaofaka.com/links/1CD589E2",
  "timeout_seconds": 15,
  "offline_grace_days": 2
}
```

`validate_url` 由 `redeem_url` 自动推导为同主机 `/validate`。  
白名单域名内置为 `license.sugaiming.com`；`offline_grace_days` 上限 2 天。

### 服务端密钥（必配）

在服务器创建 `/opt/jindou-license/secrets.env`（权限 600）：

```bash
JINDOU_SIGNING_SEED=<32字节hex，与客户端公钥配对>
JINDOU_API_KEY=<与客户端 license_crypto.API_REQUEST_KEY_HEX 一致>
JINDOU_SESSION_GRACE_DAYS=2
```

本地生成见 `deploy/aliyun/secrets.env.local`（已 gitignore）。部署后：

```bash
sudo cp secrets.env.local /opt/jindou-license/secrets.env
sudo chmod 600 /opt/jindou-license/secrets.env
sudo systemctl restart jindou-license
```

成功响应会多返回 `license_token`（Ed25519 短时凭证）；客户端可离线验签，超过 `g` 天会话宽限必须重新 `/validate`。  
请求体需带 `ts` + `sig`（HMAC），否则返回 401。

## 协议摘要

### POST /redeem

```json
{ "card": "XXXX", "machine_id": "32位本机指纹" }
```

成功：

```json
{
  "ok": true,
  "days": 30,
  "used_at": "2026-08-12T07:00:00Z",
  "expires_at": "2026-09-11T07:00:00Z",
  "replay": false,
  "server_time": "2026-08-12T07:00:01Z"
}
```

- 服务端在 `machines` 表按机器叠加到期；`replay: true` 时不再加天
- 他机再用：`409`

### POST /validate（启动心跳）

```json
{ "machine_id": "..." }
```

返回 `server_time`、是否 `known` / `revoked` / `expired`、以及登记的 `expires_at`。

## HTTPS（上线推荐）

1. 域名 A 记录指向服务器  
2. 核销服务改为本机端口，例如 `JINDOU_HOST=127.0.0.1`、`JINDOU_PORT=8080`（改 `jindou-license.service` 后 `daemon-reload && restart`）  
3. 参考 [nginx-ssl.conf.example](nginx-ssl.conf.example)，用 certbot 签证书  
4. 客户端 `redeem_url` 改为 `https://域名/redeem`

当前无域名时可继续用 HTTP IP；开发阶段可接受，正式对外建议尽快上 HTTPS。

## 导入卡密

```bash
python scripts/generate_cards.py --days 30 --count 50
python3 /opt/jindou-license/import_cards.py /path/to/cards_seed.sql
```

## 重新部署

```bash
# 本机项目根目录
# 必填：JINDOU_SSH_HOST、JINDOU_SSH_PASSWORD
# 可选：JINDOU_SSH_USER（默认 root）
# 首次若无 known_hosts：JINDOU_SSH_TRUST_HOST=1（确认主机后建议写入 known_hosts 并去掉该变量）
python deploy/aliyun/deploy_remote.py
```

部署会自动迁移 `redeemed_by`、`machines` 表。

## 吊销某机（可选）

```bash
sqlite3 /opt/jindou-license/data/cards.db \
  "UPDATE machines SET revoked=1 WHERE machine_id='...';"
```

吊销后：启动心跳会清本地授权；续充/核销会被拒绝，且不会自动把 `revoked` 清回 0。  
解除吊销需手动：`UPDATE machines SET revoked=0 WHERE machine_id='...';`
