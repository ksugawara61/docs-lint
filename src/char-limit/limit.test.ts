import { describe, expect, it } from "vitest";
import { parseConfig } from "../config.ts";
import { findOversizedDocs } from "./limit.ts";

const config = parseConfig({
  charLimit: {
    overrides: [
      { dir: "posts/long/", max: 20 },
      { dir: "posts/", max: 10 },
    ],
  },
});

const doc = (path: string, chars: number) => ({
  path,
  source: `---\ntitle: 題名\n---\n\n${"あ".repeat(chars)}\n`,
});

describe("findOversizedDocs", () => {
  it.each([
    {
      docs: [doc("posts/a.md", 10), doc("posts/b.md", 11)],
      expected: [{ chars: 11, max: 10, path: "posts/b.md" }],
      name: "front matter を除いた本文が上限を超える文書だけを、パス・文字数・上限で返す",
    },
    {
      docs: [doc("posts/long/a.md", 15)],
      expected: [],
      name: "複数の overrides に当てはまる文書は、先に書いた上限で判定する",
    },
    {
      docs: [doc("docs/a.md", 100)],
      expected: [],
      name: "どの overrides にも当てはまらない文書には上限を掛けない",
    },
  ])("$name", ({ docs, expected }) => {
    expect(findOversizedDocs(docs, config)).toEqual(expected);
  });
});
