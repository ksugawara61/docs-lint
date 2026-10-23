import { describe, expect, it } from "vitest";
import { countBodyChars, stripFrontMatter, toPlainText } from "./count.ts";

describe("toPlainText", () => {
  it("Markdown の記法とコードブロックを除いて 1 行にする", () => {
    const markdown = [
      "# 見出し",
      "",
      "**強調** と _斜体_ と `code` と [リンク](https://example.com)。",
      "",
      "```ts",
      "const hidden = 1;",
      "```",
      "",
      "- 項目",
      "1. 番号",
      "> 引用 snake_case_name",
    ].join("\n");
    expect(toPlainText(markdown)).toBe(
      "見出し 強調 と 斜体 と code と リンク。 項目 番号 引用 snake_case_name",
    );
  });
});

describe("countBodyChars", () => {
  it("サロゲートペアの文字も 1 字として数える", () => {
    expect(countBodyChars("𠮷野家🍣")).toBe(4);
  });
});

describe("stripFrontMatter", () => {
  it.each([
    {
      expected: "\n本文\n",
      name: "先頭の BOM と front matter を除いた本文を返す",
      source: "\uFEFF---\ntitle: 題\n---\n\n本文\n",
    },
    {
      expected: "# 見出し\n\n---\n",
      name: "front matter が無ければ全体を本文とする",
      source: "# 見出し\n\n---\n",
    },
  ])("$name", ({ expected, source }) => {
    expect(stripFrontMatter(source)).toBe(expected);
  });
});
