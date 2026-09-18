/**
 * Playback writes run one after another. They fire from a native event that can arrive several times a second,
 * and overlapping SQLite writes during a library scan is what "database is locked" comes from.
 */
let chain: Promise<unknown> = Promise.resolve();

export function queueWrite<T>(scope: string, write: () => Promise<T>): Promise<void> {
  chain = chain
    .then(write)
    .catch((error: unknown) => console.warn(`[audio] ${scope}`, error));
  return chain as Promise<void>;
}
