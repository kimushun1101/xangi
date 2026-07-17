import { describe, it, expect } from 'vitest';
import {
  deriveThreadTitle,
  sanitizeThreadName,
  appendThreadTitleInstruction,
  extractThreadTitle,
} from '../src/discord/thread-title.js';
import { stripReplySuggestionMarkup, appendReplySuggestionInstruction } from '../src/reply-suggestions.js';
import { stripPromptMetadata } from '../src/session-title.js';

describe('deriveThreadTitle (暫定名)', () => {
  it('メタデータを剥がして先頭を切り出す', () => {
    const input = '[プラットフォーム: Discord]\n[発言者: x (ID: 1)]\nスレッド名の要約機能について';
    expect(deriveThreadTitle(input)).toBe('スレッド名の要約機能について');
  });

  it('空入力は xangi にフォールバック', () => {
    expect(deriveThreadTitle('')).toBe('xangi');
  });
});

describe('sanitizeThreadName', () => {
  it('改行・制御文字を空白に潰して畳む', () => {
    expect(sanitizeThreadName('a\n\tb   c')).toBe('a b c');
  });

  it('80字を超えたら切り詰める', () => {
    const long = 'あ'.repeat(200);
    expect(Array.from(sanitizeThreadName(long)).length).toBe(80);
  });

  it('サロゲートペア（絵文字）を割らない', () => {
    // 40 個の絵文字 = code point 40 個。80 で切っても壊れた lone surrogate は残らない。
    const emojis = '😀'.repeat(120);
    const out = sanitizeThreadName(emojis);
    expect(Array.from(out).length).toBe(80);
    // lone surrogate を含まない（正しく JSON 化できる）
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(out.length % 2).toBe(0); // 全てサロゲートペアなので偶数長
  });
});

describe('extractThreadTitle', () => {
  it('マーカーからタイトルを抜き、本文からは除去する', () => {
    const out = '本文です。\n<xangi_thread_title>会話の要約タイトル</xangi_thread_title>';
    const { text, title } = extractThreadTitle(out);
    expect(title).toBe('会話の要約タイトル');
    expect(text).toBe('本文です。');
  });

  it('マーカーが無ければ title は null で本文はそのまま', () => {
    const { text, title } = extractThreadTitle('ただの本文');
    expect(title).toBeNull();
    expect(text).toBe('ただの本文');
  });

  it('複数あれば最後の非空を採用する', () => {
    const out =
      '<xangi_thread_title></xangi_thread_title><xangi_thread_title>後の方</xangi_thread_title>';
    expect(extractThreadTitle(out).title).toBe('後の方');
  });
});

describe('内部マーカーの共存（相乗り）', () => {
  it('stripReplySuggestionMarkup はストリーミング途中の独立行スレッド名マーカーも隠す', () => {
    // マーカーは指示で必ず独立行（末尾）に置かせる。本文中のインライン言及は
    // #126 と同様に保持し、独立行の未完タグ以降だけをストリーミング表示から隠す。
    const streamed = '回答本文\n<xangi_thread_title>タイトル';
    expect(stripReplySuggestionMarkup(streamed)).toBe('回答本文');
  });

  it('stripReplySuggestionMarkup は本文中のインラインなマーカー言及を残す（#126 整合）', () => {
    const inline = 'このスレは <xangi_thread_title> マーカーの話です。続きの本文。';
    expect(stripReplySuggestionMarkup(inline)).toBe(inline);
  });

  it('タイトル抽出→返信候補strip の順で両マーカーが本文から消える', () => {
    const out =
      '本文\n<xangi_thread_title>要約名</xangi_thread_title>\n<xangi_reply_suggestions>["a","b"]</xangi_reply_suggestions>';
    const afterTitle = extractThreadTitle(out);
    expect(afterTitle.title).toBe('要約名');
    expect(stripReplySuggestionMarkup(afterTitle.text)).toBe('本文');
  });

  it('セッションタイトル生成でスレッド名指示が本文へ漏れない（返信候補指示と共存）', () => {
    // message-handler と同じ順序: まずスレッド名指示、次に返信候補指示を末尾に付ける
    let prompt = '[発言者: x (ID: 1)]\n最初の質問';
    prompt = appendThreadTitleInstruction(prompt);
    prompt = appendReplySuggestionInstruction(prompt, 3);
    expect(stripPromptMetadata(prompt)).toBe('最初の質問');
  });
});
