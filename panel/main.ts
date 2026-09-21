import { connectHost, HostRequestError } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBadge,
  mountBanner,
  mountButton,
  mountProgress,
  mountSpinner,
} from '@openchamber/sdk/ui';

type WindowUsage = {
  cap: number;
  used: number;
  resetAt: number;
};

type UsageSummary = {
  cost: number;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  successRate: number;
};

type Usage = {
  plan: string;
  status: string;
  monthlyCap: number;
  monthlyCredits: number;
  periodEnd: string;
  fiveHour: WindowUsage | null;
  weekly: WindowUsage | null;
  summary: UsageSummary;
};

type MountHandle = { dispose: () => void };

class UsageDataError extends Error {
  readonly kind: 'authentication' | 'invalid';

  constructor(kind: UsageDataError['kind'], message: string) {
    super(message);
    this.name = 'UsageDataError';
    this.kind = kind;
  }
}

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing root');

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const finite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const record = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const readWindow = (value: unknown, name: string): WindowUsage | null => {
  if (value === null || value === undefined) return null;
  const data = record(value);
  if (!data || !finite(data.cap) || !finite(data.used) || !finite(data.resetAt)) {
    throw new UsageDataError('invalid', `Command Code returned an invalid ${name} window.`);
  }
  return { cap: data.cap, used: data.used, resetAt: data.resetAt };
};

const parseUsage = (body: string): Usage => {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new UsageDataError('invalid', 'cmduse returned invalid JSON');
  }

  const data = record(value);
  if (!data) throw new UsageDataError('invalid', 'cmduse returned an unexpected response');
  if (data.error !== null && data.error !== undefined && data.error !== '') {
    // Do not display the command-provided error string: it is not needed to
    // diagnose the common unauthenticated case and may contain sensitive data.
    throw new UsageDataError('authentication', 'Command Code authentication unavailable; run cmd login');
  }

  const summary = record(data.summary);
  if (
    typeof data.plan !== 'string' ||
    typeof data.status !== 'string' ||
    !finite(data.monthlyCap) ||
    !finite(data.monthlyCredits) ||
    typeof data.periodEnd !== 'string' ||
    !summary ||
    !finite(summary.cost) ||
    !finite(summary.requests) ||
    !finite(summary.tokensIn) ||
    !finite(summary.tokensOut) ||
    !finite(summary.successRate)
  ) {
    throw new UsageDataError('invalid', 'cmduse returned an unexpected response');
  }

  return {
    plan: data.plan,
    status: data.status,
    monthlyCap: data.monthlyCap,
    monthlyCredits: data.monthlyCredits,
    periodEnd: data.periodEnd,
    fiveHour: readWindow(data.fiveHour, '5-hour'),
    weekly: readWindow(data.weekly, 'weekly'),
    summary: {
      cost: summary.cost,
      requests: summary.requests,
      tokensIn: summary.tokensIn,
      tokensOut: summary.tokensOut,
      successRate: summary.successRate,
    },
  };
};

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const formatInteger = (value: number): string => Math.round(value).toLocaleString();

const formatCompact = (value: number): string => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatInteger(value);
};

const percentage = (used: number, cap: number): number => (
  cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0
);

const formatReset = (resetAt: number): { text: string; title: string } => {
  const difference = resetAt - Date.now();
  const absolute = new Date(resetAt).toLocaleString();
  if (!Number.isFinite(difference) || difference <= 0) return { text: 'Reset due', title: absolute };

  const minutes = Math.ceil(difference / 60_000);
  if (minutes < 60) return { text: `Resets in ${minutes}m`, title: absolute };
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return {
      text: remainingMinutes ? `Resets in ${hours}h ${remainingMinutes}m` : `Resets in ${hours}h`,
      title: absolute,
    };
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return {
    text: remainingHours ? `Resets in ${days}d ${remainingHours}h` : `Resets in ${days}d`,
    title: absolute,
  };
};

const statusTone = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  if (status === 'active') return 'success';
  if (status === 'error' || status === 'suspended') return 'error';
  return 'warning';
};

const serviceError = (status: number, body: string): string => {
  let reported: string | null = null;
  try {
    const data = record(JSON.parse(body));
    if (typeof data?.error === 'string') reported = data.error;
  } catch {
    // Use only the HTTP status below. Never echo an arbitrary service body.
  }

  if (reported === 'cmduse not found') {
    return 'cmduse not found. Install Command Code or set CMDUSE_PATH for OpenChamber.';
  }
  if (reported === 'cmduse returned invalid JSON') {
    return 'cmduse returned invalid JSON. Update Command Code and try Refresh.';
  }
  if (reported === 'cmduse execution failed') {
    return 'cmduse execution failed. Check the Command Code installation and try Refresh.';
  }
  if (status === 401) return 'Local service authorization failed. Re-open the extension and try Refresh.';
  if (status === 503) return 'cmduse not found. Install Command Code or set CMDUSE_PATH for OpenChamber.';
  return `Local service returned HTTP ${status}. Try Refresh.`;
};

const hostError = (error: unknown): string => {
  if (!(error instanceof HostRequestError)) return 'Unable to load Command Code usage. Try Refresh.';
  switch (error.code) {
    case 'NO_SERVICE':
      return 'Local service is not approved. Allow this extension service in Settings → Extensions.';
    case 'SERVICE_FAILED':
      return 'Local service failed to start. Re-enable the extension service in Settings → Extensions.';
    case 'REQUEST_FAILED':
      return 'Local service request failed. Try Refresh.';
    case 'HOST_TIMEOUT':
      return 'OpenChamber did not answer in time. Try Refresh.';
    case 'DISABLED':
      return 'This extension is paused. Enable it in Settings → Extensions.';
    default:
      return 'Unable to load Command Code usage. Try Refresh.';
  }
};

const loadUsage = async (): Promise<Usage> => {
  let response: { status: number; body: string };
  try {
    response = await host.serviceRequest({ method: 'GET', path: '/usage' });
  } catch (error) {
    throw new UsageDataError('invalid', hostError(error));
  }
  if (response.status !== 200) throw new UsageDataError('invalid', serviceError(response.status, response.body));
  return parseUsage(response.body);
};

const addMetric = (parent: HTMLElement, label: string, value: string): void => {
  const metric = element('div', 'summary-metric');
  metric.append(element('strong', undefined, value), element('span', undefined, label));
  parent.append(metric);
};

const addMeter = (
  parent: HTMLElement,
  title: string,
  used: number,
  cap: number,
  resetAt?: number,
): MountHandle => {
  const section = element('section', 'usage-section');
  const header = element('div', 'usage-heading');
  const percent = percentage(used, cap);
  header.append(element('h2', undefined, title), element('span', 'usage-percent', formatPercent(percent)));
  const progressSlot = element('div', 'usage-progress');
  const progress = mountProgress(progressSlot, { value: percent });
  const amount = element('div', 'usage-amount', `${formatMoney(used)} / ${formatMoney(cap)}`);
  section.append(header, progressSlot, amount);
  if (resetAt !== undefined) {
    const reset = formatReset(resetAt);
    const resetNode = element('div', 'usage-reset', reset.text);
    resetNode.title = reset.title;
    section.append(resetNode);
  }
  parent.append(section);
  return progress;
};

const addUnavailableMeter = (parent: HTMLElement, title: string): void => {
  const section = element('section', 'usage-section usage-unavailable');
  section.append(
    element('div', 'usage-heading', title),
    element('div', 'usage-unavailable-copy', 'Unavailable from cmduse'),
  );
  parent.append(section);
};

const createApp = (mount: HTMLElement): { refresh: () => Promise<void> } => {
  mount.replaceChildren();
  const shell = element('div', 'usage-app');
  const header = element('header', 'usage-header');
  const titleBlock = element('div', 'usage-title-block');
  titleBlock.append(element('h1', undefined, 'Command Code'), element('div', 'usage-subtitle', 'Plan and billing usage'));
  const badgeSlot = element('div', 'usage-badge');
  const badge = mountBadge(badgeSlot, { label: 'Loading…', tone: 'neutral' });
  header.append(titleBlock, badgeSlot);

  const messageSlot = element('div', 'usage-message');
  const content = element('div', 'usage-content');
  const footer = element('footer', 'usage-footer');
  const updated = element('span', undefined, 'Not loaded');
  const actions = element('div', 'usage-actions');
  const refreshButton = mountButton(actions, {
    label: 'Refresh',
    size: 'sm',
    variant: 'secondary',
    onClick: () => { void refresh(); },
  });
  footer.append(updated, actions);
  shell.append(header, messageSlot, content, footer);
  mount.append(shell);

  let current: Usage | null = null;
  let message: MountHandle | null = null;
  let contentHandles: MountHandle[] = [];
  let inFlight = false;

  const clearMessage = (): void => {
    message?.dispose();
    message = null;
    messageSlot.replaceChildren();
  };

  const showMessage = (title: string, body: string): void => {
    clearMessage();
    message = mountBanner(messageSlot, { tone: 'error', title, body });
  };

  const clearContent = (): void => {
    for (const handle of contentHandles) handle.dispose();
    contentHandles = [];
    content.replaceChildren();
  };

  const showLoading = (): void => {
    clearContent();
    contentHandles.push(mountSpinner(content, { label: 'Loading usage' }));
  };

  const render = (usage: Usage): void => {
    clearContent();
    const monthlyUsed = Math.max(0, usage.monthlyCap - usage.monthlyCredits);
    contentHandles.push(addMeter(content, 'Monthly', monthlyUsed, usage.monthlyCap));
    const monthlyRemaining = element('div', 'usage-remaining', `${formatMoney(Math.max(0, usage.monthlyCredits))} remaining`);
    content.lastElementChild?.append(monthlyRemaining);
    const period = element('div', 'usage-period', `Period ends ${usage.periodEnd}`);
    content.lastElementChild?.append(period);

    if (usage.fiveHour) addMeter(content, '5-hour', usage.fiveHour.used, usage.fiveHour.cap, usage.fiveHour.resetAt);
    else addUnavailableMeter(content, '5-hour');
    if (usage.weekly) addMeter(content, 'Weekly', usage.weekly.used, usage.weekly.cap, usage.weekly.resetAt);
    else addUnavailableMeter(content, 'Weekly');

    const summary = element('section', 'summary-section');
    summary.append(element('h2', undefined, 'This billing period'));
    const metrics = element('div', 'summary-grid');
    addMetric(metrics, 'requests', formatInteger(usage.summary.requests));
    addMetric(metrics, 'cost', `${formatMoney(usage.summary.cost)} cost`);
    addMetric(metrics, 'tokens in / out', `${formatCompact(usage.summary.tokensIn)} / ${formatCompact(usage.summary.tokensOut)}`);
    addMetric(metrics, 'success', `${formatPercent(usage.summary.successRate)} success`);
    summary.append(metrics);
    content.append(summary);
  };

  const refresh = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    refreshButton.update({ loading: true });
    clearMessage();
    if (!current) showLoading();
    try {
      const usage = await loadUsage();
      current = usage;
      badge.update({ label: `${usage.plan} · ${usage.status}`, tone: statusTone(usage.status) });
      render(usage);
      updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      const body = error instanceof UsageDataError ? error.message : 'Unable to load Command Code usage. Try Refresh.';
      showMessage('Usage unavailable', body);
      if (!current) clearContent();
    } finally {
      refreshButton.update({ loading: false });
      inFlight = false;
    }
  };

  return { refresh };
};

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (started) return;
  started = true;
  const app = createApp(root);
  void app.refresh();
  window.setInterval(() => { void app.refresh(); }, 5 * 60 * 1000);
});
