import { scannerEvents } from './events';
import { rankTikTokVideos, toAbsoluteTikTokUrl, TikTokSearchCard } from './tiktok-relevance';
import { runCollect, runCollectSession } from './spawn-driver';

function extractInterestingTikTokCards(cards: TikTokSearchCard[]): TikTokSearchCard[] {
  const seen = new Set<string>();
  const unique: TikTokSearchCard[] = [];
  for (const c of cards) {
    const id = c.href.split('?')[0];
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(c);
  }
  return unique;
}

interface TikTokSearchOutcome {
  term: string;
  cards: TikTokSearchCard[];
  count: number;
  block: string | null;
}

export function openTikTokSession(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    scannerEvents.emit('step', 'Iniciando navegador Chrome visível com perfil TikTok (.tiktok_profile)...');

    // Sessão headful do driver: permanece aberta até o usuário fechar a aba/janela.
    runCollectSession({ args: ['tiktok', 'session'] });

    scannerEvents.emit(
      'success',
      'TikTok aberto! Faça o login ou resolva qualquer verificação. Feche a janela quando terminar; os cookies são salvos no perfil.'
    );

    return Promise.resolve({ success: true, message: 'Navegador TikTok aberto com sucesso.' });
  } catch (error: any) {
    console.error('Error opening TikTok session:', error);
    scannerEvents.emit('error', `Falha ao abrir TikTok: ${error.message}`);
    return Promise.resolve({ success: false, error: error.message });
  }
}

export async function searchTikTokVideo(options: {
  term: string;
  headful?: boolean;
}): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  const term = (options.term || '').trim();
  if (!term) {
    return { success: false, error: 'Termo de busca vazio.' };
  }

  if (scannerEvents.getIsScanning() || scannerEvents.getVideoProcessing()) {
    return {
      success: false,
      error: 'Outra tarefa de automação (varredura ou vídeo) já está em execução.',
    };
  }

  const headful = Boolean(options.headful);

  try {
    scannerEvents.setVideoProcessing(true);

    const args = ['tiktok', 'search', '--q', term, ...(headful ? ['--headful'] : [])];
    const outcome = await runCollect<TikTokSearchOutcome>({ args });

    // Login-wall/verificação chega como erro acionável do próprio driver (PT-BR)
    if (!outcome.ok) {
      const message = outcome.error || 'Falha ao buscar no TikTok.';
      scannerEvents.emit('error', message);
      return { success: false, error: message };
    }

    const rawCards = Array.isArray(outcome.data?.cards) ? outcome.data!.cards : [];
    const cards = extractInterestingTikTokCards(rawCards);

    if (cards.length === 0) {
      scannerEvents.emit('info', 'Nenhum vídeo encontrado na busca do TikTok.');
      return { success: false, error: 'Nenhum vídeo relevante encontrado no TikTok.' };
    }

    scannerEvents.emit(
      'info',
      `${cards.length} vídeo(s) encontrados na busca do TikTok. Avaliando relevância...`
    );

    const best = rankTikTokVideos(cards, term);

    if (!best) {
      scannerEvents.emit(
        'warn',
        `Nenhum vídeo suficientemente relevante encontrado no TikTok para "${term}".`
      );
      return { success: false, error: 'Nenhum vídeo relevante encontrado no TikTok.' };
    }

    const videoUrl = toAbsoluteTikTokUrl(best.card.href);
    scannerEvents.emit(
      'success',
      `Vídeo relevante encontrado: ${videoUrl} (score ${best.score})`
    );

    return { success: true, videoUrl };
  } catch (error: any) {
    console.error('Error searching TikTok:', error);
    scannerEvents.emit('error', `Erro ao buscar no TikTok: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    scannerEvents.setVideoProcessing(false);
  }
}