import { main } from "markdownlint-cli2";

export type MarkdownlintResult = {
  /** 指摘が無ければ 0、あれば 1、実行に失敗すれば 2 */
  code: number;
  /** markdownlint-cli2 の既定の形式（`path:line[:column] ルール 説明`）の指摘 */
  findings: string[];
};

/**
 * 文書を markdownlint で検査する。ルールと除外は root の .markdownlint-cli2.jsonc から読む。
 * 文書は 1 件ずつパスとして渡し、グロブとして解釈させない（`(home)` のような括弧を含むパスがあるため）。
 * @param paths root からの相対パス。空なら検査しない
 * @param fix 自動修正できる指摘を書き込み、残る指摘だけを返す
 */
export const runMarkdownlint = async ({
  fix,
  paths,
  root,
}: {
  fix: boolean;
  paths: string[];
  root: string;
}): Promise<MarkdownlintResult> => {
  if (paths.length === 0) {
    return { code: 0, findings: [] };
  }
  const findings: string[] = [];
  const code = await main({
    argv: [...(fix ? ["--fix"] : []), ...paths.map((path) => `:${path}`)],
    directory: root,
    logError: (message) => findings.push(message),
    // バナー・進捗・集計は表示しない（件数は呼び出し側が findings から表示する）
    logMessage: () => {},
  });
  return { code, findings };
};
