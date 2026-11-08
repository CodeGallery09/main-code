/**
 * Turning the plain text an operator writes into the email that goes out.
 *
 * Copy is written in the builder as plain text, so it is escaped here rather than trusted as HTML:
 * a lead's company name with an `&` or a `<` in it must arrive as written, not as markup. Bare
 * URLs become links, because Unipile tracks clicks by rewriting `<a href>` — a URL left as text
 * would be neither clickable in some clients nor counted.
 *
 * The result is deliberately plain: no template, no images, no styling. Cold email that looks like
 * a newsletter is filtered like one.
 *
 * Import-free and erasable, so `node --test` loads it directly.
 */

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `https://…`, `http://…` and `www.…`, stopping before trailing punctuation. */
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"]+[^\s<>".,;:!?)\]'])/gi;

function linkify(escaped: string): string {
  return escaped.replace(URL_RE, (url) => {
    const href = url.startsWith("www.") ? `https://${url}` : url;
    return `<a href="${href}">${url}</a>`;
  });
}

/** Paragraphs on blank lines, line breaks inside them, links clickable, everything else escaped. */
export function textToHtml(text: string): string {
  const paragraphs = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.map((p) => `<p>${linkify(escape(p)).replace(/\n/g, "<br>")}</p>`).join("\n");
}

/** "Re: Quick question" for a follow-up, without stacking "Re: Re: …". */
export function replySubject(subject: string): string {
  const base = (subject ?? "").trim().replace(/^(re|fwd?|aw|sv):\s*/i, "");
  return base ? `Re: ${base}` : "";
}

/** The rough shape of an address: something, an @, a dot after it. Enough to refuse junk. */
export const looksLikeEmail = (value: string | null | undefined): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? "").trim());

/**
 * What the person actually wrote, without the quoted thread under it: everything before the first
 * "On … wrote:" line, a "-----Original Message-----" divider, a "From:" header block, or a run of
 * ">"-quoted lines. Returns the whole text when no marker is found.
 */
export function stripQuoted(text: string): string {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const cut = lines.findIndex(
    (line, i) =>
      /^\s*On .{4,200}wrote:\s*$/i.test(line) ||
      // Gmail wraps a long "On … wrote:" across two lines.
      (/^\s*On .{4,200}$/i.test(line) && /wrote:\s*$/i.test(lines[i + 1] ?? "")) ||
      /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line) ||
      /^\s*_{5,}\s*$/.test(line) ||
      (/^\s*From:\s.+/i.test(line) && /^\s*(Sent|Date):\s/i.test(lines[i + 1] ?? "")) ||
      (/^\s*>/.test(line) && /^\s*>/.test(lines[i + 1] ?? "")),
  );
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
  return kept;
}
