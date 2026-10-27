import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicShells, type ShellName } from '@internal/publish-surface/shells';
import { installShells, type PackedShell, packShell } from '@repo/tsdown/shell-testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const facade = '@prisma/orm-postgres';
const toolchain = '@prisma/orm-toolchain';
const platform: ShellName[] = [
  '@prisma/orm-framework',
  '@prisma/orm-toolchain',
  '@prisma/orm-family-sql',
  '@prisma/orm-target-postgres',
];

const cliEngineVersion = (
  JSON.parse(
    readFileSync(join(repoRoot, 'packages/9-public/@prisma/orm-toolchain/package.json'), 'utf8'),
  ) as { peerDependencies: { '@prisma/cli-engine': string } }
).peerDependencies['@prisma/cli-engine'];

const SCHEMA = `// use prisma-8

model User {
  id     Int     @id
  active Boolean @default(false)
}
`;

const CONFIG = `import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig } from '${facade}/config';

export default definePrismaConfig({
  orm: defineConfig({ contract: './schema.prisma', output: 'generated' }),
});
`;

const CLI = `import process from 'node:process';
import { runOrmCli } from '${toolchain}/cli/standalone';

process.exitCode = await runOrmCli(process);
process.stdin.unref?.();
`;

interface EmitResult {
  readonly exitCode: number | null;
  readonly envelope: {
    readonly ok: boolean;
    readonly error?: { readonly code: string; readonly why?: string };
  };
}

function pack(scratch: string, names: readonly ShellName[]): PackedShell[] {
  return names.map((name) => {
    const shell = publicShells.get(name);
    if (shell === undefined) throw new Error(`unknown shell ${name}`);
    return packShell(join(repoRoot, shell.dir), scratch);
  });
}

function emit(scratch: string): EmitResult {
  const run = spawnSync(process.execPath, ['cli.mjs', 'contract', 'emit', '--json', '--no-color'], {
    cwd: scratch,
    encoding: 'utf8',
  });
  const lines = run.stdout.trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1] ?? '{}') as { envelope: EmitResult['envelope'] };
  return { exitCode: run.status, envelope: last.envelope };
}

/** The `@prisma/orm-framework` folder that `fromPackage`, installed in the scratch project, imports. */
function frameworkSeenBy(scratch: string, fromPackage: string): string {
  const packageDir = realpathSync(join(scratch, 'node_modules', fromPackage));
  return realpathSync(join(dirname(packageDir), 'orm-framework'));
}

/**
 * Gives the toolchain its own copy of `@prisma/orm-framework`, the way npm
 * nests a second copy under the package that needs it: the framework's pnpm
 * folder is copied beside the original, and the toolchain's link to the
 * framework is pointed at the copy. Returns the copy's folder.
 */
function nestSecondFrameworkUnderToolchain(scratch: string): string {
  const original = frameworkSeenBy(scratch, toolchain);
  const originalStoreDir = join(original, '..', '..', '..');
  const copyStoreDir = `${originalStoreDir}-second-copy`;
  cpSync(originalStoreDir, copyStoreDir, { recursive: true, verbatimSymlinks: true });
  const copy = join(copyStoreDir, relative(originalStoreDir, original));
  const toolchainLink = join(
    dirname(realpathSync(join(scratch, 'node_modules', toolchain))),
    'orm-framework',
  );
  rmSync(toolchainLink);
  symlinkSync(relative(dirname(toolchainLink), copy), toolchainLink);
  return copy;
}

describe('a project whose prisma CLI and database package load different framework folders', () => {
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'orm-two-framework-copies-'));
    installShells(scratch, pack(scratch, [facade, ...platform]), {
      direct: [facade, toolchain],
      registryDependencies: { '@prisma/cli-engine': cliEngineVersion },
    });
    writeFileSync(join(scratch, 'schema.prisma'), SCHEMA);
    writeFileSync(join(scratch, 'prisma.config.ts'), CONFIG);
    writeFileSync(join(scratch, 'cli.mjs'), CLI);
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('emits the contract while both load one copy', () => {
    expect(frameworkSeenBy(scratch, toolchain)).toBe(frameworkSeenBy(scratch, facade));
    const result = emit(scratch);
    expect(result.envelope.ok, JSON.stringify(result.envelope)).toBe(true);
    expect(result.exitCode).toBe(0);
    const contract = JSON.parse(readFileSync(join(scratch, 'generated', 'contract.json'), 'utf8'));
    expect(contract.storage.storageHash).toEqual(expect.any(String));
  });

  it('refuses to emit once the CLI loads a second copy, naming both folders', () => {
    const second = nestSecondFrameworkUnderToolchain(scratch);
    const first = frameworkSeenBy(scratch, facade);
    expect(frameworkSeenBy(scratch, toolchain)).toBe(second);

    const result = emit(scratch);
    expect(result.exitCode).not.toBe(0);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.error?.code).toBe('RUNTIME.MULTIPLE_ORM_COPIES');
    expect(result.envelope.error?.why).toContain(first);
    expect(result.envelope.error?.why).toContain(second);
  });
});
