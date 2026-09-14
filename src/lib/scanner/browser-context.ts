import { BrowserContext } from 'playwright';

const globalForBrowser = globalThis as unknown as {
  activeBrowserContext: BrowserContext | null;
};

if (!globalForBrowser.activeBrowserContext) {
  globalForBrowser.activeBrowserContext = null;
}

export function setActiveContext(context: BrowserContext | null): void {
  globalForBrowser.activeBrowserContext = context;
}

export function getActiveContext(): BrowserContext | null {
  return globalForBrowser.activeBrowserContext;
}

export async function closeActiveContext(): Promise<void> {
  const context = globalForBrowser.activeBrowserContext;
  if (!context) return;
  globalForBrowser.activeBrowserContext = null;
  try {
    await context.close();
  } catch {
    // já fechado por outro caminho
  }
}