import type { MutationDefaults } from '@internal/framework-components/runtime';
import type { MongoCodec } from '@internal/mongo-codec';

/**
 * Read-only view of the codec registry exposed on `MongoExecutionContext`.
 *
 * Hides `register()` and the iterator from public surface — users do not mutate the per-execution codec registry.
 */
export interface MongoCodecLookup {
  get(id: string): MongoCodec<string> | undefined;
  has(id: string): boolean;
}

/**
 * The context the query lanes build against: the user's contract, a read-only lookup over the codec registry composed from every stack contributor, and `applyMutationDefaults`, which fills the contract's execution defaults from the composed generators. The runtime creates it with `createMongoExecutionContext`.
 *
 * Mirrors SQL's `ExecutionContext`: it holds no runtime concerns such as the adapter or the stack; the runtime receives the stack as its own option.
 */
export interface MongoExecutionContext<TContract = unknown> extends MutationDefaults {
  readonly contract: TContract;
  readonly codecs: MongoCodecLookup;
}
