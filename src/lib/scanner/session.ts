import { scannerEvents } from './events';
import { killActiveCollectSession, runCollect, runCollectSession } from './spawn-driver';
import { sweepProcesses } from '../process/sweep';
import { sweepStaleSessionChrome } from '../whatsapp/sweep';
import { SHOPEE_PROFILE_DIR } from './profile';

/**
 * Tempo máximo para o driver confirmar que o Chrome realmente subiu uma janela.
 * Só vale para a *abertura*: depois que o navegador aparece, a sessão fica viva
 * enquanto a pessoa faz o login, e o driver encerra quando ela fecha a janela.
 */
const SESSION_OPEN_TIMEOUT_MS = 45_000;
const SESSION_STATUS_TIMEOUT_MS = 30_000;

/**
 * Marcadores de máquina emittedos por `collect.py`. O handshake casa neles em vez
 * de fazer regex na prosa PT-BR — a versão anterior casava `/aberto\(a\)!/i`, que
 * quebrava com cada ajuste de wording e, pior, não tinha teste que usasse a string
 * real (o mock dizia só "Shopee aberto!").
 */
const MARKER_OPENED = '[session] browser-aberto';
const MARKER_OPEN_FAILED = '[session] falha-abrir';

/**
 * Antes de abrir: derruba o que estiver preso no `.shopee_profile`.
 *
 * São duas coisas, e as duas importam:
 *
 *  1. Chrome apontando pro perfil. Um browser principal morto deixa renderers
 *     vivos segurando o user-data-dir (o diagnóstico achou o PID 17016: renderer
 *     das 09:43 de um browser já encerrado) e o launch seguinte herda um perfil
 *     travado.
 *  2. Drivers `collect.py` de sessões anteriores. Eles sobrevivem a um restart do
 *     `next dev` (quem reinicia perde o handle) e ficam segurando a sessão — no
 *     diagnóstico havia um par de python de 09:22 ainda vivos.
 */
async function sweepStaleShopeeProfile(reason: string): Promise<void> {
  try {
    const drivers = await sweepProcesses({
      processName: 'python.exe',
      // 'shopee' + 'session' como filtros separados: 'shopee terms' (uma varredura
      // em andamento) não casa, e 'session-status' também não.
      mustContain: ['collect.py', 'shopee', 'session'],
    });
    if (drivers > 0) {
      scannerEvents.emit(
        'warn',
        `Shopee: encerrei ${drivers} driver(s) de sessão antigo(s) pendurados ${reason}.`
      );
    }
  } catch {
    // Sem PowerShell (ou outra falha): segue e deixa o driver relatar o erro real.
  }

  try {
    const chromes = await sweepStaleSessionChrome(SHOPEE_PROFILE_DIR);
    if (chromes > 0) {
      scannerEvents.emit(
        'warn',
        `Shopee: encerrei ${chromes} Chrome(s) preso(s) no perfil ${reason}.`
      );
    }
  } catch {
    // idem
  }
}

/** Tira o prefixo `[session] ` da mensagem que o driver mandou. */
function stripMarker(message: string): string {
  return message.replace(/^\[session\]\s*/, '').replace(/^[a-z-]+:\s*/, '');
}

/**
 * Abre o login HITL da Shopee e só resolve depois que o Chrome confirma a janela.
 * Sem essa espera, `runCollectSession` devolvia sucesso na hora e a UI anunciava
 * "Navegador aberto!" mesmo quando o Chrome morria na largada.
 *
 * O login em si roda em Chrome puro, dentro do driver (ver `action_shopee_login`):
 * o launch automatizado do Scrapling travava o modal de telefone em loading
 * infinito. Aqui a parte Node só coordena — abre, espera a confirmação e encerra
 * o que sobrou se o navegador nunca aparecer.
 */
export async function openShopeeSession(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  scannerEvents.emit(
    'step',
    'Abrindo o Chrome no perfil persistente (.shopee_profile) para você fazer login...'
  );

  await sweepStaleShopeeProfile('antes de abrir a sessão');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { success: boolean; message?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      // O timeout precisa derrubar o driver E o Chrome que ele subiu: senão o
      // `python.exe` fica vivo segurando o `.shopee_profile` e o próximo login
      // herda um perfil travado.
      killActiveCollectSession();
      void sweepStaleShopeeProfile('depois do tempo limite de abertura');
      finish({
        success: false,
        error:
          'O Chrome não confirmou a abertura da janela a tempo. Feche qualquer janela ' +
          'do Login Shopee ainda aberta e tente de novo.',
      });
    }, SESSION_OPEN_TIMEOUT_MS);

    try {
      runCollectSession({
        args: ['shopee', 'session'],
        onLog: (log) => {
          if (log.message.includes(MARKER_OPENED)) {
            finish({ success: true, message: 'Chrome aberto. Faça o login na janela.' });
          }
          if (log.message.includes(MARKER_OPEN_FAILED)) {
            finish({ success: false, error: stripMarker(log.message) });
          }
        },
      });
    } catch (error: any) {
      console.error('Error opening Shopee session:', error);
      scannerEvents.emit('error', `Falha ao abrir navegador: ${error.message}`);
      finish({ success: false, error: error.message });
    }
  });
}

export type ShopeeSessionStatus = {
  /** null = não deu para saber agora (Chrome aberto trava o arquivo de cookies). */
  authenticated: boolean | null;
};

/**
 * Estado de autenticação do perfil, lido do cookie `SPC_ST`.
 *
 * Só responde com verdade quando dá: com o Chrome aberto o `Default/Network/Cookies`
 * está com lock exclusivo e o estado é `null` (desconhecido), não `false`. Era
 * justamente inferir "deslogado" nesse estado que fazia a UI mentir.
 */
export async function getShopeeSessionStatus(): Promise<ShopeeSessionStatus> {
  const result = await runCollect<{ authenticated: boolean | null }>({
    args: ['shopee', 'session-status'],
    timeoutMs: SESSION_STATUS_TIMEOUT_MS,
    emitLogs: false,
  });

  if (!result.ok) {
    return { authenticated: null };
  }
  const authenticated = result.data?.authenticated ?? null;
  return { authenticated: typeof authenticated === 'boolean' ? authenticated : null };
}