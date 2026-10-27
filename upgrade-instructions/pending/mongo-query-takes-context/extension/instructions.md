---
changes:
  - id: mongo-query-takes-context
    summary: |
      `mongoQuery` (`@internal/mongo-query-builder`, published as `@prisma/orm-family-mongo/query-builder` and `@prisma/orm-mongo/query-builder`) takes `{ context }`, a `MongoExecutionContext`, instead of `{ contract }`, and reads the contract from it. Code that builds the builder itself passes the execution context it already has, for example `mongoQuery({ context })` after `createMongoExecutionContext({ contract, stack })`; code that has a client or a static context uses `db.query` or `mongoStatic({ contract }).query`. The detection matches files that call `mongoQuery` with a `contract` option, import it under another name, or call it through a namespace import.
    detection:
      glob: "**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx}"
      matches:
        - '(?<![\w$.])mongoQuery\s*(?:<[^>()]*>)?\s*\(\s*\{\s*contract\b'
        - '(?<![\w$.])mongoQuery\s+as\s+[\w$]+'
        - '(?<![\s\S])(?=[\s\S]*\bimport\s*\*\s*as\s+([\w$]+)\s+from\s*[\x27\x22](?:@prisma/orm-(?:family-)?mongo/query-builder|@internal/mongo-query-builder)[\x27\x22])[\s\S]*(?<![\w$.])\1\s*\.\s*mongoQuery\s*\('
---

# mongoQuery takes an execution context

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
