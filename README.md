# 播管家

快手直播跟播辅助。**仅支持快手小店**。桌面端为外置中控台（基于 [oba-live-tool](https://github.com/qiutongxue/oba-live-tool)），收费计划：一台免费，多台收费。

## 当前产品入口

```bat
cd desktop
pnpm install
pnpm dev
```

- 系统：**Windows 10 / 11（x64）**
- 依赖本机 **Chrome 或 Edge**
- 说明：[desktop/README.md](desktop/README.md) · [docs/用户教程.md](docs/用户教程.md)
- 核销部署：[deploy/aliyun/README.md](deploy/aliyun/README.md)

## 收费计划（不变）

| | 免费版 | 专业版（卡密） |
|--|--------|----------------|
| 账号 | 1 个 | 多账号多开 |
| 连接中控台 / 自动弹窗 / 自动发言 / 自动回复 | 可用 | 可用 |

## 仓库说明

| 目录 | 用途 |
|------|------|
| `desktop/` | **主程序**（仅快手） |
| `deploy/` | 卡密核销服务端 |
| `src/boguanjia/auth` 等 | 旧 Python 核销协议参考 |

第三方致谢见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
