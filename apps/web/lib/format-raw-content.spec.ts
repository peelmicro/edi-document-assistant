import { describe, it, expect } from 'vitest';
import { formatRawContent } from './format-raw-content';

describe('formatRawContent', () => {
  describe('non-EDIFACT formats', () => {
    it('returns XML unchanged', () => {
      const xml = '<Order><LineItem>1</LineItem></Order>';
      expect(formatRawContent(xml, 'xml')).toBe(xml);
    });

    it('returns JSON unchanged', () => {
      const json = '{"type":"order","lines":[]}';
      expect(formatRawContent(json, 'json')).toBe(json);
    });

    it('returns CSV unchanged', () => {
      const csv = 'sku,qty\nMILK,500';
      expect(formatRawContent(csv, 'csv')).toBe(csv);
    });
  });

  describe('EDIFACT splitting', () => {
    it('splits a single-line EDIFACT file into one segment per line', () => {
      const input = "UNB+UNOC:3+S+R+260401:1200+1'UNH+1+ORDERS:D:96A:UN'UNT+2+1'";
      const result = formatRawContent(input, 'edifact');
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("UNB+UNOC:3+S+R+260401:1200+1'");
      expect(lines[1]).toBe("UNH+1+ORDERS:D:96A:UN'");
      expect(lines[2]).toBe("UNT+2+1'");
    });

    it("honours the release character — ?' is not a segment terminator", () => {
      // The product name contains an escaped apostrophe: "L'Oréal"
      const input = "LIN+1++L?'Oreal:EN'UNT+2+1'";
      const result = formatRawContent(input, 'edifact');
      const lines = result.split('\n');
      // Should produce exactly 2 segments, not split on the escaped apostrophe
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("LIN+1++L?'Oreal:EN'");
    });

    it('returns already-formatted EDIFACT (has newlines) unchanged', () => {
      const input = "UNB+UNOC:3+S+R+260401:1200+1'\nUNT+2+1'";
      expect(formatRawContent(input, 'edifact')).toBe(input);
    });

    it('handles a trailing partial segment with no terminator', () => {
      const input = "UNB+UNOC:3+S+R+260401:1200+1'PARTIAL_SEGMENT";
      const result = formatRawContent(input, 'edifact');
      const lines = result.split('\n');
      expect(lines[lines.length - 1]).toBe('PARTIAL_SEGMENT');
    });

    it('handles an empty string without throwing', () => {
      expect(formatRawContent('', 'edifact')).toBe('');
    });
  });
});
