// 本文の文字数の数え方。docs-lint の上限の検査と、利用側の読了時間・抜粋などの計算が同じ数え方を使えるよう export する。

const FRONT_MATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n([\s\S]*))?$/;

/** 先頭の YAML front matter（--- ... ---）を除いた本文。front matter が無ければ全体を本文とする */
export const stripFrontMatter = (source: string): string => {
  const text = source.replace(/^﻿/, "");
  const match = FRONT_MATTER_PATTERN.exec(text);
  return match ? (match[1] ?? "") : text;
};

/** Markdown の記法とコードブロックを除き、空白を詰めた 1 行のテキストにする */
export const toPlainText = (markdown: string): string =>
  markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/(\*{1,3}|~~)(\S(?:[\s\S]*?\S)?)\1/g, "$2")
    .replace(/(?<!\w)(_{1,3})(\S(?:[\s\S]*?\S)?)\1(?!\w)/g, "$2")
    .replace(/\s+/g, " ")
    .trim();

/** Markdown の記法とコードブロックを除いた本文の文字数（コードポイント単位） */
export const countBodyChars = (markdown: string): number =>
  Array.from(toPlainText(markdown)).length;
