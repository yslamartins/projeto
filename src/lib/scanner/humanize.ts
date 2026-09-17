import { Page } from 'playwright';

export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Pausa "pensada" aleatória: um humano não age em intervalos fixos.
 */
export function humanDelay(min = 400, max = 1400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, randomInt(min, max)));
}

let cursor = { x: 0, y: 0 };

/**
 * Posiciona o cursor em um ponto "natural" da janela. O mouse do Playwright
 * começa em (0,0) (canto superior esquerdo) — um cargo incomum e detectável.
 */
export async function resetCursor(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  cursor = {
    x: randomInt(Math.round(size.w * 0.2), Math.round(size.w * 0.8)),
    y: randomInt(Math.round(size.h * 0.25), Math.round(size.h * 0.85)),
  };
  await page.mouse.move(cursor.x, cursor.y);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Move o cursor até (x, y) com trajetória suave (easing), velocidade
 * variável e leves desvios senoidais — como um mouse real, não um salto.
 */
export async function humanMouseMove(page: Page, x: number, y: number): Promise<void> {
  const dx = x - cursor.x;
  const dy = y - cursor.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return;

  const steps = Math.min(70, Math.max(12, Math.floor(dist / 10)));
  const waveX = randomInt(3, 6);
  const waveY = randomInt(3, 6);
  const ampX = randomInt(1, 3);
  const ampY = randomInt(1, 3);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = easeInOutQuad(t);
    const jitterX = Math.sin(t * Math.PI * waveX) * ampX;
    const jitterY = Math.cos(t * Math.PI * waveY) * ampY;
    await page.mouse.move(
      Math.round(cursor.x + dx * eased + jitterX),
      Math.round(cursor.y + dy * eased + jitterY)
    );
    await page.waitForTimeout(randomInt(5, 16));
  }
  cursor = { x, y };
}

/**
 * Pequeno "vaguear" ocioso do cursor pela área visível, como um usuário que
 * gira o mouse enquanto lê a página.
 */
export async function humanMouseIdle(page: Page): Promise<void> {
  await humanMouseMove(
    page,
    cursor.x + randomInt(-120, 120),
    cursor.y + randomInt(-60, 60)
  );
}

/**
 * Rolagem contínua com velocidade variável, micro-reversões ("o dedo
 * escapou") e pausas de leitura ocasionais. Substitui "pulos" de wheel fixos.
 */
export async function humanScroll(page: Page, distance = 1000, direction: 1 | -1 = 1): Promise<void> {
  let moved = 0;
  while (moved < distance) {
    const chunk = randomInt(60, 150);
    const step = Math.min(chunk, distance - moved);
    await page.mouse.wheel(0, step * direction);
    moved += step;
    await page.waitForTimeout(randomInt(60, 180));

    // Ocasional o cursor "vai além" e volta um pouco
    if (Math.random() < 0.2) {
      await page.mouse.wheel(0, -randomInt(20, 80) * direction);
      await page.waitForTimeout(randomInt(60, 220));
    }

    // Pausa mais longa — como quem pára para olhar um card
    if (Math.random() < 0.12) {
      await page.waitForTimeout(randomInt(500, 1400));
    }
  }
}