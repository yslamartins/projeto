import { describe, expect, it } from 'vitest';
import { sweepStaleSessionChrome } from './sweep';

describe('sweepStaleSessionChrome', () => {
  it('mata cada Chrome órfão do perfil e retorna quantos foram encerrados', async () => {
    const killed: number[] = [];
    const lister = async () => [101, 202];

    const count = await sweepStaleSessionChrome(
      '.whatsapp/session',
      lister,
      async (pid) => {
        killed.push(pid);
      }
    );

    expect(killed).toEqual([101, 202]);
    expect(count).toBe(2);
  });

  it('não chama o killer quando não há órfãos', async () => {
    let calls = 0;
    const count = await sweepStaleSessionChrome('.whatsapp/session', async () => [], async () => {
      calls++;
    });

    expect(count).toBe(0);
    expect(calls).toBe(0);
  });

  it('não derruba a sessão inteira quando um PID resiste ao Stop-Process', async () => {
    const killed: number[] = [];
    // Sem esse `.catch`, um "acesso negado" em um PID rejeitaria o Promise.all e
    // os demais Chrome órfãos sobreviveriam segurando o perfil.
    const count = await sweepStaleSessionChrome(
      '.whatsapp/session',
      async () => [101, 202],
      async (pid) => {
        if (pid === 101) throw new Error('acesso negado');
        killed.push(pid);
      }
    );

    expect(killed).toEqual([202]);
    expect(count).toBe(2);
  });

  it('aguarda a liberação real do perfil antes de devolver', async () => {
    // O primeiro poll ainda enxerga um Chrome vivo; só o segundo confirma a queda.
    let polls = 0;
    const lister = async () => {
      polls++;
      return polls <= 2 ? [101] : [];
    };

    await sweepStaleSessionChrome('.whatsapp/session', lister, async () => {});

    expect(polls).toBeGreaterThan(2);
  });
});