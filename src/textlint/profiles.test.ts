import { createLinter, loadTextlintrc } from "textlint";
import { describe, expect, it } from "vitest";
import {
  presetModulesDir,
  type TextlintProfile,
  textlintrcPath,
} from "./profiles.ts";

const lintRuleIds = async (profile: TextlintProfile, text: string) => {
  const linter = createLinter({
    descriptor: await loadTextlintrc({
      configFilePath: textlintrcPath(profile),
      node_modulesDir: presetModulesDir(),
    }),
  });
  const { messages } = await linter.lintText(text, "/docs/sample.md");
  return messages.map(({ ruleId }) => ruleId);
};

describe("textlint のプロファイル", () => {
  const aiWords = "# テスト\n\nこの設定はよく効きます。\n";

  it("blog は AI が書いた文章に多い単語を指摘する", async () => {
    expect(await lintRuleIds("blog", aiWords)).toContainEqual(
      expect.stringMatching(/^ai-words-ja\//),
    );
  });

  it("technical は AI が書いた文章に多い単語を指摘しない", async () => {
    expect(await lintRuleIds("technical", aiWords)).not.toContainEqual(
      expect.stringMatching(/^ai-words-ja\//),
    );
  });
});
