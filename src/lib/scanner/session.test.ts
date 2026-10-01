import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { runCollectSession, runCollect, killActiveCollectSession } = vi.hoisted(() => ({
  runCollectSession: vi.fn(),
  runCollect: vi.fn(),
  killActiveCollectSession: vi.fn(),
}));
const { sweepStaleSessionChrome } = vi.hoisted(() => ({ sweepStaleSessionChrome: vi.fn() }));
const { sweepProcesses } = vi.hoisted(() => ({ sweepProcesses: vi.fn() }));

vi.mock('./spawn-driver', () => ({ runCollectSession, runCollect, killActiveCollectSession }));
vi.mock('../whatsapp/sweep', () => ({ sweepStaleSessionChrome }));
vi.mock('../process/sweep', () => ({ sweepProcesses }));

import { getShopeeSessionStatus, openShopeeSession } from './session';
import { scannerEvents } from './events';

function emitLog(level: 'success' | 'error' | 'warn', message: string) {
  runCollectSession.mock.calls[0][0].onLog({ type: level, message, timestamp: Date.now(), data: null });
}

const OPEN_MESSAGE =
  '[session] browser-aberto: Chrome aberto(a) no perfil .shopee_profile. Faça o login.';

describe('openShopeeSession', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    runCollectSession.mockReset();
    runCollect.mockReset();
    killActiveCollectSession.mockReset();
    sweepStaleSessionChrome.mockReset().mockResolvedValue(0);
    sweepProcesses.mockReset().mockResolvedValue(0);
    scannerEvents.clear();
    unsubscribe = scannerEvents.subscribe(() => {});
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it('só resolve depois que o driver confirma que o Chrome subiu', async () => {
    runCollectSession.mockReturnValue({ child: { kill: vi.fn() } });
    const promise = openShopeeSession();
    await vi.advanceTimersByTimeAsync(0);

    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    emitLog('success', OPEN_MESSAGE);
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  it('não casa mais com a prosa antiga "aberto(a)!"', async () => {
    // A regex anterior (`/aberto\(a\)!/i`) era acionada por wording, e o mock do
    // spawn-driver usava uma string que ela nem casava — o caminho real nunca teve
    // cobertura. O handshake agora é por marcador de máquina.
    runCollectSession.mockReturnValue({ child: { kill: vi.fn() } });
    const promise = openShopeeSession();
    await vi.advanceTimersByTimeAsync(0);

    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    emitLog('error', '[session] Shopee aberto(a)! Faça o login.');
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(false);
  });

  it('propaga a falha de abertura sem os marcadores na mensagem', async () => {
    runCollectSession.mockReturnValue({ child: { kill: vi.fn() } });
    const promise = openShopeeSession();
    await vi.advanceTimersByTimeAsync(0);

    emitLog('error', '[session] falha-abrir: Não encontrei o Google Chrome neste computador.');
    await expect(promise).resolves.toEqual({
      success: false,
      error: 'Não encontrei o Google Chrome neste computador.',
    });
  });

  it('derruba driver e Chrome órfão quando a janela não aparece no prazo', async () => {
    runCollectSession.mockReturnValue({ child: { kill: vi.fn() } });
    const promise = openShopeeSession();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(45_000);

    await expect(promise).resolves.toMatchObject({ success: false });
    expect(killActiveCollectSession).toHaveBeenCalled();
    // O sweep roda no timeout também: matar só o python deixaria o Chrome-filho
    // segurando o .shopee_profile.
    expect(sweepStaleSessionChrome.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('limpa drivers de sessão antigos antes de abrir', async () => {
    // Um `collect.py shopee session` de um `next dev` anterior sobrevive ao restart
    // (quem reinicia perde o handle) e segura a sessão — o diagnóstico achou um
    // par desses, de 09:22, ainda vivos.
    const seen: string[] = [];
    sweepProcesses.mockResolvedValue(2);
    const unsub = scannerEvents.subscribe((e) => seen.push(e.message));
    runCollectSession.mockReturnValue({ child: { kill: vi.fn() } });

    const promise = openShopeeSession();
    await vi.advanceTimersByTimeAsync(0);
    emitLog('success', OPEN_MESSAGE);
    await promise;

    expect(sweepProcesses).toHaveBeenCalledWith(
      expect.objectContaining({ mustContain: ['collect.py', 'shopee', 'session'] })
    );
    expect(seen.some((m) => m.includes('2 driver(s) de sessão antigo(s)'))).toBe(true);
    unsub();
  });

  it('avisa quando cleanup de Chrome órfão roda antes de abrir', async () => {
    const seen: string[] = [];
    sweepStaleSessionChrome.mockResolvedValue(3);
    const unsub = scannerEvents.subscribe((e) => seen.push(e.message));
    runCollectSession.mockReturnValue({ child: { kill: vi.fn() } });

    const promise = openShopeeSession();
    await vi.advanceTimersByTimeAsync(0);
    emitLog('success', OPEN_MESSAGE);
    await promise;

    expect(seen.some((m) => m.includes('encerrei 3 Chrome(s)'))).toBe(true);
    unsub();
  });
});

describe('getShopeeSessionStatus', () => {
  beforeEach(() => {
    runCollect.mockReset();
  });

  it('repassa o estado lido do cookie SPC_ST', async () => {
    runCollect.mockResolvedValue({ ok: true, exitCode: 0, data: { authenticated: true } });
    await expect(getShopeeSessionStatus()).resolves.toEqual({ authenticated: true });
  });

  it('trata "não deu para ler" como null, não como deslogado', async () => {
    // Com o Chrome aberto o arquivo de cookies está travado. Dizer `false` aqui
    // seria o bug que fazia a UI mentir.
    runCollect.mockResolvedValue({ ok: true, exitCode: 0, data: { authenticated: null } });
    await expect(getShopeeSessionStatus()).resolves.toEqual({ authenticated: null });
  });

  it('devolve null quando o driver falha, em vez de estourar', async () => {
    runCollect.mockResolvedValue({ ok: false, exitCode: 1, error: 'boom' });
    await expect(getShopeeSessionStatus()).resolves.toEqual({ authenticated: null });
  });

  it('normaliza dado inesperado para null', async () => {
    runCollect.mockResolvedValue({ ok: true, exitCode: 0, data: { authenticated: 'sim' } });
    await expect(getShopeeSessionStatus()).resolves.toEqual({ authenticated: null });
  });
});