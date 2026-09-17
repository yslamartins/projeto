import path from 'path';
import fs from 'fs';
import { scannerEvents } from './events';
import { launchManagedChrome } from './chrome-launcher';
import { installAntiDetect } from './stealth';
import { closeActiveContext, getActiveContext, setActiveContext } from './browser-context';

const PROFILE_DIR = path.resolve(process.cwd(), '.shopee_profile');

export async function openShopeeSession(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }

    // Fecha uma sessão anterior para liberar o perfil persistente antes de abrir outra
    if (getActiveContext()) {
      scannerEvents.emit('info', 'Fechando navegador de sessão anterior...');
      await closeActiveContext();
    }

    scannerEvents.emit('step', 'Iniciando Chrome com perfil persistente...');

    const { context, dispose } = await launchManagedChrome({
      userDataDir: PROFILE_DIR,
      headless: false,
    });
    setActiveContext(context, dispose);

    // Aplica anti-detecção ANTES de qualquer navegação: mascara
    // navigator.webdriver e outros vetores antes do anti-bot rodar.
    await installAntiDetect(context);

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // NÃO navegamos nem clicamos: o login é 100% manual. O bot só abre o
    // navegador com o perfil persistente e observa a URL para dar aviso.
    scannerEvents.emit(
      'info',
      'Navegador aberto. Navegue até https://shopee.com.br e faça o login/verificação manualmente nesta janela. O bot não toca em nada — apenas aguarda e salva a sessão quando terminar.'
    );

    // Observa a URL sem interferir: avisa quando o usuário chega na Shopee,
    // quando um desafio anti-bot aparece, e quando ele é resolvido.
    const startedAt = Date.now();
    let state: 'idle' | 'onShopee' | 'verify' = 'idle';
    const watcher = setInterval(() => {
      if (page.isClosed()) {
        clearInterval(watcher);
        return;
      }
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        clearInterval(watcher);
        return;
      }

      const url = page.url() || '';

      if (/\/verify/i.test(url)) {
        if (state === 'verify') return;
        state = 'verify';
        scannerEvents.emit(
          'warn',
          'A Shopee exibiu um desafio de segurança (anti-bot). Resolva o slider/captcha manualmente nesta janela. Quando resolver, a sessão será salva para as próximas varreduras.'
        );
        return;
      }

      const isShopee = /shopee\.com\.br/.test(url);
      if (isShopee) {
        if (state === 'onShopee') return;
        const wasVerify = state === 'verify';
        state = 'onShopee';
        if (wasVerify) {
          scannerEvents.emit(
            'success',
            'Desafio de segurança resolvido! Sessão salva para as próximas varreduras.'
          );
        } else {
          scannerEvents.emit(
            'success',
            'Você está na Shopee. Faça o login manualmente; o bot não irá clicar em nada. Feche a janela quando terminar.'
          );
        }
        return;
      }

      state = 'idle';
    }, 3000);
    page.on('close', () => clearInterval(watcher));

    // Keep context alive until the user closes the browser
    page.on('close', async () => {
      await closeActiveContext();
      scannerEvents.emit('info', 'Sessão do navegador encerrada e cookies salvos localmente.');
    });

    return { success: true, message: 'Navegador aberto com sucesso.' };
  } catch (error: any) {
    console.error('Error opening Shopee session:', error);
    scannerEvents.emit('error', `Falha ao abrir navegador: ${error.message}`);
    return { success: false, error: error.message };
  }
}