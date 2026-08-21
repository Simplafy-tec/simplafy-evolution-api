import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { configService, Rabbitmq } from '@config/env.config';

import { RabbitmqController } from './rabbitmq.controller';

type LogCalls = {
  error: unknown[];
  log: unknown[];
  warn: unknown[];
};

type FakeChannel = {
  assertExchange: () => Promise<void>;
  assertQueue: () => Promise<void>;
  bindQueue: () => Promise<void>;
  close: () => Promise<void>;
  on: (event: string, listener: (error: Error) => void) => void;
  publish: () => Promise<boolean>;
};

const expectedLog = (scope: 'local' | 'global') => ({
  local: 'RabbitmqController.emit',
  message: 'RabbitMQ event published',
  scope,
  payload: '[REDACTED]',
  credentials: '[REDACTED]',
});

function rabbitmqConfig(globalEnabled: boolean): Rabbitmq {
  return {
    ENABLED: true,
    URI: '',
    FRAME_MAX: 8192,
    EXCHANGE_NAME: 'events',
    GLOBAL_ENABLED: globalEnabled,
    PREFIX_KEY: '',
    EVENTS: {
      QRCODE_UPDATED: true,
    } as Rabbitmq['EVENTS'],
  };
}

function spyLogger(controller: RabbitmqController): LogCalls {
  const calls: LogCalls = { log: [], error: [], warn: [] };
  const logger = (controller as any).logger;

  logger.log = (value: unknown) => calls.log.push(value);
  logger.error = (value: unknown) => calls.error.push(value);
  logger.warn = (value: unknown) => calls.warn.push(value);
  logger.info = () => undefined;

  return calls;
}

function configureRabbitmq(t: { after: (callback: () => void) => void }, config: Rabbitmq) {
  const originalGet = configService.get.bind(configService);

  (configService as any).get = (key: string) => {
    if (key === 'RABBITMQ') return config;
    if (key === 'LOG') return { LEVEL: ['WEBHOOKS'], COLOR: false };

    return originalGet(key as any);
  };

  t.after(() => {
    (configService as any).get = originalGet;
  });
}

function createController(
  t: { after: (callback: () => void) => void },
  globalEnabled: boolean,
  localEvent: unknown,
  channel: FakeChannel,
) {
  configureRabbitmq(t, rabbitmqConfig(globalEnabled));

  const controller = new RabbitmqController(
    {
      rabbitmq: {
        findUnique: async () => localEvent,
      },
    } as any,
    {
      waInstances: {
        instance: { instanceId: 'instance-id' },
      },
    } as any,
  );

  controller.amqpChannel = channel as any;
  (controller as any).maxReconnectAttempts = 0;

  return controller;
}

function successfulChannel(): FakeChannel {
  return {
    assertExchange: async () => undefined,
    assertQueue: async () => undefined,
    bindQueue: async () => undefined,
    close: async () => undefined,
    on: () => undefined,
    publish: async () => true,
  };
}

function sensitiveEvent(marker: string) {
  return {
    instanceName: 'instance',
    origin: 'RabbitmqSecuritySpec',
    event: 'QRCODE_UPDATED',
    data: {
      authorization: marker,
      nested: {
        apikey: marker,
        token: marker,
      },
    },
    serverUrl: 'https://example.invalid',
    dateTime: '2026-08-21T00:00:00.000Z',
    sender: 'spec',
    apiKey: marker,
    extra: {
      authorization: marker,
      token: marker,
      nested: {
        apikey: marker,
        authorization: marker,
        token: marker,
      },
    },
  };
}

function assertRedacted(values: unknown[], marker: string) {
  assert.equal(JSON.stringify(values).includes(marker), false);
}

test('prova inversa: publicação local não envia campos sensíveis ao logger', async (t) => {
  const marker = randomUUID();
  const controller = createController(t, false, { enabled: true, events: ['QRCODE_UPDATED'] }, successfulChannel());
  const calls = spyLogger(controller);

  await controller.emit(sensitiveEvent(marker));

  assert.deepEqual(calls.log, [expectedLog('local')]);
  assertRedacted(calls.log, marker);
});

test('prova inversa: publicação global não envia campos sensíveis ao logger', async (t) => {
  const marker = randomUUID();
  const controller = createController(t, true, null, successfulChannel());
  const calls = spyLogger(controller);

  await controller.emit(sensitiveEvent(marker));

  assert.deepEqual(calls.log, [expectedLog('global')]);
  assertRedacted(calls.log, marker);
});

test('prova inversa: falha de publicação não envia erro bruto ao logger', async (t) => {
  const marker = randomUUID();
  const channel = successfulChannel();
  channel.publish = async () => {
    throw new Error(marker);
  };
  const controller = createController(t, false, { enabled: true, events: ['QRCODE_UPDATED'] }, channel);
  const calls = spyLogger(controller);

  await controller.emit(sensitiveEvent(marker));

  assert.ok(calls.error.length >= 3);
  assert.deepEqual(calls.error[0], {
    local: 'RabbitmqController.emit',
    message: 'Error publishing local RabbitMQ message (attempt 1/3)',
    error: '[REDACTED]',
  });
  assertRedacted(calls.error, marker);
});

test('prova inversa: callbacks AMQP não enviam erro bruto ao logger', async (t) => {
  const marker = randomUUID();
  const channel = successfulChannel();
  const connectionListeners: Record<string, (error: Error) => void> = {};
  const channelListeners: Record<string, (error: Error) => void> = {};
  channel.on = (event, listener) => {
    channelListeners[event] = listener;
  };
  configureRabbitmq(t, rabbitmqConfig(false));

  const controller = new RabbitmqController(
    { rabbitmq: { findUnique: async () => null } } as any,
    { waInstances: {} } as any,
    {
      connect: (_options: unknown, callback: (error: Error, connection: unknown) => void) => {
        callback(null, {
          close: async () => undefined,
          createChannel: (channelCallback: (error: Error, createdChannel: unknown) => void) => {
            channelCallback(null, channel);
          },
          on: (event: string, listener: (error: Error) => void) => {
            connectionListeners[event] = listener;
          },
        });
      },
    } as any,
  );
  (controller as any).maxReconnectAttempts = 0;
  const calls = spyLogger(controller);

  await controller.init();
  connectionListeners.error(new Error(marker));
  channelListeners.error(new Error(marker));

  assert.ok(calls.error.length >= 2);
  assert.deepEqual(calls.error[0], {
    local: 'RabbitmqController.connectionError',
    message: 'RabbitMQ connection error',
    error: '[REDACTED]',
  });
  assertRedacted(calls.error, marker);
});

test('prova inversa: limpeza AMQP não envia erro bruto ao logger', async (t) => {
  const marker = randomUUID();
  const channel = successfulChannel();
  channel.close = async () => {
    throw new Error(marker);
  };
  const controller = createController(t, false, null, channel);
  const calls = spyLogger(controller);

  await controller.cleanup();

  assert.equal(calls.warn.length, 1);
  assert.deepEqual(calls.warn, [
    {
      local: 'RabbitmqController.cleanup',
      message: 'Error during cleanup',
      error: '[REDACTED]',
    },
  ]);
  assertRedacted(calls.warn, marker);
});
