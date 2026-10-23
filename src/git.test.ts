import { describe, expect, it } from "vitest";
import {
  mergeUntrackedChanges,
  parseAddedLines,
  parseGitNameStatus,
} from "./git.ts";

describe("parseGitNameStatus", () => {
  it.each([
    {
      expected: [
        { path: "docs/a.md", status: "M" },
        { path: "docs/new.md", previousPath: "docs/old.md", status: "R100" },
      ],
      name: "rename は移動先を path、移動元を previousPath にする",
      output: "M\tdocs/a.md\nR100\tdocs/old.md\tdocs/new.md\n",
    },
    { expected: [], name: "空の差分を空配列にする", output: "" },
  ])("$name", ({ expected, output }) => {
    expect(parseGitNameStatus(output)).toEqual(expected);
  });
});

describe("mergeUntrackedChanges", () => {
  it("未追跡のファイルを追加として足し、変更一覧にあるものと空行は足さない", () => {
    expect(
      mergeUntrackedChanges(
        [{ path: "docs/a.md", status: "M" }],
        ["docs/a.md", "docs/new.md", ""],
      ),
    ).toEqual([
      { path: "docs/a.md", status: "M" },
      { path: "docs/new.md", status: "A" },
    ]);
  });
});

describe("parseAddedLines", () => {
  it("unified=0 の hunk から変更後の追加行を集め、削除だけの hunk と削除ファイルは行を持たない", () => {
    const diff = [
      "diff --git a/docs/setup.md b/docs/setup.md",
      "--- a/docs/setup.md",
      "+++ b/docs/setup.md",
      "@@ -3 +3 @@",
      "-古い行",
      "+新しい行",
      "@@ -10,0 +11,2 @@",
      "+追加 1",
      "+追加 2",
      "@@ -20,2 +21,0 @@",
      "-削除 1",
      "-削除 2",
      "diff --git a/docs/new.md b/docs/new.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/docs/new.md",
      "@@ -0,0 +1,2 @@",
      "+# 新規",
      "+本文",
      "diff --git a/docs/gone.md b/docs/gone.md",
      "deleted file mode 100644",
      "--- a/docs/gone.md",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-消えた行",
    ].join("\n");

    expect(parseAddedLines(diff)).toEqual(
      new Map([
        ["docs/setup.md", new Set([3, 11, 12])],
        ["docs/new.md", new Set([1, 2])],
      ]),
    );
  });

  it("内容の変わらない rename は、追跡対象として登録した文書を追加行なしにする", () => {
    const diff = [
      "diff --git a/docs/a.md b/docs/b.md",
      "similarity index 100%",
      "rename from docs/a.md",
      "rename to docs/b.md",
    ].join("\n");

    expect(parseAddedLines(diff, ["docs/b.md"])).toEqual(
      new Map([["docs/b.md", new Set()]]),
    );
  });
});
