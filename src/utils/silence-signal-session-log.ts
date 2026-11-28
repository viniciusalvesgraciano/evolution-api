/**
 * libsignal (whiskeysockets/libsignal-node, src/session_record.js) prints the whole Signal
 * session with console.info/console.warn when it opens, closes or prunes a session. The object
 * carries `rootKey`, `privKey` and the chain keys in clear text, so every reconnect wrote the
 * session secrets to the platform log, regardless of LOG_LEVEL.
 *
 * This filter keeps the label ("Closing session") and drops the session object.
 */

const SESSION_LABELS = [
  'Closing session',
  'Opening session',
  'Removing old closed session',
  'Session already closed',
] as const;

type ConsoleLike = Pick<Console, 'info' | 'warn' | 'log'>;

const installed = new WeakSet<object>();

function isSessionDump(args: unknown[]): boolean {
  const [first] = args;
  return typeof first === 'string' && SESSION_LABELS.some((label) => first.startsWith(label));
}

export function silenceSignalSessionLog(target: ConsoleLike = console): void {
  if (installed.has(target)) {
    return;
  }
  installed.add(target);

  for (const method of ['info', 'warn', 'log'] as const) {
    const original = target[method].bind(target) as (...args: unknown[]) => void;
    target[method] = ((...args: unknown[]) => {
      if (isSessionDump(args)) {
        original(String(args[0]).replace(/:\s*$/, ''));
        return;
      }
      original(...args);
    }) as Console[typeof method];
  }
}
