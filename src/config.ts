import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isTextlintProfile,
  TEXTLINT_PROFILES,
  type TextlintProfile,
} from "./textlint/profiles.ts";

/** 既定でリポジトリルートから読む設定ファイル */
export const CONFIG_FILE_NAME = "docs-lint.config.json";

type TextlintOverride = { dir: string; profile: TextlintProfile };

type CharLimitOverride = { dir: string; max: number };

export type DocsLintConfig = {
  /** 変更行モードの比較元。この ref と HEAD の merge-base から作業ツリーまでの変更を検査する */
  base: string;
  charLimit: {
    /** dir（リポジトリルートからの相対パス。末尾は /）配下の文書は、本文を max 字までにする。先に書いたものが優先 */
    overrides: CharLimitOverride[];
  };
  textlint: {
    /** dir（リポジトリルートからの相対パス。末尾は /）配下の文書は profile で検査する。先に書いたものが優先 */
    overrides: TextlintOverride[];
    /** overrides に当てはまらない文書のプロファイル */
    profile: TextlintProfile;
  };
};

const DEFAULT_CONFIG: DocsLintConfig = {
  base: "origin/main",
  charLimit: { overrides: [] },
  textlint: { overrides: [], profile: "technical" },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 設定ファイルの中身を検証し、省略した項目を既定値で埋める
 * @param source エラーメッセージに出す設定ファイルの名前
 */
export const parseConfig = (
  raw: unknown,
  source = CONFIG_FILE_NAME,
): DocsLintConfig => {
  const fail = (message: string): never => {
    throw new Error(`${source}: ${message}`);
  };

  const toProfile = (value: unknown, where: string): TextlintProfile =>
    isTextlintProfile(value)
      ? value
      : fail(
          `${where} は ${TEXTLINT_PROFILES.join(" / ")} のいずれかです（${JSON.stringify(value)}）`,
        );

  /** overrides[].dir を検証し、別のディレクトリの前方一致を防ぐため末尾に / を補う */
  const toDir = (override: Record<string, unknown>, where: string): string => {
    if (typeof override.dir !== "string" || override.dir === "") {
      return fail(`${where}.dir は空でない文字列です`);
    }
    return override.dir.endsWith("/") ? override.dir : `${override.dir}/`;
  };

  const toOverrides = (value: unknown, where: string) => {
    const overrides = value ?? [];
    if (!Array.isArray(overrides)) {
      return fail(`${where} は配列です`);
    }
    return overrides.map((override: unknown, index) => {
      if (!isRecord(override)) {
        return fail(`${where}[${index}] はオブジェクトです`);
      }
      return { override, where: `${where}[${index}]` };
    });
  };

  const toSection = (
    value: unknown,
    where: string,
  ): Record<string, unknown> => {
    const section = value ?? {};
    return isRecord(section) ? section : fail(`${where} はオブジェクトです`);
  };

  if (!isRecord(raw)) {
    return fail("オブジェクトではありません");
  }
  if (
    raw.base !== undefined &&
    (typeof raw.base !== "string" || raw.base === "")
  ) {
    fail(`base は空でない文字列です（${JSON.stringify(raw.base)}）`);
  }
  const charLimit = toSection(raw.charLimit, "charLimit");
  const textlint = toSection(raw.textlint, "textlint");
  return {
    base: typeof raw.base === "string" ? raw.base : DEFAULT_CONFIG.base,
    charLimit: {
      overrides: toOverrides(charLimit.overrides, "charLimit.overrides").map(
        ({ override, where }) => {
          const { max } = override;
          if (typeof max !== "number" || !Number.isInteger(max) || max <= 0) {
            return fail(
              `${where}.max は正の整数です（${JSON.stringify(max)}）`,
            );
          }
          return { dir: toDir(override, where), max };
        },
      ),
    },
    textlint: {
      overrides: toOverrides(textlint.overrides, "textlint.overrides").map(
        ({ override, where }) => ({
          dir: toDir(override, where),
          profile: toProfile(override.profile, `${where}.profile`),
        }),
      ),
      profile:
        textlint.profile === undefined
          ? DEFAULT_CONFIG.textlint.profile
          : toProfile(textlint.profile, "textlint.profile"),
    },
  };
};

/**
 * 設定ファイルを読む。無ければ既定値（全文書を technical で検査し、文字数の上限を掛けない）。
 * @param path 設定ファイルのパス（root からの相対パスか絶対パス）。明示したファイルが無ければ失敗する
 */
export const loadConfig = (root: string, path?: string): DocsLintConfig => {
  const configPath = resolve(root, path ?? CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    if (path !== undefined) {
      throw new Error(`${path}: 設定ファイルが見つかりません`);
    }
    return DEFAULT_CONFIG;
  }
  return parseConfig(
    JSON.parse(readFileSync(configPath, "utf8")),
    path ?? CONFIG_FILE_NAME,
  );
};

/**
 * 文書を、検査に使うプロファイルごとに分ける。
 * @param paths リポジトリルートからの相対パス
 */
export const groupByTextlintProfile = (
  paths: string[],
  { textlint }: DocsLintConfig,
): Map<TextlintProfile, string[]> =>
  paths.reduce((groups, path) => {
    const profile =
      textlint.overrides.find(({ dir }) => path.startsWith(dir))?.profile ??
      textlint.profile;
    groups.set(profile, [...(groups.get(profile) ?? []), path]);
    return groups;
  }, new Map<TextlintProfile, string[]>());
