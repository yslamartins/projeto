import { BrowserContext } from 'playwright';

/**
 * Script anti-detecção injetado antes de qualquer script da página.
 *
 * Mascara os vetores mais comuns usados por anti-bots (Shopee inclui):
 * - navigator.webdriver exposto pela automação
 * - window.chrome ausente (headless antigo) ou incompleto
 * - propriedades cdc_* deixadas pelo ChromeDriver/CDP
 * - navigator.plugins / mimeTypes vazios ou com artefatos
 * - navigator.languages vazio
 * - Permissions API respondendo como automação
 * - fingerprint WebGL expondo o renderizador automático
 *
 * Tudo roda no contexto main da página via addInitScript, ou seja, antes
 * de qualquer script de terceiros (incluindo o anti-bot).
 */
export const STEALTH_INIT_SCRIPT = `(() => {
  const safeDefine = (target, key, value) => {
    try {
      Object.defineProperty(target, key, { value, configurable: true, writable: true });
    } catch (e) {}
  };

  // 1. navigator.webdriver
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
  } catch (e) {}

  // 2. window.chrome completo (Chrome real tem runtime, loadTimes, csi, app)
  if (!window.chrome) {
    window.chrome = {};
  }
  const chromeObj = window.chrome;
  if (!chromeObj.runtime || Object.keys(chromeObj.runtime).length === 0) {
    chromeObj.runtime = {
      OnInstalledReason: {},
      OnRestartRequiredReason: {},
      PlatformArch: {},
      PlatformNaclArch: {},
      PlatformOs: {},
      RequestUpdateCheckStatus: {},
      connect: () => {},
      connectNative: () => {},
      getBackgroundPage: () => {},
      getManifest: () => ({}),
      getPackageDirectoryEntry: () => {},
      getURL: () => '',
      id: undefined,
      onConnect: {},
      onConnectExternal: {},
      onInstalled: {},
      onMessage: {},
      onMessageExternal: {},
      onRestartRequired: {},
      onStartup: {},
      onSuspend: {},
      onSuspendCanceled: {},
      onUpdateAvailable: {},
      openOptionsPage: () => {},
      reload: () => {},
      requestUpdateCheck: () => {},
      restart: () => {},
      sendMessage: () => {},
      sendNativeMessage: () => {},
      setUninstallURL: () => {},
    };
  }
  if (typeof chromeObj.csi !== 'function') chromeObj.csi = () => {};
  if (typeof chromeObj.loadTimes !== 'function') chromeObj.loadTimes = () => {};
  if (!chromeObj.app) {
    chromeObj.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: () => {},
      getIsInstalled: () => false,
    };
  }

  // 3. Remove qualquer propriedade cdc_* (assinatura de ChromeDriver/CDP)
  try {
    Object.getOwnPropertyNames(window).forEach((prop) => {
      if (prop.indexOf('cdc_') === 0) delete window[prop];
    });
  } catch (e) {}

  // 4. navigator.plugins e navigator.mimeTypes realistas (5 PDF plugins comuns)
  const makePluginArray = () => {
    const data = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', desc: 'Portable Document Format', mime: 'application/pdf', suffix: 'pdf' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', desc: '', mime: 'application/pdf', suffix: 'pdf' },
      { name: 'Chromium PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', desc: '', mime: 'application/pdf', suffix: 'pdf' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', desc: '', mime: 'application/x-nacl', suffix: '' },
      { name: 'Portable Document Format', filename: 'internal-pdf-viewer', desc: '', mime: 'application/pdf', suffix: 'pdf' },
    ];
    const plugins = data.map((p) => {
      const mime = { type: p.mime, suffixes: p.suffix, description: p.desc, enabledPlugin: null };
      const plugin = { name: p.name, filename: p.filename, description: p.desc, length: 1, 0: mime };
      mime.enabledPlugin = plugin;
      plugin.item = (n) => (typeof n === 'number' && n >= 0 && n < plugin.length ? plugin[n] : null);
      plugin.namedItem = (n) => (n === p.name ? plugin : null);
      return plugin;
    });
    plugins.item = (n) => (typeof n === 'number' && n >= 0 && n < plugins.length ? plugins[n] : null);
    plugins.namedItem = (n) => plugins.find((p) => p.name === n) || null;
    return plugins;
  };
  try {
    const plugins = makePluginArray();
    Object.defineProperty(navigator, 'plugins', { get: () => plugins, configurable: true });
    const mimes = plugins.flatMap((p) => [p[0]]);
    mimes.item = (n) => (typeof n === 'number' && n >= 0 && n < mimes.length ? mimes[n] : null);
    mimes.namedItem = (n) => mimes.find((m) => m.type === n) || null;
    Object.defineProperty(navigator, 'mimeTypes', { get: () => mimes, configurable: true });
  } catch (e) {}

  // 5. navigator.languages
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'], configurable: true });
  } catch (e) {}

  // 6. Permissions API: Notification deve responder como navegador real
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const origQuery = navigator.permissions.query.bind(navigator.permissions);
      Object.defineProperty(navigator.permissions, 'query', {
        value: (params) =>
          params && params.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission === 'denied' ? 'denied' : 'prompt' })
            : origQuery(params),
        configurable: true,
      });
    }
  } catch (e) {}

  // 7. WebGL fingerprint: vendor/renderer de GPU realista
  try {
    const patchGl = (Ctor) => {
      if (!Ctor || !Ctor.prototype || typeof Ctor.prototype.getParameter !== 'function') return;
      const orig = Ctor.prototype.getParameter;
      Ctor.prototype.getParameter = function (param) {
        if (param === 37445) return 'Google Inc. (NVIDIA)';
        if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return orig.call(this, param);
      };
    };
    patchGl(window.WebGLRenderingContext);
    patchGl(window.WebGL2RenderingContext);
  } catch (e) {}
})();`;

/**
 * Instala o script anti-detecção no contexto antes de qualquer navegação.
 * Deve ser chamado logo após a criação do contexto/navegador.
 */
export async function installAntiDetect(context: BrowserContext): Promise<void> {
  await context.addInitScript(STEALTH_INIT_SCRIPT);
}

// Re-exporta a versão antiga compacta para compatibilidade com código existente.
export { installAntiDetect as installBasicAntiDetect };