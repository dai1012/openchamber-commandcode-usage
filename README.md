English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

# OpenChamber Command Code Usage

A lightweight OpenChamber extension that displays Command Code usage directly
inside OpenChamber.

## Preview

![Command Code Usage preview](assets/preview.png)

## Features

- Plan and account status
- Monthly usage, total allowance, percentage, remaining allowance, and period end
- 5-hour and weekly usage windows with percentages and reset times
- Billing-period requests, cost, input/output tokens, and success rate
- Manual refresh, one refresh when the panel opens, and refreshes every five minutes while it remains open

## Requirements

- OpenChamber with Extension support
- Command Code CLI
- `cmduse`

### macOS setup

```sh
npm i -g command-code@latest
cmd login
brew install JeffreyJYZ/tap/cmduse
```

Verify the CLI installation:

```sh
cmduse -1 --json
```

## Installation

The repository includes the generated files required by OpenChamber. Git URL
installation does not run `npm install` or build TypeScript for the extension,
so `panel/main.js` and `service/main.js` are committed.

## Install in OpenChamber

1. Open OpenChamber.
2. Go to **Settings → Extensions**.
3. Paste `https://github.com/dai1012/openchamber-commandcode-usage`.
4. Click **Add**.
5. Approve the local service permission.

## How it works

```text
OpenChamber panel
    ↓
extension local service
    ↓
cmduse -1 --json
```

The panel calls the extension's local service through the OpenChamber host.
The service discovers and runs the local `cmduse` executable, then returns its
parsed JSON response to the panel.

## Privacy / Security

- The extension does not read `~/.commandcode/auth.json`.
- The extension does not store a Command Code API key.
- Usage data comes only from the local `cmduse -1 --json` command.
- The local service listens only on localhost (`127.0.0.1`).
- The extension does not upload usage data to third-party servers.
- Child-process stdout/stderr is not returned when execution or JSON parsing fails.

## Platform compatibility

Verified:

- macOS Apple Silicon
- OpenChamber 1.24.x

Other platforms may work when `cmduse` is available on `PATH` or configured
through `CMDUSE_PATH`, but they are not claimed as verified here.

## Development

The repository includes TypeScript sources, tests, and the generated files
required by OpenChamber:

```sh
npm install
npm test
npm run build
```

`panel/main.js` is a browser IIFE. `service/main.js` is the Node service
entrypoint required by the OpenChamber local-service contract.
