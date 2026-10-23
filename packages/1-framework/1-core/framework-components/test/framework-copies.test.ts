import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateControlStackInput } from '../src/control/control-stack';
import { createControlStack } from '../src/control/control-stack';
import type {
  RuntimeAdapterDescriptor,
  RuntimeTargetDescriptor,
} from '../src/execution/execution-descriptors';
import { createExecutionStack } from '../src/execution/execution-stack';
import { assertOneFrameworkCopy } from '../src/shared/framework-copies';

const packageRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const packageVersion: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version;
const copyFolder = realpathSync(mkdtempSync(join(tmpdir(), 'framework-copy-')));

function recordedCopies(): Set<string> {
  const record: unknown = Reflect.get(globalThis, Symbol.for('prisma.orm.frameworkCopies'));
  if (!(record instanceof Set)) {
    throw new Error('The framework copies record is missing');
  }
  return record;
}

async function loadSecondCopy(): Promise<void> {
  await import(/* @vite-ignore */ pathToFileURL(join(copyFolder, 'framework-copies.ts')).href);
}

const twoCopies = {
  code: 'RUNTIME.MULTIPLE_ORM_COPIES',
  category: 'RUNTIME',
  severity: 'error',
  details: {
    copies: [{ folder: packageRoot, version: packageVersion }, { folder: copyFolder }],
  },
};

const target: RuntimeTargetDescriptor<'sql', 'postgres'> = {
  kind: 'target',
  id: 'postgres',
  familyId: 'sql',
  targetId: 'postgres',
  version: '0.0.1',
  create: () => ({ familyId: 'sql', targetId: 'postgres' }),
};

const adapter: RuntimeAdapterDescriptor<'sql', 'postgres'> = {
  kind: 'adapter',
  id: 'postgres-adapter',
  familyId: 'sql',
  targetId: 'postgres',
  version: '0.0.1',
  create: () => ({ familyId: 'sql', targetId: 'postgres' }),
};

describe('framework copies', () => {
  let saved: string[] = [];

  beforeAll(() => {
    for (const file of ['framework-copies.ts', 'runtime-error.ts']) {
      copyFileSync(new URL(`../src/shared/${file}`, import.meta.url), join(copyFolder, file));
    }
  });

  afterAll(() => {
    rmSync(copyFolder, { recursive: true, force: true });
  });

  beforeEach(() => {
    saved = [...recordedCopies()];
  });

  afterEach(() => {
    const record = recordedCopies();
    record.clear();
    for (const url of saved) {
      record.add(url);
    }
    vi.resetModules();
  });

  it('passes with one copy', () => {
    expect(recordedCopies().size).toBe(1);
    expect(() => assertOneFrameworkCopy()).not.toThrow();
  });

  it('counts a module evaluated again from the same URL once', async () => {
    await loadSecondCopy();
    vi.resetModules();
    await loadSecondCopy();

    expect(recordedCopies().size).toBe(2);
  });

  describe('with a second copy loaded', () => {
    beforeEach(async () => {
      await loadSecondCopy();
    });

    it('refuses with every copy listed', () => {
      expect(() => assertOneFrameworkCopy()).toThrow(
        expect.objectContaining({
          ...twoCopies,
          message: 'Prisma ORM is loaded from 2 copies',
        }),
      );
    });

    it('refuses to create an execution stack', () => {
      expect(() => createExecutionStack({ target, adapter })).toThrow(
        expect.objectContaining(twoCopies),
      );
    });

    it('refuses to create a control stack', () => {
      expect(() =>
        createControlStack({
          family: { kind: 'family', id: 'sql', version: '0.0.1' },
          target: { kind: 'target', id: 'postgres', version: '0.0.1' },
          adapter: { kind: 'adapter', id: 'postgres-adapter', version: '0.0.1' },
        } as unknown as CreateControlStackInput),
      ).toThrow(expect.objectContaining(twoCopies));
    });

    it('explains the cause and the fix', () => {
      expect(() => assertOneFrameworkCopy()).toThrow(
        expect.objectContaining({
          why: expect.stringContaining(`${packageVersion}  ${packageRoot}\n`),
          fix: expect.stringContaining('npm ls @prisma/orm-framework'),
        }),
      );
    });
  });
});
