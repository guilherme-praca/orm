import { runtimeError } from './runtime-error';

/** One copy of the framework: the package folder it was loaded from, and that package's version when it could be read. */
export interface FrameworkCopy {
  readonly folder: string;
  readonly version?: string;
}

interface FileReader {
  readFileSync(path: URL, encoding: 'utf-8'): string;
}

interface FileUrlConverter {
  fileURLToPath(url: URL): string;
}

const frameworkCopiesKey = Symbol.for('prisma.orm.frameworkCopies');

function frameworkCopies(): Set<string> {
  const existing: unknown = Reflect.get(globalThis, frameworkCopiesKey);
  if (existing instanceof Set) {
    return existing;
  }
  const created = new Set<string>();
  Object.defineProperty(globalThis, frameworkCopiesKey, { value: created });
  return created;
}

frameworkCopies().add(import.meta.url);

function withoutQueryOrHash(url: string): URL {
  const location = new URL(url);
  location.search = '';
  location.hash = '';
  return location;
}

function displayedPath(location: URL): string {
  const path = location.protocol === 'file:' ? nodeUrl()?.fileURLToPath(location) : undefined;
  return (path ?? location.href).replace(/[/\\]$/, '');
}

function nodeFs(): FileReader | undefined {
  return globalThis.process?.getBuiltinModule?.('node:fs');
}

function nodeUrl(): FileUrlConverter | undefined {
  return globalThis.process?.getBuiltinModule?.('node:url');
}

function packageVersionAt(fs: FileReader, folder: URL): string | undefined {
  try {
    const manifest: unknown = JSON.parse(fs.readFileSync(new URL('package.json', folder), 'utf-8'));
    const version: unknown =
      typeof manifest === 'object' && manifest !== null
        ? Reflect.get(manifest, 'version')
        : undefined;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

function describeCopy(url: string): FrameworkCopy {
  const moduleFolder = new URL('.', withoutQueryOrHash(url));
  const fs = moduleFolder.protocol === 'file:' ? nodeFs() : undefined;
  if (fs !== undefined) {
    for (let folder = moduleFolder; ; folder = new URL('..', folder)) {
      const version = packageVersionAt(fs, folder);
      if (version !== undefined) {
        return { folder: displayedPath(folder), version };
      }
      if (new URL('..', folder).href === folder.href) {
        break;
      }
    }
  }
  return { folder: displayedPath(moduleFolder) };
}

function copyLine(copy: FrameworkCopy, versionWidth: number): string {
  return `  ${(copy.version ?? '').padEnd(versionWidth)}  ${copy.folder}`;
}

/** Throws `RUNTIME.MULTIPLE_ORM_COPIES` when the framework has been loaded from more than one module URL. */
export function assertOneFrameworkCopy(): void {
  const urls = frameworkCopies();
  if (urls.size <= 1) {
    return;
  }
  const copies = [...urls].map(describeCopy);
  const versionWidth = Math.max(...copies.map((copy) => copy.version?.length ?? 0));
  throw Object.assign(
    runtimeError(
      'RUNTIME.MULTIPLE_ORM_COPIES',
      `Prisma ORM is loaded from ${copies.length} copies`,
      {
        copies,
      },
    ),
    {
      why: [
        'Values and registries made by one copy are not recognised by another, so every @prisma/orm-* package and the prisma CLI must use one version.',
        ...copies.map((copy) => copyLine(copy, versionWidth)),
      ].join('\n'),
      fix: 'Install the same version of every @prisma/orm-* package, and a prisma CLI that runs that version. `npm ls @prisma/orm-framework`, `pnpm why @prisma/orm-framework` or `bun why @prisma/orm-framework` shows which package brought each copy.',
    },
  );
}
