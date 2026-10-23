import { describe, expect, it } from "vitest";
import { filterToAddedLines, summarizeFixResults } from "./results.ts";

const message = (start: number, end = start) => ({
  line: start,
  loc: { end: { line: end }, start: { line: start } },
  ruleId: "rule",
});

const toRelative = (filePath: string) => filePath.replace("/repo/", "");

describe("filterToAddedLines", () => {
  it.each([
    {
      addedLines: new Map([["docs/setup.md", new Set([5])]]),
      expected: [message(5)],
      messages: [message(2), message(5)],
      name: "追加行に掛かる指摘だけを残し、触れていない行の既存違反は除く",
    },
    {
      addedLines: new Map([["docs/setup.md", new Set([6])]]),
      expected: [message(3, 6)],
      messages: [message(3, 6)],
      name: "複数行にまたがる指摘は、範囲のどこかが追加行なら残す",
    },
    {
      addedLines: new Map<string, Set<number>>(),
      expected: [message(1), message(9)],
      messages: [message(1), message(9)],
      name: "diff に現れない文書（未追跡の新規文書）は全行の指摘を残す",
    },
    {
      addedLines: new Map([["docs/setup.md", new Set<number>()]]),
      expected: [],
      messages: [message(1)],
      name: "rename だけの文書は追加行が空なので指摘を残さない",
    },
  ])("$name", ({ addedLines, expected, messages }) => {
    const [result] = filterToAddedLines(
      [{ filePath: "/repo/docs/setup.md", messages }],
      addedLines,
      toRelative,
    );

    expect(result?.messages).toEqual(expected);
  });
});

describe("summarizeFixResults", () => {
  const fixed = {
    applyingMessages: [{ ruleId: "a" }, { ruleId: "b" }],
    filePath: "/repo/a.md",
    output: "直した",
  };
  const untouched = {
    applyingMessages: [],
    filePath: "/repo/b.md",
    output: "そのまま",
  };

  it("修正を適用した文書だけを書き込み対象にし、適用件数を数える", () => {
    const { applied, writes } = summarizeFixResults([fixed, untouched]);

    expect(applied).toBe(2);
    expect(writes).toEqual([{ filePath: "/repo/a.md", output: "直した" }]);
  });
});
