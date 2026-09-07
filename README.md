# 播管家

直播跟播辅助。支持抖音小店、巨量百应、抖音团购、小红书千帆、小红书蒲公英、视频号、快手小店、淘宝。桌面端为外置中控台（基于 [oba-live-tool](https://github.com/qiutongxue/oba-live-tool)），收费计划：基础版 0 元 · 1 账号；专业版 29 元/月 · 3 账号；旗舰版 39 元/月 · 无上限。

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

## 收费计划

| | 基础版 | 专业版 | 旗舰版 |
|--|--------|--------|--------|
| 价格 | 0 元 | 29 元 / 月 | 39 元 / 月 |
| 账号 | 1 个 | 3 个 | 无上限 |
| 连接中控台 / 自动弹窗 / 自动发言 / 自动回复 | 可用 | 可用 | 可用 |

## 仓库说明

| 目录 | 用途 |
|------|------|
| `desktop/` | **主程序**（多平台） |
| `deploy/` | 卡密核销服务端 |
| `src/boguanjia/auth` 等 | 旧 Python 核销协议参考 |

第三方致谢见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
