import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import { type DataTypeId, type DataTypeValue, requireValueOf } from '../src/shared/data-type';
import { assertOneFrameworkCopy, registerFrameworkCopy } from '../src/shared/framework-copies';

const packageRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const packageVersion: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version;
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'framework-copy-')));
const copyFolder = join(scratch, 'loose-copy');
const copyModule = join(copyFolder, 'framework-copies.ts');

function recordedCopies(): Set<string> {
  const record: unknown = Reflect.get(globalThis, Symbol.for('prisma.orm.frameworkCopies'));
  if (!(record instanceof Set)) {
    throw new Error('The framework copies record is missing');
  }
  return record;
}

async function loadSecondCopy(): Promise<void> {
  await import(/* @vite-ignore */ pathToFileURL(copyModule).href);
}

/** A package folder holding `manifest`, returning the file URL of a module inside its `dist`. */
function packageModule(folder: string, manifest: object, module: string): string {
  mkdirSync(join(scratch, folder, 'dist'), { recursive: true });
  writeFileSync(join(scratch, folder, 'package.json'), JSON.stringify(manifest));
  return pathToFileURL(join(scratch, folder, 'dist', module)).href;
}

function refusal(): unknown {
  try {
    assertOneFrameworkCopy();
  } catch (error) {
    return error;
  }
  throw new Error('assertOneFrameworkCopy did not throw');
}

const twoCopies = {
  code: 'RUNTIME.MULTIPLE_ORM_COPIES',
  category: 'RUNTIME',
  severity: 'error',
  details: {
    copies: [{ folder: packageRoot, version: packageVersion }, { folder: copyModule }],
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
    mkdirSync(copyFolder, { recursive: true });
    for (const file of ['framework-copies.ts', 'runtime-error.ts']) {
      copyFileSync(new URL(`../src/shared/${file}`, import.meta.url), join(copyFolder, file));
    }
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
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
    expect(() => assertOneFrameworkCopy()).not.toThrow();
  });

  it('counts the modules of one package folder as one copy', () => {
    registerFrameworkCopy(new URL('../src/shared/data-type.ts', import.meta.url).href);
    registerFrameworkCopy(new URL('../src/shared/codec.ts?t=1', import.meta.url).href);

    expect(() => assertOneFrameworkCopy()).not.toThrow();
  });

  it('counts two modules of another framework package folder as one more copy', () => {
    registerFrameworkCopy(
      packageModule('nested', { name: '@prisma/orm-framework', version: '8.0.0-rc.99' }, 'a.mjs'),
    );
    registerFrameworkCopy(
      packageModule('nested', { name: '@prisma/orm-framework', version: '8.0.0-rc.99' }, 'b.mjs'),
    );

    expect(refusal()).toMatchObject({
      message: `Prisma ORM is loaded from 2 copies (${packageVersion}, 8.0.0-rc.99)`,
      details: {
        copies: [
          { folder: packageRoot, version: packageVersion },
          { folder: join(scratch, 'nested'), version: '8.0.0-rc.99' },
        ],
      },
      meta: {
        copies: [
          { folder: packageRoot, version: packageVersion },
          { folder: join(scratch, 'nested'), version: '8.0.0-rc.99' },
        ],
      },
      fix: expect.stringContaining('Install the same version of every @prisma/orm-* package'),
    });
  });

  it("skips a manifest that is not the framework's, such as an application's", () => {
    const bundle = packageModule('app', { name: 'my-app', version: '1.4.2' }, 'server.mjs');
    registerFrameworkCopy(bundle);

    expect(refusal()).toMatchObject({
      message: `Prisma ORM is loaded from 2 copies (${packageVersion}, unknown version)`,
      details: {
        copies: [
          { folder: packageRoot, version: packageVersion },
          { folder: fileURLToPath(bundle) },
        ],
      },
    });
  });

  it('says to reinstall when every copy is one version', () => {
    registerFrameworkCopy(
      packageModule('same', { name: '@prisma/orm-framework', version: packageVersion }, 'a.mjs'),
    );

    const fix = Reflect.get(Object(refusal()), 'fix');
    expect(fix).toContain('deleting node_modules and the lockfile');
    expect(fix).not.toContain('Install the same version');
  });

  it('records nothing for a module without a URL', () => {
    registerFrameworkCopy(undefined);

    expect(() => assertOneFrameworkCopy()).not.toThrow();
  });

  it('names a module URL that does not parse instead of failing to describe it', () => {
    registerFrameworkCopy('not a url');

    expect(refusal()).toMatchObject({
      code: 'RUNTIME.MULTIPLE_ORM_COPIES',
      details: {
        copies: [{ folder: packageRoot, version: packageVersion }, { folder: 'not a url' }],
      },
    });
  });

  describe('a value no data type of this copy constructed', () => {
    const handedValue = () =>
      requireValueOf(
        'test/text' as DataTypeId,
        { type: 'test/text', params: {}, value: 'a' } as unknown as DataTypeValue,
        'Codec test/text@1',
      );

    it('is a bug in the caller when one copy is loaded', () => {
      expect(handedValue).toThrow('handed an object no data type constructed');
    });

    it('reports the copies when another copy is loaded', () => {
      registerFrameworkCopy('not a url');

      expect(handedValue).toThrow(expect.objectContaining({ code: 'RUNTIME.MULTIPLE_ORM_COPIES' }));
    });
  });

  it('counts a module evaluated again from the same URL once', async () => {
    await loadSecondCopy();
    const recorded = recordedCopies().size;
    vi.resetModules();
    await loadSecondCopy();

    expect(recordedCopies().size).toBe(recorded);
  });

  describe('with a second copy loaded', () => {
    beforeEach(async () => {
      await loadSecondCopy();
    });

    it('refuses with every copy listed', () => {
      expect(() => assertOneFrameworkCopy()).toThrow(
        expect.objectContaining({
          ...twoCopies,
          message: `Prisma ORM is loaded from 2 copies (${packageVersion}, unknown version)`,
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
          why: expect.stringContaining(
            `${String(packageVersion).padEnd('unknown version'.length)}  ${packageRoot}\n`,
          ),
          fix: expect.stringContaining('npm ls @prisma/orm-framework'),
        }),
      );
    });
  });
});
