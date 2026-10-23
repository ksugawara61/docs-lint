import type { GitChange } from "./git.ts";

/** 検査する文書。生成物などの除外は .textlintignore と .markdownlint-cli2.jsonc の ignores が持つ */
const DOC_PATTERN = /\.md$/;

export const isDocPath = (path: string): boolean => DOC_PATTERN.test(path);

/** 変更一覧から検査対象の文書を選ぶ。削除された文書は対象にしない */
export const selectChangedDocs = (changes: GitChange[]): string[] => [
  ...new Set(
    changes
      .filter(({ path, status }) => status !== "D" && isDocPath(path))
      .map(({ path }) => path),
  ),
];

/**
 * `--fix` が自動修正を書き込む文書。変更行の判定は修正前の diff に基づくため、
 * 修正で行番号がずれる。そこで `--fix` は変更の有無によらず、明示した文書だけを全行修正する。
 * 文書を指定しない `--fix` は、意図しない文書まで書き換えないよう対象なしとして扱う。
 * @param files 引数で明示された文書（リポジトリルートからの相対パス）
 */
export const selectFixTargets = (files: string[]): string[] => [
  ...new Set(files),
];
