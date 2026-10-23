import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * パッケージが提供する textlint のプロファイル（preset の組み合わせ）。
 * - technical: 技術文書向け。`preset-ja-technical-writing` と `@textlint-ja/preset-ai-writing`
 * - blog: technical に、AI が書いた文章に多い単語を指摘する `preset-ai-words-ja` を足したもの
 */
export const TEXTLINT_PROFILES = ["technical", "blog"] as const;

export type TextlintProfile = (typeof TEXTLINT_PROFILES)[number];

/** プロファイルの textlintrc が名前で参照する preset。どれもこのパッケージの dependencies に入る */
const TEXTLINT_PRESETS = [
  "@textlint-ja/textlint-rule-preset-ai-writing",
  "textlint-rule-preset-ai-words-ja",
  "textlint-rule-preset-ja-technical-writing",
];

export const isTextlintProfile = (value: unknown): value is TextlintProfile =>
  TEXTLINT_PROFILES.some((profile) => profile === value);

/** パッケージのルート。src/textlint/ と dist/textlint/ のどちらからでも 2 階層上になる */
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

/** プロファイルの textlintrc */
export const textlintrcPath = (profile: TextlintProfile): string =>
  join(packageRoot, "profiles", "textlint", `${profile}.json`);

/** dir から上にたどった node_modules ディレクトリ（近い順） */
const ancestorNodeModulesDirs = (dir: string): string[] => {
  const parent = dirname(dir);
  if (parent === dir) {
    return [];
  }
  return [
    ...(basename(parent) === "node_modules" ? [parent] : []),
    ...ancestorNodeModulesDirs(parent),
  ];
};

/**
 * preset を読み込む node_modules。textlint は preset をこのディレクトリの直下からしか探さないため、
 * 利用側の cwd ではなく、このパッケージの依存がそろって見える場所を選ぶ。
 * - 開発中（リポジトリを直接動かす）: パッケージ直下の node_modules
 * - npm・pnpm の hoisted 配置: 利用側の node_modules（依存の版が衝突したときはパッケージ直下）
 * - pnpm の isolated 配置: .pnpm/<このパッケージ>/node_modules（依存が symlink で並ぶ）
 */
export const presetModulesDir = (): string => {
  const candidates = [
    join(packageRoot, "node_modules"),
    ...ancestorNodeModulesDirs(packageRoot),
  ];
  const found = candidates.find((dir) =>
    TEXTLINT_PRESETS.every((preset) =>
      existsSync(join(dir, preset, "package.json")),
    ),
  );
  if (found === undefined) {
    throw new Error(
      `textlint の preset（${TEXTLINT_PRESETS.join(", ")}）が見つかりません: ${candidates.join(", ")}`,
    );
  }
  return found;
};
