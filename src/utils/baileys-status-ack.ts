/**
 * Acks the top-level `<status>` stanza that Baileys 7.0.0-rc.9 ignores.
 *
 * Some accounts now receive contacts' status updates as a `<status>` stanza instead of
 * `<message from="status@broadcast">`. Baileys rc.9 registers no `CB:status` handler
 * (lib/Socket/messages-recv.js), so the stanza is never acked. About 3000 s later the server
 * ends the stream with `<stream:error><ack class="status"/></stream:error>` and the instance
 * reconnects. Same fix as WhiskeySockets/Baileys#2866 and #2883 (issue #2858), applied here
 * until the upstream release ships it.
 */

export type StatusAckNode = {
  tag: string;
  attrs: Record<string, string>;
  content?: unknown;
};

export type StatusAckClient = {
  ws: { on(event: string, listener: (node: StatusAckNode) => void): unknown };
  sendMessageAck(node: StatusAckNode, errorCode?: number): Promise<void>;
};

export type StatusAckLogger = {
  warn(message: string): void;
};

export function ackStatusStanzas(client: StatusAckClient, logger: StatusAckLogger): void {
  client.ws.on('CB:status', (node: StatusAckNode) => {
    client.sendMessageAck(node).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(`could not ack <status> stanza ${node?.attrs?.id ?? ''}: ${reason}`);
    });
  });
}
