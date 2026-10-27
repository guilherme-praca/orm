import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const id = 'mongo-query-takes-context';
const facadePackage = ['@prisma', 'orm-mongo'].join('/');
const familyPackage = ['@prisma', 'orm-family-mongo'].join('/');

function detects(audience: 'app' | 'extension', content: string): boolean {
  const path = `upgrade-instructions/pending/mongo-query-takes-context/${audience}/instructions.md`;
  const guide = readFileSync(join(repoRoot, path), 'utf-8');
  const entry = guide.split(/\n {2}- id: /).find((block) => block.startsWith(`${id}\n`));
  if (entry === undefined) throw new Error(`The ${audience} guide has no change ${id}`);
  const patterns = [...entry.matchAll(/^ {8}- '(.*)'$/gm)].map(
    ([, pattern]) => new RegExp((pattern ?? '').replaceAll("''", "'")),
  );
  if (patterns.length === 0) throw new Error(`The ${audience} change ${id} has no detection`);
  return patterns.some((pattern) => pattern.test(content));
}

describe.each(['app', 'extension'] as const)('the %s mongoQuery detection', (audience) => {
  it.each([
    ['a call with a contract', 'const query = mongoQuery({ contract });'],
    ['a call with a named contract', 'mongoQuery({ contract: contractFromJson<Contract>(json) })'],
    ['a call with a type argument', 'mongoQuery<Contract>({\n  contract,\n})'],
    ['an aliased import', `import { mongoQuery as query } from '${facadePackage}/query-builder';`],
    [
      'a call through a namespace import',
      `import * as builder from '${familyPackage}/query-builder';\nbuilder.mongoQuery({ context });`,
    ],
  ])('finds %s', (_name, content) => {
    expect(detects(audience, content)).toBe(true);
  });

  it.each([
    ['a call with a context', 'const query = mongoQuery({ context });'],
    ['the static query', 'const { query } = mongoStatic({ contract });'],
    ['a method of the same name', 'db.mongoQuery({ contract })'],
    ['a longer name', 'myMongoQuery({ contract })'],
    [
      'a member call on another namespace',
      `import * as builder from '${facadePackage}/query-builder';\nother.mongoQuery({ context });`,
    ],
  ])('skips %s', (_name, content) => {
    expect(detects(audience, content)).toBe(false);
  });
});
