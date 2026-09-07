# 播管家（桌面端）

多平台直播跟播辅助。支持抖音小店、巨量百应、抖音团购、小红书千帆、小红书蒲公英、视频号、快手小店、淘宝。收费计划：**基础版 0 元 · 1 账号；专业版 29 元/月 · 3 账号；旗舰版 39 元/月 · 无上限**。

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

### Windows SmartScreen（「已保护你的电脑」）

未签名的安装包会被 SmartScreen 拦截，用户需点「更多信息 → 仍要运行」。若要消除提示，需购买 **代码签名证书**（OV / EV）并在打包时签名，例如设置环境变量后由 electron-builder 自动签名：

- `CSC_LINK`：证书文件路径（或 base64）
- `CSC_KEY_PASSWORD`：证书密码

也可使用 [Azure Trusted Signing](https://learn.microsoft.com/windows/security/application-security/application-control/app-control-for-business/design/trusted-signing)。签名后仍需一段时间积累下载信誉，EV 证书通常可更快通过。

## M0 / M1 能力

| 模块 | 能力 |
|------|------|
| 中控台 | 浏览器检测、有头/无头、连接快手等平台；顶栏任务状态条 |
| 自动发言 | 变量 `{A/B}`、随机空格、置顶、一键刷屏；快手字数风控提示 |
| 自动弹窗 | 商品序号、循环次数、页面内快捷键 |
| 自动回复 | 关键词批量、`{用户名}`、隐藏用户名 |
| 收费 | 顶栏徽章 + 卡密激活；过期自动收敛多余账号 |

用户教程见仓库 [`docs/用户教程.md`](../docs/用户教程.md)。
