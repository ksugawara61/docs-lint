import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./cli.ts";

const profilePath = fileURLToPath(
  new URL("../profiles/markdownlint.jsonc", import.meta.url),
);

// preset-ja-technical-writing の no-exclamation-question-mark が指摘する
const VIOLATION = "これは指摘される文です！";
const CLEAN = "これは指摘されない文です。";

let root: string;
let output: string[];

const git = (...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );

const writeRepoFile = async (path: string, source: string) => {
  await mkdir(join(root, dirname(path)), { recursive: true });
  await writeFile(join(root, path), source);
};

const doc = (...lines: string[]) => `# 題名\n\n${lines.join("\n\n")}\n`;

const run = (...args: string[]) => runCli({ args, root });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "docs-lint-cli-"));
  output = [];
  const record = (...messages: unknown[]) => {
    output.push(messages.join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(record);
  vi.spyOn(console, "error").mockImplementation(record);

  git("init", "--quiet", "--initial-branch=main");
  await writeRepoFile(
    ".markdownlint-cli2.jsonc",
    JSON.stringify({ config: { extends: profilePath } }),
  );
  await writeRepoFile(
    "docs-lint.config.json",
    JSON.stringify({ base: "main" }),
  );
  await writeRepoFile("docs/guide.md", doc(VIOLATION, CLEAN));
  git("add", ".");
  git("commit", "--quiet", "-m", "init");
  git("switch", "--quiet", "-c", "feature");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { force: true, recursive: true });
});

describe("runCli", () => {
  it("変更していない行の既存違反は報告しない", async () => {
    await writeRepoFile("docs/guide.md", doc(VIOLATION, CLEAN, CLEAN));

    expect(await run()).toBe(0);
  });

  it("追加・書き換えた行の違反を報告する", async () => {
    await writeRepoFile("docs/guide.md", doc(VIOLATION, VIOLATION));

    expect(await run()).toBe(1);
    const report = output.join("\n");
    expect(report).toMatch(/^ {2}5:\d+ +error/m);
    expect(report).not.toMatch(/^ {2}3:\d+ +error/m);
  });

  it("未追跡の文書は全行を検査する", async () => {
    await writeRepoFile("notes/new.md", doc(VIOLATION));

    expect(await run("notes/new.md")).toBe(1);
  });

  it("--all は変更していない文書の既存違反も報告する", async () => {
    expect(await run("--all")).toBe(1);
  });

  it("比較元を解決できなければ 2 を返す", async () => {
    expect(await run("--base=origin/main")).toBe(2);
    expect(output.join("\n")).toMatch(/origin\/main との merge-base/);
  });

  it("charLimit の上限を超えた文書を報告する", async () => {
    await writeRepoFile(
      "docs-lint.config.json",
      JSON.stringify({
        base: "main",
        charLimit: { overrides: [{ dir: "docs", max: 5 }] },
      }),
    );
    await writeRepoFile("docs/guide.md", doc(VIOLATION, CLEAN, CLEAN));

    expect(await run()).toBe(1);
    expect(output.join("\n")).toMatch(
      /docs\/guide\.md: 本文が \d+ 字あり、上限の 5 字/,
    );
  });

  it("--fix は自動修正を書き込む", async () => {
    await writeRepoFile("docs/fix.md", "# 題名\n## 見出し\n\n本文です。\n");

    expect(await run("--fix", "docs/fix.md")).toBe(0);
    expect(await readFile(join(root, "docs/fix.md"), "utf8")).toBe(
      "# 題名\n\n## 見出し\n\n本文です。\n",
    );
  });

  it("--fix は自動修正できない指摘が残れば報告する", async () => {
    await writeRepoFile("docs/fix.md", doc(VIOLATION));

    expect(await run("--fix", "docs/fix.md")).toBe(1);
    expect(output.join("\n")).toMatch(/no-exclamation-question-mark/);
  });

  it.each([
    { args: ["--fix"], message: /--fix には修正する \.md 文書を指定/ },
    { args: ["--unknown"], message: /不明なオプションです: --unknown/ },
    {
      args: ["--config=missing.json"],
      message: /missing\.json: 設定ファイルが見つかりません/,
    },
  ])("$args は実行せずに 2 を返す", async ({ args, message }) => {
    expect(await run(...args)).toBe(2);
    expect(output.join("\n")).toMatch(message);
  });
});
