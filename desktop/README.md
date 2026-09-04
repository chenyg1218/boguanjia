# 播管家（桌面端）

快手小店跟播辅助。收费计划：**一台免费（1 账号），多台需专业版卡密**。

## 开源声明

本产品基于 [oba-live-tool](https://github.com/qiutongxue/oba-live-tool)（MIT）修改与衍生开发。版权与许可声明见 [`LICENSE`](./LICENSE)、[`NOTICE`](./NOTICE)。

## 系统要求

- **Windows 10 / 11（x64）**
- 本机 **Chrome** 或 **Edge**

## 开发

```bat
cd desktop
pnpm install
pnpm dev
```

## 打包

```bat
cd desktop
pnpm build
```

产物在 `release/<version>/`。

## M0 / M1 能力

| 模块 | 能力 |
|------|------|
| 中控台 | 浏览器检测、有头/无头、连接快手等平台；顶栏任务状态条 |
| 自动发言 | 变量 `{A/B}`、随机空格、置顶、一键刷屏；快手字数风控提示 |
| 自动弹窗 | 商品序号、循环次数、页面内快捷键 |
| 自动回复 | 关键词批量、`{用户名}`、隐藏用户名 |
| 收费 | 顶栏徽章 + 卡密激活；过期自动收敛多余账号 |

用户教程见仓库 [`docs/用户教程.md`](../docs/用户教程.md)。
