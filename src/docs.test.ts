import { describe, expect, it } from "vitest";
import { selectChangedDocs, selectFixTargets } from "./docs.ts";

describe("selectChangedDocs", () => {
  it("削除された文書を除き、rename 先の文書を対象にする", () => {
    expect(
      selectChangedDocs([
        { path: "docs/setup.md", status: "M" },
        { path: "docs/old.md", status: "D" },
        { path: "docs/new.md", previousPath: "docs/moved.md", status: "R" },
        { path: "docs/features/a/README.mdx", status: "M" },
        { path: "package.json", status: "M" },
      ]),
    ).toEqual(["docs/setup.md", "docs/new.md"]);
  });
});

describe("selectFixTargets", () => {
  it.each([
    {
      expected: ["a.md", "b.md"],
      files: ["a.md", "b.md", "a.md"],
      name: "明示した文書を重複なく返す",
    },
    { expected: [], files: [], name: "文書の指定がなければ対象なしにする" },
  ])("$name", ({ expected, files }) => {
    expect(selectFixTargets(files)).toEqual(expected);
  });
});
