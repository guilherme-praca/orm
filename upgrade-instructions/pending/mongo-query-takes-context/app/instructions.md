---
changes:
  - id: mongo-query-takes-context
    summary: |
      `mongoQuery({ contract })` from `@prisma/orm-mongo/query-builder` no longer compiles: `mongoQuery` takes `{ context }`, an execution context. Replace `mongoQuery({ contract })` with `mongoStatic({ contract }).query` from `@prisma/orm-mongo/static`, or with `db.query` when you have a client from `mongo({ contract })`. Both validate the contract once. The detection matches files that call `mongoQuery` with a `contract` option, import it under another name, or call it through a namespace import.
    detection:
      glob: "**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx}"
      matches:
        - '(?<![\w$.])mongoQuery\s*(?:<[^>()]*>)?\s*\(\s*\{\s*contract\b'
        - '(?<![\w$.])mongoQuery\s+as\s+[\w$]+'
        - '(?<![\s\S])(?=[\s\S]*\bimport\s*\*\s*as\s+([\w$]+)\s+from\s*[\x27\x22](?:@prisma/orm-(?:family-)?mongo/query-builder|@internal/mongo-query-builder)[\x27\x22])[\s\S]*(?<![\w$.])\1\s*\.\s*mongoQuery\s*\('
  - id: mongo-runtime-takes-stack
    summary: |
      `MongoExecutionContext` no longer has a `stack` member; it is declared in `@prisma/orm-family-mongo/query-ast/execution` (`@internal/mongo-query-ast/execution`) and still exported from the runtime entry. `createMongoRuntime(...)` now takes the stack as its own option: pass `createMongoRuntime({ context, stack, driver })` with the stack you built the context from, and read the adapter or target from that stack instead of `context.stack`. The detection matches files that call `createMongoRuntime(` or read `.stack` from a context.
    detection:
      glob: "**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx}"
      matches:
        - '(?<![\w$.])createMongoRuntime\s*\('
        - '(?<![\w$])[\w$]*[cC]ontext\s*\.\s*stack(?![\w$])'
---

# mongoQuery takes an execution context, and the runtime takes the stack

`mongoQuery` now takes `{ context }`, a MongoDB execution context, instead of `{ contract }`, as the SQL builder `sql({ context })` does. The context comes from `mongoStatic({ contract })` or `mongo({ contract })`, which validate the contract once.

```ts
// Before
import { mongoQuery } from '@prisma/orm-mongo/query-builder';
const query = mongoQuery({ contract });

// After
import mongoStatic from '@prisma/orm-mongo/static';
const { query } = mongoStatic({ contract });

// Or, with a client
const db = mongo({ contract, url });
db.query.from('orders');
```

The runtime receives the stack beside the context:

```ts
const stack = createMongoExecutionStack({ target, adapter });
const context = createMongoExecutionContext({ contract, stack });
const runtime = createMongoRuntime({ context, stack, driver });
```
