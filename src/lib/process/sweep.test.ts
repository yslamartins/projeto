import { describe, expect, it, vi } from 'vitest';
import { sweepProcesses, type ProcessInfo } from './sweep';

function proc(pid: number, commandLine: string): ProcessInfo {
  return { pid, commandLine };
}

const PY = String.raw`C:\proj\.venv\Scripts\python.exe`;
const SCRIPT = String.raw`C:\proj\tools\scrapling\collect.py`;

describe('sweepProcesses', () => {
  it('derruba só o processo que casa com todos os filtros', async () => {
    const killer = vi.fn(async () => {});
    const lister = vi.fn(async () => [
      proc(101, `${PY} ${SCRIPT} shopee session`),
      proc(102, `${PY} ${SCRIPT} shopee terms`),
      proc(103, `${PY} ${SCRIPT} tiktok session`),
    ]);

    const killed = await sweepProcesses({
      processName: 'python.exe',
      mustContain: ['collect.py', 'shopee', 'session'],
      lister,
      killer,
    });

    expect(killer).toHaveBeenCalledTimes(1);
    expect(killer).toHaveBeenCalledWith(101);
    expect(killed).toBe(1);
  });

  it('não confunde `session` com `session-status`', async () => {
    // Casar por substring mataria também a consulta de status — e um sweep de
    // "derruba a sessão de login" não pode derrubar uma varredura em andamento.
    const killer = vi.fn(async () => {});
    const killed = await sweepProcesses({
      processName: 'python.exe',
      mustContain: ['collect.py', 'shopee', 'session'],
      lister: async () => [proc(101, `${PY} ${SCRIPT} shopee session-status`)],
      killer,
    });

    expect(killed).toBe(0);
    expect(killer).not.toHaveBeenCalled();
  });

  it('ignora aspas no command line', async () => {
    const killer = vi.fn(async () => {});
    const killed = await sweepProcesses({
      processName: 'python.exe',
      mustContain: ['session'],
      lister: async () => [proc(101, `"${PY}" ${SCRIPT} shopee session`)],
      killer,
    });

    expect(killed).toBe(1);
  });

  it('não toca em nada quando não há candidatos', async () => {
    const killer = vi.fn(async () => {});
    const killed = await sweepProcesses({
      processName: 'python.exe',
      mustContain: ['collect.py', 'shopee', 'session'],
      lister: async () => [],
      killer,
    });

    expect(killed).toBe(0);
    expect(killer).not.toHaveBeenCalled();
  });

  it('devolve 0 sem lançar quando a enumeração falha', async () => {
    const killer = vi.fn(async () => {});
    const killed = await sweepProcesses({
      processName: 'python.exe',
      mustContain: ['collect.py'],
      lister: async () => {
        throw new Error('powershell fora do ar');
      },
      killer,
    });

    expect(killed).toBe(0);
    expect(killer).not.toHaveBeenCalled();
  });

  it('um PID que resiste não impede os demais de cair', async () => {
    const killed: number[] = [];
    const count = await sweepProcesses({
      processName: 'python.exe',
      mustContain: ['collect.py', 'session'],
      lister: async () => [proc(101, `${PY} ${SCRIPT} shopee session`), proc(202, `${PY} ${SCRIPT} shopee session`)],
      killer: async (pid) => {
        if (pid === 101) throw new Error('acesso negado');
        killed.push(pid);
      },
    });

    expect(killed).toEqual([202]);
    expect(count).toBe(2);
  });
});