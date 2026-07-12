/**
 * text-formatter.ts — converts standard Markdown (what LLMs emit) into WhatsApp's
 * formatting dialect, deterministically (no LLM involved).
 *
 * WhatsApp formatting:
 *   *bold*        (single asterisk)      — Markdown uses **bold** / __bold__
 *   _italic_      (single underscore)    — same as Markdown
 *   ~strike~      (single tilde)         — Markdown uses ~~strike~~
 *   ```mono```    (triple backtick)      — block monospace
 *
 * WhatsApp has no headings, no markdown links, and bullet lists render best with
 * "- ". We normalise those so messages don't show raw "**", "###" or "[text](url)".
 */

/**
 * Rewrites Markdown emphasis/structure to WhatsApp-friendly equivalents.
 * Safe to run on any outbound text; idempotent for already-WhatsApp text.
 */
export function formatWhatsAppMarkdown(text: string): string {
  if (!text) return text;

  let out = text;

  // 1. Headings (#, ##, …) → bold line. WhatsApp has no headings.
  //    "## Título" → "*Título*"
  out = out.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, "*$1*");

  // 2. Bold: **text** / __text__ → *text*. Run before bullet normalisation so a
  //    leading "**" is collapsed before we touch "* " bullets.
  out = out.replace(/\*\*(?=\S)([\s\S]+?)\*\*/g, "*$1*");
  out = out.replace(/__(?=\S)([\s\S]+?)__/g, "*$1*");

  // 3. Strikethrough: ~~text~~ → ~text~
  out = out.replace(/~~(?=\S)([\s\S]+?)~~/g, "~$1~");

  // 4. Markdown links: [text](url) → "text (url)". Bare URLs already autolink.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");

  // 5. Bullet lists: leading "* " or "+ " → "- " (after bold so *bold* is safe;
  //    a bullet always has whitespace after the marker, *bold* does not).
  out = out.replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ");

  return out;
}

/**
 * Strips Markdown formatting to plain text for channels that don't render it
 * (Facebook Messenger, Instagram DM). Preserves readability:
 *   **bold** / __bold__       → bold
 *   _italic_                  → italic (just removes underscores)
 *   ~~strike~~                → strike
 *   [text](url)               → text (url)
 *   # Heading                 → Heading
 *   ```code blocks```         → code blocks
 *   `inline code`             → inline code
 *   * / + bullets             → - bullets
 *   Collapses >2 consecutive newlines to 2.
 */
export function formatPlainText(text: string): string {
  if (!text) return text;

  let out = text;

  // 1. Fenced code blocks: ```lang\ncode\n``` → code (keep content)
  out = out.replace(/```[\s\S]*?\n([\s\S]*?)```/g, "$1");
  // Also handle inline triple backtick: ```text``` → text
  out = out.replace(/```(.+?)```/g, "$1");

  // 2. Inline code: `text` → text
  out = out.replace(/`([^`]+)`/g, "$1");

  // 3. Headings: "## Title" → "Title"
  out = out.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, "$1");

  // 4. Bold: **text** / __text__ → text
  out = out.replace(/\*\*(?=\S)([\s\S]+?)\*\*/g, "$1");
  out = out.replace(/__(?=\S)([\s\S]+?)__/g, "$1");

  // 5. Italic: *text* (single) → text — run after bold removal so double-star
  //    is already gone and *text* won't match mid-word false positives.
  //    Only match when preceded/followed by whitespace or line boundary to avoid
  //    clobbering legitimate asterisks in things like "5 * 3".
  out = out.replace(/(?<=^|[\s(])\*(?=\S)([\s\S]+?)\*(?=$|[\s).,!?;:])/gm, "$1");
  // Underscored italic: _text_ → text
  out = out.replace(/(?<=^|[\s(])_(?=\S)([\s\S]+?)_(?=$|[\s).,!?;:])/gm, "$1");

  // 6. Strikethrough: ~~text~~ → text
  out = out.replace(/~~(?=\S)([\s\S]+?)~~/g, "$1");

  // 7. Markdown links: [text](url) → "text (url)"
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");

  // 8. Bullet lists: leading "* " or "+ " → "- "
  out = out.replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ");

  // 9. Blockquotes: "> text" → "text"
  out = out.replace(/^[ \t]*>[ \t]?/gm, "");

  // 10. Horizontal rules: ---, ***, ___ on their own line → empty
  out = out.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "");

  // 11. Collapse excessive newlines (>2 consecutive → 2)
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}
