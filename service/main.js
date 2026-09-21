// service/main.ts
import http from "node:http";

// service/usage.ts
import { access as checkAccess, constants as fsConstants } from "node:fs/promises";
import { execFile as nodeExecFile } from "node:child_process";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
var DEFAULT_CMDUSE_PATHS = [
  "/opt/homebrew/bin/cmduse",
  "/usr/local/bin/cmduse"
];
var MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

class UsageError extends Error {
  kind;
  constructor(kind, message) {
    super(message);
    this.name = "UsageError";
    this.kind = kind;
  }
}
var defaultAccess = async (candidate) => {
  await checkAccess(candidate, fsConstants.X_OK);
};
var candidatesFor = (env, fixedPaths) => {
  const candidates = [];
  const configured = env.CMDUSE_PATH?.trim();
  if (configured)
    candidates.push(configured);
  candidates.push(...fixedPaths);
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    if (directory)
      candidates.push(join(directory, "cmduse"));
  }
  return [...new Set(candidates)];
};
var discoverCmduse = async (options = {}) => {
  const env = options.env ?? process.env;
  const fixedPaths = options.fixedPaths ?? DEFAULT_CMDUSE_PATHS;
  const access = options.access ?? defaultAccess;
  for (const candidate of candidatesFor(env, fixedPaths)) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new UsageError("not-found", "cmduse not found");
};
var defaultExecFile = async (file, args, options) => promisify(nodeExecFile)(file, args, options);
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var runUsage = async (options = {}) => {
  const env = options.env ?? process.env;
  let executable;
  try {
    executable = await (options.discover ?? (() => discoverCmduse({ env })))();
  } catch (error) {
    if (error instanceof UsageError)
      throw error;
    throw new UsageError("not-found", "cmduse not found");
  }
  let result;
  try {
    result = await (options.execFile ?? defaultExecFile)(executable, ["-1", "--json"], {
      env,
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT_BYTES
    });
  } catch {
    throw new UsageError("execution", "cmduse execution failed");
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new UsageError("parse", "cmduse returned invalid JSON");
  }
  if (!isRecord(parsed)) {
    throw new UsageError("parse", "cmduse returned invalid JSON");
  }
  return parsed;
};

// service/main.ts
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
  process.stderr.write(`OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required
`);
  process.exit(1);
}
var json = (res, status, body) => {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
};
var safeUsageFailure = (error) => {
  if (error instanceof UsageError) {
    return {
      status: error.kind === "not-found" ? 503 : 502,
      body: { error: error.message }
    };
  }
  return { status: 502, body: { error: "cmduse execution failed" } };
};
var server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, 401, { error: "unauthorized" });
    return;
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && url.pathname === "/usage") {
    runUsage().then((payload) => json(res, 200, payload), (error) => {
      const failure = safeUsageFailure(error);
      json(res, failure.status, failure.body);
    });
    return;
  }
  json(res, 404, { error: "not-found" });
});
server.on("error", () => process.exit(1));
server.listen(port, "127.0.0.1");
