// Patches Baileys 7.0.0-rc.9 so one failing offline node no longer kills the offline queue.
//
// In rc.9 `makeOfflineNodeProcessor` awaits each handler inside a while loop with no catch per
// node. A handler that throws (decodeMessageNode rejects a Meta AI message from `<id>@bot` with
// "Unknown message type") escapes the loop, `isProcessing` stays true and every later offline
// node of that connection is queued forever. Upstream fixed it the same way in rc10+
// (Utils/offline-node-processor.js: `await nodeProcessor(node).catch(...)`).
//
// Runs in the Docker build right after `npm ci`. Fails the build if the anchor is gone, so a
// Baileys upgrade cannot silently drop the fix.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ANCHOR = 'await nodeProcessor(node);';
const FIXED = "await nodeProcessor(node).catch(err => onUnexpectedError(err, 'processing offline ' + type));";

export function patchSource(source) {
  if (source.includes(FIXED)) return source;
  const count = source.split(ANCHOR).length - 1;
  if (count !== 1) {
    throw new Error(`patch-baileys-offline: anchor not found exactly once (found ${count})`);
  }
  return source.replace(ANCHOR, FIXED);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] || 'node_modules/baileys/lib/Socket/messages-recv.js';
  writeFileSync(file, patchSource(readFileSync(file, 'utf8')));
  console.log(`patch-baileys-offline: ${file} patched`);
}
