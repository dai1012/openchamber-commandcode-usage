import { describe, expect, test } from 'bun:test';
import { discoverCmduse, runUsage, UsageError } from '../service/usage.ts';

describe('cmduse discovery', () => {
  test('prefers CMDUSE_PATH over Homebrew and PATH candidates', async () => {
    const tried: string[] = [];
    const executable = await discoverCmduse({
      env: {
        CMDUSE_PATH: '/custom/cmduse',
        PATH: '/path/one:/path/two',
      },
      fixedPaths: ['/opt/homebrew/bin/cmduse', '/usr/local/bin/cmduse'],
      access: async (candidate) => {
        tried.push(candidate);
        if (candidate !== '/custom/cmduse') throw new Error('not executable');
      },
    });

    expect(executable).toBe('/custom/cmduse');
    expect(tried).toEqual(['/custom/cmduse']);
  });

  test('falls back through fixed paths and then PATH', async () => {
    const tried: string[] = [];
    const executable = await discoverCmduse({
      env: { PATH: '/path/one:/path/two' },
      fixedPaths: ['/opt/homebrew/bin/cmduse', '/usr/local/bin/cmduse'],
      access: async (candidate) => {
        tried.push(candidate);
        if (candidate !== '/path/two/cmduse') throw new Error('not executable');
      },
    });

    expect(executable).toBe('/path/two/cmduse');
    expect(tried).toEqual([
      '/opt/homebrew/bin/cmduse',
      '/usr/local/bin/cmduse',
      '/path/one/cmduse',
      '/path/two/cmduse',
    ]);
  });

  test('reports a safe not-found error without exposing command output', async () => {
    await expect(discoverCmduse({
      env: { PATH: '/empty' },
      fixedPaths: [],
      access: async () => { throw new Error('hidden diagnostic'); },
    })).rejects.toMatchObject({ kind: 'not-found', message: 'cmduse not found' });
  });
});

describe('cmduse execution', () => {
  test('parses successful JSON and preserves the usage payload', async () => {
    const usage = {
      error: null,
      monthlyCap: 100,
      monthlyCredits: 72.5,
      fiveHour: { used: 0.25, cap: 10, resetAt: 1_900_000_000_000 },
      weekly: null,
    };
    const result = await runUsage({
      env: { PATH: '/empty' },
      discover: async () => '/custom/cmduse',
      execFile: async (file, args) => {
        expect(file).toBe('/custom/cmduse');
        expect(args).toEqual(['-1', '--json']);
        return { stdout: JSON.stringify(usage), stderr: 'ignored diagnostic' };
      },
    });

    expect(result).toEqual(usage);
  });

  test('rejects non-zero execution without exposing stdout or stderr', async () => {
    await expect(runUsage({
      discover: async () => '/custom/cmduse',
      execFile: async () => {
        throw Object.assign(new Error('hidden stderr'), {
          stdout: 'redacted stdout',
          stderr: 'redacted stderr',
          code: 1,
        });
      },
    })).rejects.toMatchObject({ kind: 'execution', message: 'cmduse execution failed' });
  });

  test('rejects invalid JSON with a safe parse error', async () => {
    await expect(runUsage({
      discover: async () => '/custom/cmduse',
      execFile: async () => ({ stdout: 'not-json', stderr: '' }),
    })).rejects.toMatchObject({ kind: 'parse', message: 'cmduse returned invalid JSON' });
  });

  test('exposes a typed UsageError for callers that need safe mapping', async () => {
    try {
      await runUsage({
        discover: async () => '/custom/cmduse',
        execFile: async () => { throw new Error('failure'); },
      });
      throw new Error('expected runUsage to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect((error as UsageError).kind).toBe('execution');
    }
  });
});
