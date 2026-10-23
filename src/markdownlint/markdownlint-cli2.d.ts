// markdownlint-cli2 は型定義を同梱しないため、このパッケージが使う範囲だけを宣言する
declare module "markdownlint-cli2" {
  type Parameters = {
    /** 引数。先頭の : はグロブではなくファイルのパスとして扱う。--fix で自動修正を書き込む */
    argv?: string[];
    /** 設定ファイル（.markdownlint-cli2.jsonc）を探す起点 */
    directory?: string;
    /** 指摘の出力先 */
    logError?: (message: string) => void;
    /** バナー・進捗・集計の出力先 */
    logMessage?: (message: string) => void;
  };

  /** 指摘が無ければ 0、あれば 1、実行に失敗すれば 2 を返す */
  export const main: (params: Parameters) => Promise<number>;
}

declare module "markdownlint-cli2/parsers/jsonc" {
  const parse: (text: string) => unknown;
  export default parse;
}
