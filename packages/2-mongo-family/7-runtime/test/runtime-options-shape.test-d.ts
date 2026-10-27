import type { MongoCodecRegistry } from '@internal/mongo-codec';
import { expectTypeOf, test } from 'vitest';
import type {
  MongoExecutionContext,
  MongoExecutionStack,
  MongoRuntimeOptions,
} from '../src/exports/index';
import { createMongoRuntime } from '../src/mongo-runtime';

declare const ctx: MongoExecutionContext;
declare const stack: MongoExecutionStack;

test('the execution context carries no stack; the runtime takes it as its own option', () => {
  expectTypeOf<MongoExecutionContext>().not.toHaveProperty('stack');
  expectTypeOf<MongoRuntimeOptions['stack']>().toEqualTypeOf<MongoExecutionStack>();
});

test('runtime options accept only context, driver, middleware, and mode', () => {
  createMongoRuntime({
    context: ctx,
    stack,
    driver: {} as never,
  });

  const validOptions = {
    context: ctx,
    stack,
    driver: {} as never,
    middleware: [
      {
        name: 'middleware',
        familyId: 'mongo',
        async beforeEncode() {},
      },
    ],
    mode: 'permissive',
  } satisfies MongoRuntimeOptions;

  createMongoRuntime(validOptions);

  createMongoRuntime({
    context: ctx,
    stack,
    driver: {} as never,
    // @ts-expect-error `codecs` is not a property of MongoRuntimeOptions —
    // codecs are aggregated via `createMongoExecutionContext` and reached
    // through `context.codecs`.
    codecs: {} as MongoCodecRegistry,
  });

  createMongoRuntime({
    context: ctx,
    stack,
    driver: {} as never,
    // @ts-expect-error `adapter` is not a property of MongoRuntimeOptions —
    // the adapter is reached via `stack.adapter`.
    adapter: {} as never,
  });

  createMongoRuntime({
    context: ctx,
    stack,
    driver: {} as never,
    // @ts-expect-error `targetId` is not a property of MongoRuntimeOptions —
    // the target is reached via `stack.target.targetId`.
    targetId: 'mongo',
  });

  createMongoRuntime({
    context: ctx,
    stack,
    driver: {} as never,
    // @ts-expect-error `contract` is not a property of MongoRuntimeOptions —
    // the contract is reached via `context.contract`.
    contract: {},
  });
});

declare const _options: MongoRuntimeOptions;
