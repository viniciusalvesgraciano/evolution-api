import assert from 'node:assert/strict';
import { test } from 'node:test';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SessionRecord } = require('libsignal');

import { silenceSignalSessionLog } from '../../src/utils/silence-signal-session-log';

const SECRET = 'c2VncmVkby1kZS10ZXN0ZQ';

// Session with the same shape libsignal keeps, filled with synthetic bytes.
function fakeSession() {
  const key = Buffer.from(SECRET, 'base64');
  return {
    currentRatchet: {
      rootKey: key,
      ephemeralKeyPair: { pubKey: key, privKey: key },
      lastRemoteEphemeralKey: key,
      previousCounter: 0,
    },
    indexInfo: { baseKey: key, baseKeyType: 1, closed: -1, used: 1, created: 1, remoteIdentityKey: key },
    chains: {},
    pendingPreKey: undefined,
    registrationId: 1,
  };
}

function capture() {
  const out: string[] = [];
  const sink = {
    info: (...args: unknown[]) => out.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
    warn: (...args: unknown[]) => out.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
    log: (...args: unknown[]) => out.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  };
  return { sink, out };
}

function withConsole(sink: Pick<Console, 'info' | 'warn' | 'log'>, run: () => void) {
  const saved = { info: console.info, warn: console.warn, log: console.log };
  Object.assign(console, sink);
  try {
    run();
  } finally {
    Object.assign(console, saved);
  }
}

test('sem o filtro, o libsignal imprime privKey e rootKey ao fechar a sessão', () => {
  const { sink, out } = capture();
  withConsole(sink, () => new SessionRecord().closeSession(fakeSession()));
  assert.equal(out.length, 1);
  assert.match(out[0], /Closing session/);
  assert.match(out[0], /privKey/);
  assert.match(out[0], /rootKey/);
});

test('com o filtro, abrir, fechar e fechar de novo só imprimem o rótulo', () => {
  const { sink, out } = capture();
  silenceSignalSessionLog(sink as unknown as Console);
  withConsole(sink, () => {
    const record = new SessionRecord();
    const session = fakeSession();
    record.closeSession(session);
    record.closeSession(session);
    record.openSession(session);
  });
  assert.deepEqual(out, ['Closing session', 'Session already closed', 'Opening session']);
  for (const line of out) {
    assert.doesNotMatch(line, /privKey|rootKey|Buffer|ephemeral/);
  }
});

test('o filtro não mexe nos outros logs e não se instala duas vezes', () => {
  const { sink, out } = capture();
  silenceSignalSessionLog(sink as unknown as Console);
  silenceSignalSessionLog(sink as unknown as Console);
  sink.info('Migrating session to:', 'v1');
  sink.warn('outra coisa', { a: 1 });
  assert.deepEqual(out, ['Migrating session to: v1', 'outra coisa {"a":1}']);
});
