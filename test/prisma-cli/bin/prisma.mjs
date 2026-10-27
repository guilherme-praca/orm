#!/usr/bin/env node
import process from 'node:process';
import { runOrmCli } from '@prisma/orm-toolchain/cli/standalone';

process.exitCode = await runOrmCli(process);

// `lsp` leaves stdin referenced; release it so the process exits on the code above.
process.stdin.unref?.();
