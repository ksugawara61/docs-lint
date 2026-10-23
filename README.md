# docs-lint

Markdown 文書を textlint・markdownlint・本文の文字数上限で検査する CLI とライブラリ。
日本語の技術文書向けの textlint の preset と、markdownlint のルールを同梱する。

- textlint は、比較元から変更した行に掛かる指摘だけを報告する。既存文書の違反を抱えたまま導入し、段階的に直せる
- markdownlint と文字数の上限は、変更した文書の全体を検査する
- ディレクトリごとに textlint のプロファイルと文字数の上限を変えられる

## インストール

Node.js 22 以上で動く。preset はこのパッケージの依存として入るため、利用側で preset を入れる必要はない。

```bash
pnpm add -D @ksugawara61/docs-lint
```

`package.json` の `scripts` に足して呼ぶ。

```json
{
  "scripts": {
    "lint:docs": "docs-lint"
  }
}
```

## 使い方

```bash
docs-lint                  # 比較元から変更した文書の、追加・書き換えた行だけを検査する
docs-lint <file...>        # 指定した文書のうち、変更した行だけを検査する
docs-lint --base=<ref>     # 比較元を変える
docs-lint --all [file...]  # 変更の有無によらず全行を検査する（既存違反の棚卸し・修正用）
docs-lint --fix <file...>  # 指定した文書の自動修正できる指摘を全行直して書き込み、残る指摘を表示する
docs-lint --config=<path>  # 設定ファイルを変える
docs-lint --help           # 使い方を表示する
```

カレントディレクトリをリポジトリのルートとして扱う。
変更行は、比較元と `HEAD` の merge-base から作業ツリーまでの差分で決める。未コミットの変更と未追跡の文書も含む。
未追跡の文書は全行が対象になる。

検査の対象は Git が追跡する `*.md` と、未追跡（ignore されていない）の `*.md`。
markdownlint と文字数の上限は、textlint と同じ対象の文書に掛かる。
ただし変更行ではなく、文書全体を検査する（文字数は本文を数える）。

`--fix` は markdownlint の自動修正を書き込んでから textlint の自動修正を書き込む。
修正で行番号がずれるため、変更行での絞り込みはせず、文書は必ず明示する。文字数は検査しない。

終了コードは次のとおり。

| 終了コード | 意味                                           |
| ---------- | ---------------------------------------------- |
| `0`        | 指摘なし                                       |
| `1`        | 指摘あり                                       |
| `2`        | 引数・設定ファイル・比較元の誤りで実行できない |

## 設定ファイル

ルートの `docs-lint.config.json` に、比較元と、どのディレクトリをどのプロファイルで検査するかを書く。
どのディレクトリに何字の上限を掛けるかも、同じファイルに書く。
ファイルが無ければ、`origin/main` と比べ、すべての文書を `technical` で検査し、文字数の上限は掛けない。

```json
{
  "base": "origin/main",
  "charLimit": {
    "overrides": [{ "dir": "posts/", "max": 8000 }]
  },
  "textlint": {
    "overrides": [{ "dir": "posts/", "profile": "blog" }],
    "profile": "technical"
  }
}
```

- `base`：変更行モードの比較元。省略すると `origin/main`。`--base` で上書きできる。
- `textlint.profile`：`overrides` に当てはまらない文書のプロファイル。省略すると `technical`。
- `textlint.overrides`：`dir`（ルートからの相対パス）配下の文書を `profile` で検査する。
  先に書いたものが優先される。`dir` の末尾の `/` は省略できる。
- `charLimit.overrides`：`dir` 配下の文書の本文を `max` 字までにする。
  先に書いたものが優先され、どれにも当てはまらない文書には上限を掛けない。
  超えると文書のパス・文字数・上限を表示して終了コード 1 になる。

## textlint のプロファイル

textlint の preset の組み合わせを「プロファイル」として持つ。

| プロファイル | preset                                                          | 向いている文書                                            |
| ------------ | --------------------------------------------------------------- | --------------------------------------------------------- |
| `technical`  | `preset-ja-technical-writing`・`@textlint-ja/preset-ai-writing` | 技術文書・README・手順書                                  |
| `blog`       | `technical` の 2 つ ＋ `preset-ai-words-ja`                     | AI が書いた文章に多い単語を避けたい文書（ブログ記事など） |

プロファイルの textlintrc は `profiles/textlint/<名前>.json` にある。
preset の版は厳密に固定している。版が上がるとルールが増え、既存文書の指摘も変わるため。
このパッケージを上げるときは `docs-lint --all` で影響を確認する。

## markdownlint のルール

markdownlint（markdownlint-cli2）のルールは `profiles/markdownlint.jsonc` にある。
既定ルールをすべて有効にし、日本語の文書に合わない 8 ルールだけを外す。
markdownlint-cli2 は、リポジトリルートの `.markdownlint-cli2.jsonc` を設定として読む。
そこでプロファイルを `extends` で参照し、除外する文書を `ignores` に書く。

```jsonc
{
  "config": { "extends": "@ksugawara61/docs-lint/markdownlint" },
  "ignores": ["**/README.mdx"],
}
```

ルールを足したり外したりするときは、`config` に `extends` と並べて書く。
VS Code の markdownlint 拡張も同じファイルを読むため、エディタと CLI のルールがそろう。

## 除外

除外する文書は、ルートの `.textlintignore` と、`.markdownlint-cli2.jsonc` の `ignores` に書く。
VS Code の markdownlint 拡張は `.markdownlint-cli2.jsonc` しか読まないため、同じ除外を両方に書く。

## 文字数の数え方

先頭の YAML front matter（`---` で囲んだ部分）を除いた本文を数える。
Markdown の記法とコードブロックを除き、空白を詰めたテキストのコードポイント数を文字数とする。
数え方は `@ksugawara61/docs-lint/char-limit` が export する。
読了時間や抜粋を同じ数え方で求めたいときに使う。

```ts
import {
  countBodyChars,
  stripFrontMatter,
  toPlainText,
} from "@ksugawara61/docs-lint/char-limit";

const chars = countBodyChars(stripFrontMatter(source));
const excerpt = toPlainText(stripFrontMatter(source)).slice(0, 120);
```

## CI で使う

GitHub Actions の pull request では、比較元に base ブランチのコミットを渡す。
merge-base を求めるため、履歴を取得しておく。

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- run: pnpm install --frozen-lockfile
- run: pnpm docs-lint --base="${{ github.event.pull_request.base.sha }}"
```

## ライブラリとして使う

CLI の部品もパッケージのルートから export する。
変更一覧の解析（`parseGitNameStatus`・`mergeUntrackedChanges`・`selectChangedDocs`）を、ほかのスクリプトで再利用できる。
CLI そのものは `runCli({ args, root })` で呼べ、終了コードを返す。

```ts
import {
  parseGitNameStatus,
  runCli,
  selectChangedDocs,
} from "@ksugawara61/docs-lint";

const docs = selectChangedDocs(parseGitNameStatus(nameStatusOutput));
const code = await runCli({ args: ["--all"], root: process.cwd() });
```

## 開発

```bash
pnpm install
pnpm test          # vitest
pnpm typecheck     # tsc
pnpm lint          # oxlint
pnpm format        # oxfmt
pnpm knip          # 未使用の export・依存の検出
pnpm build         # dist/ に JavaScript と型定義を出力する
pnpm lint:docs     # このリポジトリの文書を docs-lint 自身で検査する
```

`v*` のタグを push すると、GitHub Actions が npm に公開する。

## ライセンス

MIT
