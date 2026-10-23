// Markdown 文書を textlint・markdownlint・本文の文字数上限で検査する CLI。
// textlint のプロファイル（preset の組み合わせ）と markdownlint のルールはこのパッケージが持つ。
// どのディレクトリをどのプロファイルで検査するか・どのディレクトリに何字の上限を掛けるかは
// リポジトリルートの docs-lint.config.json で決める。
// textlint は既存文書の違反を段階的に直すため、既定では変更で追加・書き換えた行に掛かる指摘だけを報告する。
// markdownlint と文字数は変更行ではなく、対象の文書全体を検査する（文字数は front matter を除く本文で数える）。
// 除外は .textlintignore と .markdownlint-cli2.jsonc の ignores に書く。

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createLinter, loadLinterFormatter, loadTextlintrc } from "textlint";
import {
  findCharLimit,
  findOversizedDocs,
  formatOversizedDoc,
} from "./char-limit/limit.ts";
import {
  type DocsLintConfig,
  groupByTextlintProfile,
  loadConfig,
} from "./config.ts";
import { isDocPath, selectChangedDocs, selectFixTargets } from "./docs.ts";
import {
  mergeUntrackedChanges,
  parseAddedLines,
  parseGitNameStatus,
} from "./git.ts";
import { runMarkdownlint } from "./markdownlint/run.ts";
import {
  presetModulesDir,
  type TextlintProfile,
  textlintrcPath,
} from "./textlint/profiles.ts";
import { filterToAddedLines, summarizeFixResults } from "./textlint/results.ts";

const USAGE = `Usage: docs-lint [options] [file...]

  docs-lint                  比較元との merge-base から作業ツリー（未コミット・未追跡含む）までに変更した文書を検査する
                             （textlint は追加・書き換えた行、markdownlint と文字数は文書全体）
  docs-lint <file...>        指定した文書のうち、変更した文書を検査する
  docs-lint --all [file...]  変更の有無によらず全行を検査する（既存違反の棚卸し・修正用）
  docs-lint --fix <file...>  指定した文書の自動修正できる指摘を全行直して書き込み、残る指摘を表示する

Options:
  --base=<ref>     比較元（既定は docs-lint.config.json の base、無ければ origin/main）
  --config=<path>  設定ファイル（既定は docs-lint.config.json）
  -h, --help       この使い方を表示する`;

const FLAGS = ["--all", "--fix", "--help", "-h"];

const VALUE_OPTIONS = ["base", "config"];

type Context = {
  config: DocsLintConfig;
  /** 引数で指定した文書（root からの相対パス） */
  files: string[];
  fix: boolean;
  root: string;
};

const parseOption = (args: string[], name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const isKnownOption = (arg: string) =>
  FLAGS.includes(arg) ||
  VALUE_OPTIONS.some((name) => arg.startsWith(`--${name}=`));

const git = ({ root }: Context, gitArgs: string[]) =>
  execFileSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

/** 比較元と HEAD の merge-base。解決できなければ undefined */
const resolveBase = (context: Context, ref: string) => {
  try {
    return git(context, ["merge-base", ref, "HEAD"]).trim();
  } catch {
    console.error(
      `❌ ${ref} との merge-base を解決できません。比較元を fetch するか --base を指定してください`,
    );
    return undefined;
  }
};

const listUntracked = (context: Context) =>
  git(context, ["ls-files", "--others", "--exclude-standard"]).split("\n");

const listAllDocs = (context: Context) =>
  [...git(context, ["ls-files"]).split("\n"), ...listUntracked(context)].filter(
    isDocPath,
  );

/** 変更行モードの対象と追加行。未追跡の文書は addedLines に載らず全行が対象になる */
const collectChanges = (context: Context, base: string) => {
  const { files } = context;
  const untracked = listUntracked(context);
  const changes = mergeUntrackedChanges(
    parseGitNameStatus(
      git(context, ["diff", "--name-status", "--find-renames", base]),
    ),
    untracked,
  );
  const changed = selectChangedDocs(changes);
  const targets =
    files.length > 0 ? changed.filter((path) => files.includes(path)) : changed;
  const tracked = targets.filter((path) => !untracked.includes(path));
  const addedLines =
    tracked.length > 0
      ? parseAddedLines(
          git(context, [
            "diff",
            "--unified=0",
            "--find-renames",
            base,
            "--",
            // rename を検出させるため、移動元のパスも pathspec に含める
            ...changes
              .filter(({ path }) => tracked.includes(path))
              .flatMap(({ path, previousPath }) =>
                previousPath ? [previousPath, path] : [path],
              ),
          ]),
          tracked,
        )
      : new Map<string, Set<number>>();
  return { addedLines, targets };
};

const linterFor = async ({ root }: Context, profile: TextlintProfile) =>
  createLinter({
    cwd: root,
    descriptor: await loadTextlintrc({
      configFilePath: textlintrcPath(profile),
      node_modulesDir: presetModulesDir(),
    }),
    ignoreFilePath: resolve(root, ".textlintignore"),
  });

/** 文書をプロファイルごとに分け、それぞれのプロファイルの linter で処理する */
const runPerProfile = async <Result>(
  context: Context,
  targets: string[],
  run: (
    linter: Awaited<ReturnType<typeof linterFor>>,
    filePaths: string[],
  ) => Promise<Result[]>,
): Promise<Result[]> => {
  const groups = await Promise.all(
    [...groupByTextlintProfile(targets, context.config)].map(
      async ([profile, paths]) =>
        run(
          await linterFor(context, profile),
          paths.map((path) => resolve(context.root, path)),
        ),
    ),
  );
  return groups.flat();
};

/** markdownlint の結果を表示し、終了コードを返す */
const reportMarkdownlint = (
  { fix }: Context,
  { code, findings }: Awaited<ReturnType<typeof runMarkdownlint>>,
) => {
  if (code === 0) {
    console.log(
      fix
        ? "✅ 修正後に残る markdownlint の指摘はありません"
        : "✅ markdownlint の指摘はありません",
    );
    return 0;
  }
  for (const finding of findings) {
    console.log(finding);
  }
  console.log(
    fix
      ? "❌ markdownlint の自動修正できない指摘が残っています。手で直してください"
      : "❌ markdownlint の指摘があります。自動修正できるものは docs-lint --fix <file> で直せます",
  );
  return code;
};

/** 指定した文書の自動修正を書き込み、残る指摘を表示する */
const runFix = async (context: Context) => {
  const { root } = context;
  const targets = selectFixTargets(context.files);
  if (targets.length === 0) {
    console.error("❌ --fix には修正する .md 文書を指定してください");
    return 2;
  }
  // textlint の修正は markdownlint の修正後の文書に掛ける（同じ文書を並行して書き換えない）
  console.log(`markdownlint: ${targets.length} 文書の自動修正を適用します`);
  const markdownlintCode = reportMarkdownlint(
    context,
    await runMarkdownlint({ fix: true, paths: targets, root }),
  );
  console.log(`textlint: ${targets.length} 文書の自動修正を適用します`);
  const { applied, writes } = summarizeFixResults(
    await runPerProfile(context, targets, (linter, filePaths) =>
      linter.fixFiles(filePaths),
    ),
  );
  await Promise.all(
    writes.map(({ filePath, output }) => writeFile(filePath, output)),
  );
  console.log(
    `${applied} 件を自動修正し、${writes.length} 文書を書き換えました`,
  );

  // fixFiles は自動修正できるルールしか実行しないため、残る指摘は書き込み後の文書を検査し直して求める
  const remaining = await runPerProfile(context, targets, (linter, filePaths) =>
    linter.lintFiles(filePaths),
  );
  const count = remaining.reduce(
    (sum, { messages }) => sum + messages.length,
    0,
  );
  if (count === 0) {
    console.log("✅ 修正後に残る textlint の指摘はありません");
    return markdownlintCode;
  }
  const formatter = await loadLinterFormatter({ formatterName: "stylish" });
  console.log(formatter.format(remaining));
  console.log(
    "❌ textlint の自動修正できない指摘が残っています。手で直してください",
  );
  return Math.max(markdownlintCode, 1);
};

/** 対象の文書を textlint で検査し、addedLines があれば変更行の指摘だけを報告する */
const runTextlint = async (
  context: Context,
  targets: string[],
  addedLines: Map<string, Set<number>>,
  all: boolean,
) => {
  const results = filterToAddedLines(
    await runPerProfile(context, targets, (linter, filePaths) =>
      linter.lintFiles(filePaths),
    ),
    addedLines,
    (filePath) => relative(context.root, filePath),
  );
  const count = results.reduce((sum, { messages }) => sum + messages.length, 0);
  if (count === 0) {
    console.log("✅ textlint の指摘はありません");
    return 0;
  }

  const formatter = await loadLinterFormatter({ formatterName: "stylish" });
  console.log(formatter.format(results));
  console.log(
    all
      ? "❌ textlint の指摘があります"
      : "❌ 変更した行に textlint の指摘があります。文書全体を確認するには docs-lint --all <file>",
  );
  return 1;
};

/** 上限のある文書の本文の文字数を数え、上限を超えた文書を表示する（docs-lint.config.json の charLimit） */
const runCharLimit = async ({ config, root }: Context, targets: string[]) => {
  const limited = targets.filter(
    (path) => findCharLimit(path, config) !== undefined,
  );
  if (limited.length === 0) {
    return 0;
  }
  console.log(`文字数: 上限のある ${limited.length} 文書の本文を数えます`);
  const docs = await Promise.all(
    limited.map(async (path) => ({
      path,
      source: await readFile(resolve(root, path), "utf8"),
    })),
  );
  const oversized = findOversizedDocs(docs, config);
  if (oversized.length === 0) {
    console.log("✅ 本文の文字数は上限内です");
    return 0;
  }
  for (const doc of oversized) {
    console.error(`❌ ${formatOversizedDoc(doc)}`);
  }
  return 1;
};

/** 対象の文書と、変更行モードなら比較元と追加行。比較元を解決できなければ undefined */
const selectTargets = (context: Context, all: boolean, baseRef: string) => {
  if (all) {
    return {
      addedLines: new Map<string, Set<number>>(),
      base: undefined,
      targets: context.files.length > 0 ? context.files : listAllDocs(context),
    };
  }
  const base = resolveBase(context, baseRef);
  return base === undefined
    ? undefined
    : { base, ...collectChanges(context, base) };
};

const runCheck = async (context: Context, all: boolean, baseRef: string) => {
  const selected = selectTargets(context, all, baseRef);
  if (selected === undefined) {
    return 2;
  }
  const { addedLines, base, targets } = selected;
  console.log(
    base === undefined
      ? `${targets.length} 文書の全行を検査します（.textlintignore と .markdownlint-cli2.jsonc の除外は除く）`
      : `比較元 ${base.slice(0, 12)} から変更した ${targets.length} 文書を検査します（textlint は追加・書き換えた行、markdownlint と文字数は文書全体）`,
  );
  if (targets.length === 0) {
    console.log("✅ 検査対象の文書がありません");
    return 0;
  }

  const textlintCode = await runTextlint(context, targets, addedLines, all);
  // 文書全体に掛かるルール（見出しの重複など）を取りこぼさないよう、markdownlint は全行を検査する
  const markdownlintCode = reportMarkdownlint(
    context,
    await runMarkdownlint({ fix: false, paths: targets, root: context.root }),
  );
  const charLimitCode = await runCharLimit(context, targets);
  return Math.max(textlintCode, markdownlintCode, charLimitCode);
};

const tryLoadConfig = (root: string, path: string | undefined) => {
  try {
    return loadConfig(root, path);
  } catch (error) {
    console.error(
      `❌ ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
};

/**
 * docs-lint の CLI を実行し、終了コードを返す。
 * 指摘が無ければ 0、指摘があれば 1、引数・設定・比較元の誤りで実行できなければ 2。
 * @param args コマンドライン引数（node とスクリプトのパスを除いたもの）
 * @param root リポジトリのルート。文書のパス・設定ファイル・除外ファイルはここから解決する
 */
export const runCli = async ({
  args,
  root,
}: {
  args: string[];
  root: string;
}): Promise<number> => {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const unknown = args.filter(
    (arg) => arg.startsWith("-") && !isKnownOption(arg),
  );
  if (unknown.length > 0) {
    console.error(`❌ 不明なオプションです: ${unknown.join(" ")}\n\n${USAGE}`);
    return 2;
  }
  const config = tryLoadConfig(root, parseOption(args, "config"));
  if (config === undefined) {
    return 2;
  }
  const context: Context = {
    config,
    // ./docs/x.md や絶対パスでも変更一覧（リポジトリルートからの相対パス）と照合できるようにそろえる
    files: args
      .filter((arg) => !arg.startsWith("-"))
      .filter(isDocPath)
      .map((arg) => relative(root, resolve(root, arg))),
    fix: args.includes("--fix"),
    root,
  };
  if (context.fix) {
    return runFix(context);
  }
  return runCheck(
    context,
    args.includes("--all"),
    parseOption(args, "base") ?? config.base,
  );
};
