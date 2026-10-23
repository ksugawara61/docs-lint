#!/usr/bin/env node
// カレントディレクトリをリポジトリのルートとして docs-lint を実行する。使い方は docs-lint --help

import { argv, cwd, exit } from "node:process";
import { runCli } from "../cli.ts";

exit(await runCli({ args: argv.slice(2), root: cwd() }));
