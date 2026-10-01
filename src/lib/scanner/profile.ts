import fs from 'fs';
import path from 'path';
import { scannerEvents } from './events';
import { killActiveCollectSession } from './spawn-driver';
import { sweepStaleSessionChrome } from '../whatsapp/sweep';

export const SHOPEE_PROFILE_DIR = path.resolve(process.cwd(), '.shopee_profile');
const PROFILE_DIR = SHOPEE_PROFILE_DIR;
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reseta o perfil persistente da Shopee. Quando a Shopee emite um
 * `anti_bot_tracking_id` (ex.: scene=crawler_item), o perfil fica marcado e
 * toda navegação subsequente cai no captcha sem nem renderizar o desafio.
 * Resetar (= renomear para um backup) apaga esse marcador e permite tentar
 * o login do zero com um perfil limpo.
 */
export async function resetShopeeProfile(): Promise<{
  ok: boolean;
  backupPath?: string;
  error?: string;
}> {
  try {
    // Garante que nenhuma sessão do driver Python esteja segurando lock nos
    // arquivos do perfil (a janela de login do Scrapling usa o .shopee_profile).
    killActiveCollectSession();
    // O `killActiveCollectSession` manda SIGTERM só pro `python.exe`: no Windows
    // isso NÃO derruba o Chrome que ele lançou, e o órfão fica segurando o
    // user-data-dir. Sem esta limpeza o rename do perfil falha e a sessão nova
    // sobe num perfil travado.
    const swept = await sweepStaleSessionChrome(PROFILE_DIR);
    if (swept > 0) {
      scannerEvents.emit('warn', `Shopee: encerrei ${swept} Chrome(s) preso(s) no perfil antes do reset.`);
    }
    // O subprocesso morre de forma assíncrona; dá um tempo antes de mover.
    await sleep(2000);

    if (!fs.existsSync(PROFILE_DIR)) {
      return { ok: true };
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `shopee_profile_${ts}`);

    // No Windows o Chrome pode segurar o diretório por alguns segundos —
    // tenta o rename algumas vezes antes de desistir.
    let moved = false;
    for (let attempt = 0; attempt < 5 && !moved; attempt++) {
      try {
        fs.renameSync(PROFILE_DIR, backupPath);
        moved = true;
      } catch {
        if (attempt < 4) {
          await sleep(1500);
        }
      }
    }

    if (!moved) {
      return { ok: false, error: 'Não foi possível mover o perfil (arquivos em uso por um navegador). Feche todos os Chromes e tente de novo.' };
    }

    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    return { ok: true, backupPath };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Falha ao resetar o perfil da Shopee.' };
  }
}