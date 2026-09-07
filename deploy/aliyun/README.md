# 播管家 — 阿里云轻量核销（独立库）

与金豆助手 **不共用** 核销库与 systemd 服务：

| | 金豆 | 播管家 |
|--|------|--------|
| 目录 | `/opt/jindou-license` | `/opt/boguanjia-license` |
| 库 | `.../data/cards.db` | `.../data/cards.db`（另一份） |
| 端口 | `127.0.0.1:8080` | `127.0.0.1:8081` |
| 域名 | `license.sugaiming.com` | `bgj-license.sugaiming.com` |
| 客户端 | 金豆助手 | 播管家桌面端 |

大陆用户直连 `POST /redeem`、`POST /validate`。响应均含 `server_time`。

## 商品规则（播管家）

- **仅月卡**（30 天）：专业版 / 旗舰版  
- **同档续充**：叠加天数  
- **专业机上充旗舰卡**：升级为旗舰并叠加天数  
- **旗舰未到期充专业卡**：拒绝且不烧卡  

## 已部署（目标形态）

- 公网入口（共用 HTTPS 域名，路径隔离）：`https://license.sugaiming.com/bgj/`
- 健康检查：`https://license.sugaiming.com/bgj/health`
- 核销：`https://license.sugaiming.com/bgj/redeem`
- 心跳：`https://license.sugaiming.com/bgj/validate`
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

成功示例含 `plan` / `max_accounts`。规则：

- **同档续时长，高档可升级，低档在高档未到期时拒绝且不烧卡**
- `replay: true` 时不再加天
- 他机再用：`409`

### POST /validate

返回 `server_time`、`known` / `revoked` / `expired`、`expires_at` / `plan`。

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
