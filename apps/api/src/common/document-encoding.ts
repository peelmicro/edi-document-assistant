/**
 * Document text decoding helper.
 *
 * The original Phase 8 upload code stored each document in MinIO as raw
 * bytes and every reader did `buffer.toString('utf-8')`. That's correct
 * for XML/JSON/CSV which are almost always UTF-8 in practice, but it
 * mangles EDIFACT files that declare a non-UTF-8 character set in their
 * UNB header (`UNB+UNOC:3+...` → ISO 8859-1, very common for European
 * suppliers). Mangled bytes then poison every downstream consumer:
 *
 *   - the LLM sees garbled text and makes worse extractions
 *   - the raw-content viewer in the UI shows replacement characters
 *   - chat answers reference garbled product names
 *
 * This helper inspects the EDIFACT UNB segment, picks the matching
 * Node Buffer encoding, and decodes once at the read boundary. The rest
 * of the codebase keeps working in UTF-8 strings as before.
 *
 * For non-EDIFACT formats it falls back to UTF-8 — every modern XML/JSON/
 * CSV file is UTF-8, and if you do hit a Latin-1 CSV the user can fix it
 * by re-saving as UTF-8 (a one-click change in any editor). Adding
 * full encoding detection for non-EDIFACT formats would mean adding
 * `iconv-lite` and a content-sniffing library; out of scope for now.
 */

/**
 * EDIFACT character set codes mapped to Node Buffer encodings.
 *
 * UNOA / UNOB are 7-bit ASCII subsets — `latin1` is a safe superset that
 * decodes the same bytes identically.
 *
 * UNOD / UNOE / UNOF / UNOG / UNOH are ISO 8859-2/5/7/3/4 respectively;
 * Node's built-in Buffer doesn't ship with those decoders, so they
 * fall through to the default and we log a warning. Adding `iconv-lite`
 * would handle them transparently.
 */
const EDIFACT_CHARSET_TO_NODE_ENCODING: Record<string, BufferEncoding> = {
  UNOA: 'latin1',
  UNOB: 'latin1',
  UNOC: 'latin1', // ISO 8859-1 — by far the most common in European EDIFACT
  UNOY: 'utf-8',
};

const UNB_REGEX = /UNB\+(UNO[A-Z])/;

/**
 * Decodes a document buffer to a UTF-8 JavaScript string.
 *
 * @param buffer     The raw bytes loaded from MinIO (or read from disk).
 * @param formatCode The format code from the `formats` table
 *                   (`edifact` | `xml` | `json` | `csv` | …).
 */
export function decodeDocumentBuffer(buffer: Buffer, formatCode: string): string {
  if (formatCode === 'edifact') {
    // The UNB header always lives in the first ~50 bytes and is pure
    // ASCII regardless of the body's character set, so peeking with
    // `latin1` (which round-trips bytes 0-255 unchanged) is safe.
    const head = buffer.subarray(0, 50).toString('latin1');
    const match = head.match(UNB_REGEX);
    if (match) {
      const charset = match[1];
      const encoding = EDIFACT_CHARSET_TO_NODE_ENCODING[charset];
      if (encoding) {
        return buffer.toString(encoding);
      }
      // Unknown EDIFACT charset (e.g. UNOD/UNOE) — fall through to UTF-8
      // and let the caller see the mojibake. Logging would be nice but
      // this helper is intentionally pure to keep it test-friendly.
    }
  }
  return buffer.toString('utf-8');
}
