import { describe, expect, it, vi } from 'vitest';
import { sweepStaleSessionChrome } from './sweep';

describe('sweepStaleSessionChrome', () => {
  it('mata cada Chrome órfão do perfil e retorna quantos foram encerrados', async () => {
    const lister = vi.fn(async () => [101, 202]);
    const killer = vi.fn(async () => {});

    const killed = await sweepStaleSessionChrome('.whatsapp/session', lister, killer);

    expect(lister).toHaveBeenCalledWith('.whatsapp/session');
    expect(killer).toHaveBeenCalledWith(101);
    expect(killer).toHaveBeenCalledWith(202);
    expect(killed).toBe(2);
  });

  it('retorna 0 e não toca no killer quando não há órfãos', async () => {
    const lister = vi.fn(async () => []);
    const killer = vi.fn(async () => {});

    const killed = await sweepStaleSessionChrome('.whatsapp/session', lister, killer);

    expect(killed).toBe(0);
    expect(killer).not.toHaveBeenCalled();
  });

  it('retorna 0 sem lançar quando a listagem falha (ex.: sem PowerShell)', async () => {
    const lister = vi.fn(async () => {
      throw new Error('powershell fora do ar');
    });
    const killer = vi.fn(async () => {});

    const killed = await sweepStaleSessionChrome('.whatsapp/session', lister, killer);

    expect(killed).toBe(0);
    expect(killer).not.toHaveBeenCalled();
  });

  it('não deixa um killer com erro derrubar os demais órfãos', async () => {
    const lister = vi.fn(async () => [101, 202]);
    const killer = vi.fn(async (pid: number) => {
      if (pid === 101) throw new Error('acesso negado');
    });

    const killed = await sweepStaleSessionChrome('.whatsapp/session', lister, killer);

    expect(killer).toHaveBeenCalledWith(101);
    expect(killer).toHaveBeenCalledWith(202);
    expect(killed).toBe(2);
  });
});
