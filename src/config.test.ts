import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groupByTextlintProfile, loadConfig, parseConfig } from "./config.ts";

describe("parseConfig", () => {
  it("省略した項目は、origin/main と比べ、全文書を technical で検査し文字数の上限を掛けない既定値になる", () => {
    expect(parseConfig({})).toEqual({
      base: "origin/main",
      charLimit: { overrides: [] },
      textlint: { overrides: [], profile: "technical" },
    });
  });

  it("overrides の dir は末尾に / を補い、別のディレクトリの前方一致を防ぐ", () => {
    expect(
      parseConfig({
        textlint: { overrides: [{ dir: "apps/blog/posts", profile: "blog" }] },
      }).textlint.overrides,
    ).toEqual([{ dir: "apps/blog/posts/", profile: "blog" }]);
  });

  it.each([
    [{ textlint: { profile: "novel" } }, /textlint\.profile/],
    [
      { textlint: { overrides: [{ dir: "a/", profile: "novel" }] } },
      /textlint\.overrides\[0\]\.profile/,
    ],
    [
      { textlint: { overrides: [{ profile: "blog" }] } },
      /textlint\.overrides\[0\]\.dir/,
    ],
    [{ textlint: { overrides: {} } }, /textlint\.overrides は配列/],
    [
      { charLimit: { overrides: [{ dir: "a/", max: 0 }] } },
      /charLimit\.overrides\[0\]\.max/,
    ],
    [
      { charLimit: { overrides: [{ max: 8000 }] } },
      /charLimit\.overrides\[0\]\.dir/,
    ],
    [{ base: "" }, /base は空でない文字列/],
    [{ textlint: [] }, /textlint はオブジェクト/],
    [
      { charLimit: { overrides: ["a/"] } },
      /charLimit\.overrides\[0\] はオブジェクト/,
    ],
    [[], /オブジェクトではありません/],
  ])("不正な設定 %j はどこが不正かを示して失敗する", (raw, message) => {
    expect(() => parseConfig(raw)).toThrow(message);
  });
});

describe("groupByTextlintProfile", () => {
  it("overrides の dir 配下はそのプロファイルに、それ以外は既定のプロファイルに振り分ける", () => {
    const config = parseConfig({
      textlint: {
        overrides: [{ dir: "apps/blog/posts/", profile: "blog" }],
        profile: "technical",
      },
    });

    expect(
      groupByTextlintProfile(
        [
          "docs/setup.md",
          "apps/blog/posts/hello-blog.md",
          "README.md",
          "apps/blog/mobile/README.md",
        ],
        config,
      ),
    ).toEqual(
      new Map([
        [
          "technical",
          ["docs/setup.md", "README.md", "apps/blog/mobile/README.md"],
        ],
        ["blog", ["apps/blog/posts/hello-blog.md"]],
      ]),
    );
  });
});

describe("loadConfig", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "docs-lint-config-"));
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("ルートの docs-lint.config.json を読む", async () => {
    await writeFile(
      join(root, "docs-lint.config.json"),
      JSON.stringify({ base: "origin/develop" }),
    );

    expect(loadConfig(root).base).toBe("origin/develop");
  });

  it("設定ファイルが無ければ既定値を返す", () => {
    expect(loadConfig(root)).toEqual(parseConfig({}));
  });

  it("パスを指定した設定ファイルを読み、不正な値はそのファイル名で示す", async () => {
    await writeFile(
      join(root, "lint.json"),
      JSON.stringify({ textlint: { profile: "novel" } }),
    );

    expect(() => loadConfig(root, "lint.json")).toThrow(
      /^lint\.json: textlint\.profile/,
    );
  });

  it("指定した設定ファイルが無ければ失敗する", () => {
    expect(() => loadConfig(root, "missing.json")).toThrow(
      /missing\.json: 設定ファイルが見つかりません/,
    );
  });
});
