type LintMessage = {
  line: number;
  loc?: { end: { line: number }; start: { line: number } };
};

/** 指摘が掛かる行範囲。複数行にまたがる文の指摘はその全行を対象にする */
const messageLines = (message: LintMessage): number[] => {
  const start = message.loc?.start.line ?? message.line;
  const end = message.loc?.end.line ?? start;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

/**
 * textlint の結果を、変更で追加された行に掛かる指摘だけに絞る。
 * `addedLines` に無いファイル（未追跡の新規文書など）は全行が追加扱い。
 * @param addedLines リポジトリルートからの相対パス → 追加行
 */
export const filterToAddedLines = <
  Result extends { filePath: string; messages: LintMessage[] },
>(
  results: Result[],
  addedLines: Map<string, Set<number>>,
  toRelative: (filePath: string) => string,
): Result[] =>
  results.map((result) => {
    const lines = addedLines.get(toRelative(result.filePath));
    if (!lines) {
      return result;
    }
    return {
      ...result,
      messages: result.messages.filter((message) =>
        messageLines(message).some((line) => lines.has(line)),
      ),
    };
  });

type FixResult = {
  applyingMessages: unknown[];
  filePath: string;
  output: string;
};

/**
 * textlint の `fixFiles` の結果から、適用した修正の件数（applied）と書き込む文書（writes）を求める。
 * fixFiles は自動修正できるルールしか実行しないため、修正後に残る指摘は文書を検査し直して求める。
 */
export const summarizeFixResults = (fixResults: FixResult[]) => ({
  applied: fixResults.reduce(
    (sum, { applyingMessages }) => sum + applyingMessages.length,
    0,
  ),
  writes: fixResults
    .filter(({ applyingMessages }) => applyingMessages.length > 0)
    .map(({ filePath, output }) => ({ filePath, output })),
});
