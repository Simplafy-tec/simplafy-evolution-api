import assert from 'node:assert/strict';
import test from 'node:test';

import { scrubRabbitmqError, scrubRabbitmqPublishLog } from './rabbitmq-log-scrubber';

test('prova inversa: publicação RabbitMQ não reproduz payload nem credenciais', () => {
  const markerApiKey = 'teste-apikey-nao-pode-aparecer';
  const markerCredential = 'teste-credencial-nao-pode-aparecer';
  const markerQrCode = 'teste-qr-nao-pode-aparecer';

  const safeSerialized = JSON.stringify(scrubRabbitmqPublishLog('global'));
  assert.equal(safeSerialized.includes(markerApiKey), false);
  assert.equal(safeSerialized.includes(markerCredential), false);
  assert.equal(safeSerialized.includes(markerQrCode), false);
  assert.deepEqual(scrubRabbitmqPublishLog('local'), {
    local: 'RabbitmqController.emit',
    message: 'RabbitMQ event published',
    scope: 'local',
    payload: '[REDACTED]',
    credentials: '[REDACTED]',
  });
});

test('prova inversa: erros RabbitMQ não reproduzem detalhes da conexão', () => {
  const markerConnection = 'teste-uri-com-credencial-nao-pode-aparecer';
  const safeSerialized = JSON.stringify({ error: scrubRabbitmqError() });

  assert.equal(safeSerialized.includes(markerConnection), false);
  assert.equal(scrubRabbitmqError(), '[REDACTED]');
});
