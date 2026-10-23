/** `git diff --name-status` の 1 行。rename / copy は移動元を previousPath に持つ */
export type GitChange = {
  path: string;
  previousPath?: string;
  status: string;
};

/** `git diff --name-status` の出力を変更一覧にする */
export const parseGitNameStatus = (output: string): GitChange[] =>
  output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status = "", firstPath = "", secondPath = ""] = line.split("\t");
      if (status.startsWith("R") || status.startsWith("C")) {
        return { path: secondPath, previousPath: firstPath, status };
      }
      return { path: firstPath, status };
    });

/** 未追跡のファイルを、追加（A）として変更一覧に足す */
export const mergeUntrackedChanges = (
  changes: GitChange[],
  untrackedPaths: string[],
): GitChange[] => {
  const known = new Set(changes.map(({ path }) => path));
  return [
    ...changes,
    ...untrackedPaths
      .filter((path) => path && !known.has(path))
      .map((path) => ({ path, status: "A" })),
  ];
};

/** `+++ b/<path>` 行の変更後のパス。削除されたファイルは `+++ /dev/null` で undefined */
const toTargetPath = (line: string): string | undefined => {
  const target = line.slice(4);
  return target === "/dev/null" ? undefined : target.replace(/^b\//, "");
};

/** `@@ -a,b +c,d @@` の hunk が変更後のファイルに持つ行番号。d が 0 なら削除だけの hunk */
const hunkLines = (line: string): number[] | undefined => {
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!hunk) {
    return undefined;
  }
  const start = Number(hunk[1]);
  const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
  return Array.from({ length: count }, (_, offset) => start + offset);
};

type AddedLinesState = {
  added: Map<string, Set<number>>;
  current: string | undefined;
};

/** diff の 1 行を読み、`+++` ならファイルを切り替え、hunk なら追加行を足す */
const readDiffLine = (
  { added, current }: AddedLinesState,
  line: string,
): AddedLinesState => {
  if (line.startsWith("+++ ")) {
    const path = toTargetPath(line);
    if (path && !added.has(path)) {
      added.set(path, new Set());
    }
    return { added, current: path };
  }
  const lines = hunkLines(line);
  if (current && lines) {
    added.set(current, new Set([...(added.get(current) ?? []), ...lines]));
  }
  return { added, current };
};

/**
 * `git diff --unified=0` の出力から、変更後のファイルで追加・書き換えられた行番号を集める。
 * 内容の変わらない rename は diff に `+++` 行が出ないため、git が追跡する対象を
 * `trackedPaths` で空集合として先に登録しておく（登録しないと新規文書扱いで全行が対象になる）。
 * @param trackedPaths 比較元との diff に載る（未追跡ではない）対象の文書
 * @returns パス → 追加行の行番号（1 始まり）
 */
export const parseAddedLines = (
  diff: string,
  trackedPaths: string[] = [],
): Map<string, Set<number>> =>
  diff.split("\n").reduce(readDiffLine, {
    added: new Map(trackedPaths.map((path) => [path, new Set<number>()])),
    current: undefined,
  }).added;
