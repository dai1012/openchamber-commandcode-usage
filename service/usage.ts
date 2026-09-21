import { access as checkAccess, constants as fsConstants } from 'node:fs/promises';
import { execFile as nodeExecFile } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

export const DEFAULT_CMDUSE_PATHS = [
  '/opt/homebrew/bin/cmduse',
  '/usr/local/bin/cmduse',
] as const;

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export type UsagePayload = Record<string, unknown>;

export type UsageFailureKind = 'not-found' | 'execution' | 'parse';

export class UsageError extends Error {
  readonly kind: UsageFailureKind;

  constructor(kind: UsageFailureKind, message: string) {
    super(message);
    this.name = 'UsageError';
    this.kind = kind;
  }
}

type AccessExecutable = (candidate: string) => Promise<void>;

export type DiscoveryOptions = {
  env?: NodeJS.ProcessEnv;
  fixedPaths?: readonly string[];
  access?: AccessExecutable;
};

const defaultAccess: AccessExecutable = async (candidate) => {
  await checkAccess(candidate, fsConstants.X_OK);
};

const candidatesFor = (env: NodeJS.ProcessEnv, fixedPaths: readonly string[]): string[] => {
  const candidates: string[] = [];
  const configured = env.CMDUSE_PATH?.trim();
  if (configured) candidates.push(configured);
  candidates.push(...fixedPaths);

  for (const directory of (env.PATH ?? '').split(delimiter)) {
    if (directory) candidates.push(join(directory, 'cmduse'));
  }

  return [...new Set(candidates)];
};

/** Locate cmduse without relying on the GUI process's PATH being complete. */
export const discoverCmduse = async (options: DiscoveryOptions = {}): Promise<string> => {
  const env = options.env ?? process.env;
  const fixedPaths = options.fixedPaths ?? DEFAULT_CMDUSE_PATHS;
  const access = options.access ?? defaultAccess;

  for (const candidate of candidatesFor(env, fixedPaths)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate. Diagnostic details are intentionally discarded.
    }
  }

  throw new UsageError('not-found', 'cmduse not found');
};

type ExecFileResult = { stdout: string; stderr: string };
type ExecFile = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; encoding: 'utf8'; maxBuffer: number },
) => Promise<ExecFileResult>;

const defaultExecFile: ExecFile = async (file, args, options) => (
  promisify(nodeExecFile)(file, args, options) as unknown as Promise<ExecFileResult>
);

export type RunUsageOptions = {
  env?: NodeJS.ProcessEnv;
  discover?: () => Promise<string>;
  execFile?: ExecFile;
};

const isRecord = (value: unknown): value is UsagePayload => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

/** Execute cmduse and return only a successfully parsed JSON object. */
export const runUsage = async (options: RunUsageOptions = {}): Promise<UsagePayload> => {
  const env = options.env ?? process.env;
  let executable: string;
  try {
    executable = await (options.discover ?? (() => discoverCmduse({ env })))();
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError('not-found', 'cmduse not found');
  }

  let result: ExecFileResult;
  try {
    result = await (options.execFile ?? defaultExecFile)(executable, ['-1', '--json'], {
      env,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
    });
  } catch {
    // Do not include child stdout/stderr: either stream may contain credentials or tokens.
    throw new UsageError('execution', 'cmduse execution failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // Do not include the invalid stdout in the response or logs.
    throw new UsageError('parse', 'cmduse returned invalid JSON');
  }

  if (!isRecord(parsed)) {
    throw new UsageError('parse', 'cmduse returned invalid JSON');
  }
  return parsed;
};
