import type { DocsLintConfig } from "../config.ts";
import { countBodyChars, stripFrontMatter } from "./count.ts";

type Doc = {
  /** リポジトリルートからの相対パス */
  path: string;
  source: string;
};

export type OversizedDoc = { chars: number; max: number; path: string };

/** 文書に掛かる文字数の上限。charLimit.overrides の先に書いたものが優先し、当てはまらなければ上限なし */
export const findCharLimit = (
  path: string,
  { charLimit }: DocsLintConfig,
): number | undefined =>
  charLimit.overrides.find(({ dir }) => path.startsWith(dir))?.max;

/** front matter を除いた本文の文字数が上限を超える文書を、パス・文字数・上限の組で返す */
export const findOversizedDocs = (
  docs: Doc[],
  config: DocsLintConfig,
): OversizedDoc[] =>
  docs.flatMap(({ path, source }) => {
    const max = findCharLimit(path, config);
    if (max === undefined) {
      return [];
    }
    const chars = countBodyChars(stripFrontMatter(source));
    return chars > max ? [{ chars, max, path }] : [];
  });

/** 上限を超えた文書ごとに「パス: 文字数 / 上限」の行を作る */
export const formatOversizedDoc = ({ chars, max, path }: OversizedDoc) =>
  `${path}: 本文が ${chars} 字あり、上限の ${max} 字を超えています`;
