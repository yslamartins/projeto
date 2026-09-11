import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { scannerEvents } from './events';

const PROFILE_DIR = path.resolve(process.cwd(), '.shopee_profile');

export async function openShopeeSession(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }

    scannerEvents.emit('step', 'Iniciando navegador Chromium com perfil persistente...');

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    scannerEvents.emit('info', 'Navegando para a página de login da Shopee Brasil...');
    await page.goto('https://shopee.com.br/buyer/login', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    scannerEvents.emit(
      'success',
      'Navegador aberto! Faça o login ou resolva qualquer desafio de segurança. A janela pode ser fechada quando terminar.'
    );

    // Keep context alive until the user closes the browser
    page.on('close', async () => {
      try {
        await context.close();
        scannerEvents.emit('info', 'Sessão do navegador encerrada e cookies salvos localmente.');
      } catch {}
    });

    return { success: true, message: 'Navegador aberto com sucesso.' };
  } catch (error: any) {
    console.error('Error opening Shopee session:', error);
    scannerEvents.emit('error', `Falha ao abrir navegador: ${error.message}`);
    return { success: false, error: error.message };
  }
}
