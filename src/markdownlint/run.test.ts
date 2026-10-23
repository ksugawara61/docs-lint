import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMarkdownlint } from "./run.ts";

const profilePath = fileURLToPath(
  new URL("../../profiles/markdownlint.jsonc", import.meta.url),
);

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "docs-lint-markdownlint-"));
  await writeFile(
    join(root, ".markdownlint-cli2.jsonc"),
    JSON.stringify({
      config: { extends: profilePath },
      ignores: ["ignored/**"],
    }),
  );
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

const writeDoc = async (path: string, source: string) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), source);
  return path;
};

describe("runMarkdownlint", () => {
  it("プロファイルで有効なルールの違反を、パス・行・ルール名で返す", async () => {
    const path = await writeDoc("doc.md", "# 題名\n## 見出し\n本文\n");

    const { code, findings } = await runMarkdownlint({
      fix: false,
      paths: [path],
      root,
    });

    expect(code).toBe(1);
    expect(findings).toContainEqual(
      expect.stringMatching(/^doc\.md:2 .*MD022\/blanks-around-headings/),
    );
  });

  it("プロファイルで外したルールは指摘しない", async () => {
    const path = await writeDoc(
      "agent.md",
      `---\nname: agent\n---\n\n${"長い行".repeat(100)}\n\n<details>https://example.com</details>\n`,
    );

    expect(await runMarkdownlint({ fix: false, paths: [path], root })).toEqual({
      code: 0,
      findings: [],
    });
  });

  it("ignores に当てはまる文書は、パスで指定しても検査しない", async () => {
    const path = await writeDoc("ignored/doc.md", "# 題名\n## 見出し\n");

    expect(await runMarkdownlint({ fix: false, paths: [path], root })).toEqual({
      code: 0,
      findings: [],
    });
  });

  it("括弧を含むパスもグロブとして解釈せずに検査する", async () => {
    const path = await writeDoc("(home)/doc.md", "# 題名\n## 見出し\n");

    const { findings } = await runMarkdownlint({
      fix: false,
      paths: [path],
      root,
    });

    expect(findings).toContainEqual(
      expect.stringMatching(/^\(home\)\/doc\.md:2 /),
    );
  });

  it("fix は自動修正できる指摘を書き込み、残る指摘だけを返す", async () => {
    const path = await writeDoc(
      "doc.md",
      "# 題名\n## 見出し\n\n```\ncode\n```\n",
    );

    const { code, findings } = await runMarkdownlint({
      fix: true,
      paths: [path],
      root,
    });

    expect(await readFile(join(root, path), "utf8")).toBe(
      "# 題名\n\n## 見出し\n\n```\ncode\n```\n",
    );
    expect(code).toBe(1);
    expect(findings).toEqual([
      expect.stringMatching(/^doc\.md:5 .*MD040\/fenced-code-language/),
    ]);
  });
});
