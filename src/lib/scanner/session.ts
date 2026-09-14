import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { scannerEvents } from './events';
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

    scannerEvents.emit('step', 'Iniciando navegador Chromium visível com perfil persistente...');

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
    });
    setActiveContext(context);

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    scannerEvents.emit('info', 'Navegando para a página da Shopee Brasil...');
    await page.goto('https://shopee.com.br', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    scannerEvents.emit(
      'success',
      'Navegador aberto! Faça o login ou resolva qualquer desafio de segurança. A janela pode ser fechada quando terminar.'
    );

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