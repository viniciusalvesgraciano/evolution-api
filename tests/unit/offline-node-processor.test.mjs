// Baileys 7.0.0-rc.9: one offline node whose handler throws (e.g. a Meta AI message from
// `<id>@bot`, rejected by decodeMessageNode with "Unknown message type") kills the offline queue
// for the whole connection: the rejection escapes the while loop, `isProcessing` stays true and
// every later offline node is queued forever. Seen in production on 2026-11-26: no incoming
// message reached the webhook for 8 hours.
//
// The test runs the REAL makeOfflineNodeProcessor source taken from the installed Baileys file.
// Set BAILEYS_MESSAGES_RECV to point at another copy of lib/Socket/messages-recv.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { patchSource } from '../../Docker/scripts/patch-baileys-offline.mjs';

const FILE = process.env.BAILEYS_MESSAGES_RECV || 'node_modules/baileys/lib/Socket/messages-recv.js';

function buildProcessor(source, handlers, errors) {
  const start = source.indexOf('const makeOfflineNodeProcessor = () => {');
  const end = source.indexOf('const offlineNodeProcessor = makeOfflineNodeProcessor();');
  assert.ok(start >= 0 && end > start, 'makeOfflineNodeProcessor not found in Baileys source');
  const body = source.slice(start, end);
  const factory = new Function(
    'handleMessage',
    'handleCall',
    'handleReceipt',
    'handleNotification',
    'ws',
    'onUnexpectedError',
    `${body}\nreturn makeOfflineNodeProcessor();`,
  );
  return factory(
    handlers.message,
    async () => {},
    async () => {},
    async () => {},
    { isOpen: true },
    (err, ctx) => errors.push(`${ctx}: ${err.message}`),
  );
}

async function scenario(source) {
  const handled = [];
  const errors = [];
  const processor = buildProcessor(
    source,
    {
      message: async (node) => {
        if (node.attrs.from.endsWith('@bot')) throw new Error('Unknown message type');
        handled.push(node.attrs.id);
      },
    },
    errors,
  );
  processor.enqueue('message', { attrs: { id: 'meta-ai', from: '867051314767696@bot', offline: '8' } });
  processor.enqueue('message', { attrs: { id: 'oferta-1', from: '120363000000000001@g.us', offline: '8' } });
  await new Promise((r) => setTimeout(r, 20));
  processor.enqueue('message', { attrs: { id: 'oferta-2', from: '120363000000000001@g.us', offline: '8' } });
  await new Promise((r) => setTimeout(r, 20));
  return { handled, errors };
}

test('a throwing offline node does not block the nodes after it', async () => {
  const patched = patchSource(readFileSync(FILE, 'utf8'));
  const { handled, errors } = await scenario(patched);
  assert.deepEqual(handled, ['oferta-1', 'oferta-2']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Unknown message type/);
});

test('patch is idempotent', () => {
  const once = patchSource(readFileSync(FILE, 'utf8'));
  assert.equal(patchSource(once), once);
});

test('patch fails loudly when the anchor is missing (Baileys changed)', () => {
  assert.throws(() => patchSource('nothing to see here'), /anchor not found/);
});
