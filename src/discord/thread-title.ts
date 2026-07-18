import { stripPromptMetadata } from '../session-title.js';

const MAX_TITLE_LENGTH = 80;

const TITLE_START = '<xangi_thread_title>';
const TITLE_END = '</xangi_thread_title>';

/**
 * スレッド名を投稿本文から生成する。
 * プロンプトのメタ情報を除去し、空白を 1 つに畳んで先頭を切り出す。
 * AI バックエンドに依存しない決定的な処理（要約は行わない）。
 * スレッド作成時の「暫定名」として使う（返答が出そろってから AI 要約名で上書きする）。
 */
export function deriveThreadTitle(userText: string): string {
  const cleaned = sanitizeThreadName(stripPromptMetadata(userText));
  return cleaned || 'xangi';
}

/**
 * スレッド名として安全な文字列に整える。
 * 改行・制御文字を空白に潰して連続空白を 1 つに畳み、サロゲートペア（絵文字）を
 * 割らないよう Array.from ベースで MAX_TITLE_LENGTH まで切る。
 * Discord のスレッド名は 1〜100 文字で、空文字や lone surrogate は API エラーになる。
 */
export function sanitizeThreadName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const collapsed = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(collapsed).slice(0, MAX_TITLE_LENGTH).join('');
}

/**
 * 初回ターンのプロンプト末尾に「スレッド名も出力して」という指示を相乗りさせる。
 * 返信候補 (appendReplySuggestionInstruction) と同じ方式で、追加の LLM 呼び出しを
 * 発生させずに、モデルが自分の回答内容も踏まえた要約タイトルを 1 回だけ生成する。
 * 返信候補指示より「前」に付けること（返信候補指示の末尾アンカー剥がしを壊さないため）。
 */
export function appendThreadTitleInstruction(prompt: string): string {
  return `${prompt}\n\n[system-context]\nこの会話にふさわしい簡潔なスレッド名を1つ生成してください。ユーザーの最初の投稿とあなたの回答内容の両方を踏まえます。このスレッド名は Discord のサイドバーに表示され、幅が狭いため先頭の十数文字しか見えません。そこで、冒頭だけで「何のスレッドか」が分かるよう、最も識別性の高い主題（対象の名前・機能・固有名詞・キーワード）を必ず先頭に置いてください。「〜について」「〜の件」「質問」「相談」のような汎用的・冗長な前置きで始めてはいけません。全角15字前後を目安にできるだけ短くし、体言止め可、日本語・${MAX_TITLE_LENGTH}字以内・改行なしにしてください。出力の末尾に次の形式を厳密に付け、通常の回答本文ではスレッド名に言及しないでください。\n${TITLE_START}スレッド名${TITLE_END}`;
}

/**
 * モデル出力から `<xangi_thread_title>…</xangi_thread_title>` を抜き出し、
 * 表示テキストからは除去する。複数あれば最後の非空を採用し、取れなければ title は null。
 * 表示テキスト側の内部マーカー除去は stripReplySuggestionMarkup が担うため、ここでは
 * タイトル抽出とブロック除去のみを行う。
 */
export function extractThreadTitle(output: string): { text: string; title: string | null } {
  const pattern = new RegExp(`${TITLE_START}([\\s\\S]*?)${TITLE_END}`, 'g');
  let title: string | null = null;
  const text = output
    .replace(pattern, (_match, raw: string) => {
      const cleaned = sanitizeThreadName(String(raw));
      if (cleaned) title = cleaned;
      return '';
    })
    .trimEnd();
  return { text, title };
}
