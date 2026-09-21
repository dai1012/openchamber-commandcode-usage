[English](README.md) | 简体中文 | [日本語](README.ja.md)

# OpenChamber Command Code Usage

一个轻量的 OpenChamber 扩展，直接在 OpenChamber 中显示 Command Code 使用量。

## 预览

![Command Code Usage preview](assets/preview.png)

## 功能

- 显示套餐和账户状态
- 显示月度已用金额、总额度、百分比、剩余额度和计费周期结束日期
- 显示 5 小时和每周使用窗口、百分比及重置时间
- 显示当前计费周期的请求数、费用、输入/输出 token 数和成功率
- 支持手动刷新；面板打开时自动刷新一次，保持打开时每五分钟刷新一次

## 使用要求

- 支持 Extension 的 OpenChamber
- Command Code CLI
- `cmduse`

### macOS 安装

```sh
npm i -g command-code@latest
cmd login
brew install JeffreyJYZ/tap/cmduse
```

验证 CLI 是否可用：

```sh
cmduse -1 --json
```

## 安装

仓库中已经包含 OpenChamber 运行所需的构建文件。通过 Git URL 安装时，
OpenChamber 不会替扩展执行 `npm install` 或构建 TypeScript，因此仓库会提交
`panel/main.js` 和 `service/main.js`。

## 在 OpenChamber 中安装

1. 打开 OpenChamber。
2. 进入 **Settings → Extensions**。
3. 粘贴 `https://github.com/dai1012/openchamber-commandcode-usage`。
4. 点击 **Add**。
5. 批准 local service 权限。

## 工作原理

```text
OpenChamber panel
    ↓
扩展 local service
    ↓
cmduse -1 --json
```

面板通过 OpenChamber host 调用扩展的本地服务。服务发现并执行本机的
`cmduse`，然后将解析后的 JSON 响应返回给面板。

## 隐私 / 安全

- 扩展不会读取 `~/.commandcode/auth.json`。
- 扩展不会保存 Command Code API key。
- usage 数据仅来自本机的 `cmduse -1 --json` 命令。
- local service 仅监听 localhost（`127.0.0.1`）。
- 扩展不会向第三方服务器上传 usage 数据。
- 执行失败或 JSON 解析失败时，不会返回子进程的 stdout/stderr。

## 平台兼容性

已验证：

- macOS Apple Silicon
- OpenChamber 1.24.x

其他平台在 `cmduse` 位于 `PATH` 中，或通过 `CMDUSE_PATH` 配置时，理论上可能可用；
但目前不宣称已验证。

## 开发

仓库包含 TypeScript 源码、测试以及 OpenChamber 所需的构建文件：

```sh
npm install
npm test
npm run build
```

`panel/main.js` 是浏览器 IIFE。`service/main.js` 是 OpenChamber local-service
contract 要求的 Node service 入口。
