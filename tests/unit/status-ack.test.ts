import assert from 'node:assert/strict';
import { test } from 'node:test';

import makeWASocket, { initAuthCreds } from 'baileys';
import P from 'pino';

import { ackStatusStanzas } from '../../src/utils/baileys-status-ack';

// Real Baileys 7.0.0-rc.9 socket pointed at a closed local port: nothing leaves the machine.
// Baileys logs "sent ack" before writing the frame, so the ack is visible without a session.
function realSocket() {
  const lines: Array<Record<string, any>> = [];
  const logger = P({ level: 'debug' }, { write: (line: string) => lines.push(JSON.parse(line)) });
  const keys: Record<string, Record<string, unknown>> = {};
  const sock = makeWASocket({
    auth: {
      creds: { ...initAuthCreds(), me: { id: '5511900000000:1@s.whatsapp.net', name: 'Teste' } },
      keys: {
        get: async (type: string, ids: string[]) =>
          Object.fromEntries(ids.map((id) => [id, keys[type]?.[id]]).filter(([, v]) => v !== undefined)),
        set: async (data: Record<string, Record<string, unknown>>) => {
          for (const [type, values] of Object.entries(data)) {
            keys[type] = { ...(keys[type] ?? {}), ...values };
          }
        },
      },
    } as any,
    logger: logger as any,
    waWebSocketUrl: 'ws://127.0.0.1:9',
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  });
  sock.ev.on('connection.update', () => undefined);
  return { sock, lines };
}

const statusNode = {
  tag: 'status',
  attrs: { id: '3A2069ED', from: '5511999999999@s.whatsapp.net', type: 'media', offline: '0' },
};

const sentAcks = (lines: Array<Record<string, any>>) =>
  lines.filter((entry) => entry.msg === 'sent ack').map((entry) => entry.sent);

function closeSocket(sock: { end(error: Error | undefined): unknown }) {
  try {
    sock.end(undefined);
  } catch {
    // already closed
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

test('Baileys rc.9 sozinho não confirma o <status> (a causa da queda de 50 min)', async () => {
  const { sock, lines } = realSocket();
  sock.ws.emit('CB:status', statusNode);
  await settle();
  assert.deepEqual(sentAcks(lines), []);
  closeSocket(sock);
});

test('com ackStatusStanzas, o <status> recebe ack class=status com id, to e type', async () => {
  const { sock, lines } = realSocket();
  const warnings: string[] = [];
  ackStatusStanzas(sock as any, { warn: (message) => warnings.push(message) });

  sock.ws.emit('CB:status', statusNode);
  await settle();

  assert.deepEqual(sentAcks(lines), [
    { id: '3A2069ED', to: '5511999999999@s.whatsapp.net', class: 'status', type: 'media' },
  ]);
  // The socket is not open, so the write fails; the handler logs it instead of crashing.
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /could not ack <status> stanza 3A2069ED/);
  closeSocket(sock);
});

test('falha no envio do ack vira aviso e não derruba o processo', async () => {
  const listeners: Record<string, (node: any) => void> = {};
  const warnings: string[] = [];
  ackStatusStanzas(
    {
      ws: { on: (event, listener) => (listeners[event] = listener) },
      sendMessageAck: async () => {
        throw new Error('Connection Closed');
      },
    },
    { warn: (message) => warnings.push(message) },
  );

  listeners['CB:status'](statusNode);
  await settle();

  assert.deepEqual(warnings, ['could not ack <status> stanza 3A2069ED: Connection Closed']);
});
