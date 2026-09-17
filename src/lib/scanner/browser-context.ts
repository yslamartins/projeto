import { BrowserContext } from 'playwright';

const globalForBrowser = globalThis as unknown as {
  activeBrowserContext: BrowserContext | null;
  activeBrowserDispose: (() => Promise<void>) | null;
};

if (!globalForBrowser.activeBrowserContext) {
  globalForBrowser.activeBrowserContext = null;
}

if (!globalForBrowser.activeBrowserDispose) {
  globalForBrowser.activeBrowserDispose = null;
}

export function setActiveContext(
  context: BrowserContext | null,
  dispose?: (() => Promise<void>) | null
): void {
  globalForBrowser.activeBrowserContext = context;
  globalForBrowser.activeBrowserDispose = dispose ?? null;
}

export function getActiveContext(): BrowserContext | null {
  return globalForBrowser.activeBrowserContext;
}

export async function closeActiveContext(): Promise<void> {
  const context = globalForBrowser.activeBrowserContext;
  const dispose = globalForBrowser.activeBrowserDispose;
  globalForBrowser.activeBrowserContext = null;
  globalForBrowser.activeBrowserDispose = null;
  if (dispose) {
    try {
      await dispose();
      return;
    } catch {
      // segue para o close do contexto
    }
  }
  if (!context) return;
  try {
    await context.close();
  } catch {
    // já fechado por outro caminho
  }
}

// Anti-detecção completa (navigator.webdriver, window.chrome, plugins,
// WebGL, etc.) — implementação em stealth.ts, re-exportada para compatibilidade.
export { installAntiDetect } from './stealth';