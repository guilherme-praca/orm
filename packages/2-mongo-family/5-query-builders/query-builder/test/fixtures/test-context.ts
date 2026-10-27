import type { MongoExecutionContext } from '@internal/mongo-query-ast/execution';

export function contextOf<TContract>(contract: TContract): MongoExecutionContext<TContract> {
  return {
    contract,
    codecs: { get: () => undefined, has: () => false },
    applyMutationDefaults: () => [],
  };
}
