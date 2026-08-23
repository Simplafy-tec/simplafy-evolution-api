const REDACTED = '[REDACTED]';

type RabbitmqLogScope = 'local' | 'global';

/**
 * Constrói o único payload permitido para logs de publicação RabbitMQ.
 *
 * O evento publicado pode carregar credenciais de sessão, QR codes e a API
 * key da instância. Por isso este scrubber é fail-closed: ele não recebe nem
 * copia o payload original; qualquer informação que não esteja nesta
 * allowlist fixa fica fora do log.
 */
export function scrubRabbitmqPublishLog(scope: RabbitmqLogScope) {
  return {
    local: 'RabbitmqController.emit',
    message: 'RabbitMQ event published',
    scope,
    payload: REDACTED,
    credentials: REDACTED,
  };
}

/**
 * Erros de bibliotecas AMQP podem carregar a URI de conexão ou dados do
 * request. Não registramos a mensagem bruta para evitar vazar credenciais.
 */
export function scrubRabbitmqError() {
  return REDACTED;
}
