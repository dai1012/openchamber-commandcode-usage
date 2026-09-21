import http from 'node:http';
import { runUsage, UsageError } from './usage.ts';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';

if (!Number.isInteger(port) || port < 1 || port > 65_535 || !token) {
  process.stderr.write('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required\n');
  process.exit(1);
}

const json = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
};

const safeUsageFailure = (error: unknown): { status: number; body: { error: string } } => {
  if (error instanceof UsageError) {
    return {
      status: error.kind === 'not-found' ? 503 : 502,
      body: { error: error.message },
    };
  }
  return { status: 502, body: { error: 'cmduse execution failed' } };
};

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/usage') {
    void runUsage().then(
      (payload) => json(res, 200, payload),
      (error) => {
        const failure = safeUsageFailure(error);
        json(res, failure.status, failure.body);
      },
    );
    return;
  }

  json(res, 404, { error: 'not-found' });
});

// Keep startup failures diagnosable through the host's SERVICE_FAILED state,
// without writing OS paths or child-process diagnostics to the service output.
server.on('error', () => process.exit(1));
server.listen(port, '127.0.0.1');
