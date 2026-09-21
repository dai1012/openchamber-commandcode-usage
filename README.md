# OpenChamber Command Code Usage

在 OpenChamber Desktop/Web 中显示 Command Code 使用量。

显示：

- Monthly usage / remaining
- 5-hour window
- Weekly window
- reset time
- requests
- cost
- tokens
- success rate

## Requirements

- OpenChamber with Extension support
- Command Code CLI
- `cmduse`

macOS 安装示例：

```sh
npm i -g command-code@latest
cmd login
brew install JeffreyJYZ/tap/cmduse
```

验证：

```sh
cmduse -1 --json
```

## Install in OpenChamber

1. Open OpenChamber.
2. Go to **Settings → Extensions**.
3. Paste this Git repository URL.
4. Click **Add**.
5. Approve the local service permission.

OpenChamber installs the committed `panel/main.js` and `service/main.js`
directly. It does not run `npm install` or build TypeScript for an extension.

## How it works

```text
OpenChamber panel
    ↓
extension local service
    ↓
cmduse -1 --json
```

The extension does not read `~/.commandcode/auth.json` and does not save a
Command Code API key. Usage data comes only from the local `cmduse` command.
The service also avoids returning child-process stdout/stderr when execution
or JSON parsing fails.

The extension has been verified on macOS Apple Silicon with OpenChamber
1.24.x. Other platforms may work when `cmduse` is on `PATH` or is available
through `CMDUSE_PATH`, but they are not claimed as verified here.

## Development

The repository includes TypeScript sources and the generated files required by
OpenChamber:

```sh
npm install
npm test
npm run build
```

`panel/main.js` is a browser IIFE. `service/main.js` is the Node service
entrypoint required by the OpenChamber local-service contract.
