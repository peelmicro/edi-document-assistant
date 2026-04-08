/**
 * Pretty-printer for the raw-content viewer in the document detail page.
 *
 * Real-world EDIFACT files frequently arrive as a single line because the
 * segment terminator (`'`) is the only delimiter the standard requires —
 * carriage returns are optional and many production systems strip them
 * to save bytes. The viewer ends up rendering one 5000-character line
 * which is impossible to read.
 *
 * This helper splits an EDIFACT body on segment terminators and returns
 * one segment per line. Two subtleties:
 *
 *   1. The `'` can be **escaped** with the release character `?` (the
 *      EDIFACT default). So `?'` is a literal apostrophe inside a value
 *      and must NOT trigger a line break.
 *
 *   2. The first segment of a UNA-prefixed file is `UNA:+.? '` which
 *      contains the special characters declaration ending in a literal
 *      space. We treat it the same as any other segment.
 *
 * For non-EDIFACT formats (XML, JSON, CSV) we return the content
 * unchanged — those have their own native line breaks.
 */
export function formatRawContent(content: string, formatCode: string): string {
  if (formatCode !== 'edifact') return content;
  // If the content already has line breaks, assume it's already formatted
  // and don't touch it.
  if (content.includes('\n')) return content;

  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && content[i - 1] !== '?') {
      // End of segment — push the line including the terminator for
      // round-trip clarity, then start a new one.
      lines.push(current + "'");
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join('\n');
}
