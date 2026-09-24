import { scannerEvents } from './events';
import { runCollectSession } from './spawn-driver';

export function openShopeeSession(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    scannerEvents.emit('step', 'Iniciando navegador Chrome visível com perfil persistente (.shopee_profile)...');

    // Sessão headful do driver: permanece aberta até o usuário fechar a aba/janela.
    runCollectSession({ args: ['shopee', 'session'] });

    scannerEvents.emit(
      'info',
      'Navegador aberto. Faça o login ou resolva qualquer verificação manualmente nesta janela. O bot não toca em nada — apenas aguarda e salva a sessão quando terminar. Feche a janela quando concluir.'
    );

    return Promise.resolve({ success: true, message: 'Navegador aberto com sucesso.' });
  } catch (error: any) {
    console.error('Error opening Shopee session:', error);
    scannerEvents.emit('error', `Falha ao abrir navegador: ${error.message}`);
    return Promise.resolve({ success: false, error: error.message });
  }
}