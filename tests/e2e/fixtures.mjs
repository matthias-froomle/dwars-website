import { expect, test as base } from '@playwright/test';

const maxFailureLength = 2_000;

function truncate(value) {
  const text = String(value || 'Unknown browser error');
  return text.length <= maxFailureLength ? text : `${text.slice(0, maxFailureLength)}...`;
}

export const test = base.extend({
  runtimeMonitor: [async ({ context }, use, testInfo) => {
    const runtimeFailures = [];
    const missingResources = [];

    const monitor = (page) => {
      page.on('pageerror', (error) => {
        runtimeFailures.push(`uncaught page error at ${page.url()}\n${truncate(error.stack || error.message || error)}`);
      });
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (message.text().startsWith('Failed to load resource:')) {
          missingResources.push(`${page.url()}\n${message.text()}`);
          return;
        }
        const location = message.location();
        const source = location.url || page.url() || 'unknown source';
        const line = Number.isInteger(location.lineNumber) ? `:${location.lineNumber + 1}:${(location.columnNumber || 0) + 1}` : '';
        runtimeFailures.push(`console.error at ${source}${line}\n${truncate(message.text())}`);
      });
    };
    context.on('page', monitor);
    for (const page of context.pages()) monitor(page);

    await use();

    if (missingResources.length > 0) {
      await testInfo.attach('missing-resources', {
        body: Buffer.from(`${missingResources.join('\n\n')}\n`),
        contentType: 'text/plain',
      });
    }
    if (runtimeFailures.length > 0) {
      const details = runtimeFailures.join('\n\n');
      await testInfo.attach('runtime-errors', {
        body: Buffer.from(`${details}\n`),
        contentType: 'text/plain',
      });
      throw new Error(`Unexpected browser runtime errors:\n\n${details}`);
    }
  }, { auto: true }],
});

export { expect };
