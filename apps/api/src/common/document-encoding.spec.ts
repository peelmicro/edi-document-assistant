import { describe, it, expect } from 'vitest';
import { decodeDocumentBuffer } from './document-encoding';

describe('decodeDocumentBuffer', () => {
  describe('non-EDIFACT formats', () => {
    it('decodes XML as UTF-8', () => {
      const content = '<root><item>café</item></root>';
      const buffer = Buffer.from(content, 'utf-8');
      expect(decodeDocumentBuffer(buffer, 'xml')).toBe(content);
    });

    it('decodes JSON as UTF-8', () => {
      const content = '{"name":"José"}';
      const buffer = Buffer.from(content, 'utf-8');
      expect(decodeDocumentBuffer(buffer, 'json')).toBe(content);
    });

    it('decodes CSV as UTF-8', () => {
      const content = 'name,price\nCafé au lait,2.50';
      const buffer = Buffer.from(content, 'utf-8');
      expect(decodeDocumentBuffer(buffer, 'csv')).toBe(content);
    });
  });

  describe('EDIFACT — character set detection', () => {
    function makeEdifact(charset: string, body: string): Buffer {
      return Buffer.from(`UNB+${charset}:3+SENDER+RECEIVER+260401:1200+1'${body}`, 'latin1');
    }

    it('decodes UNOC (ISO 8859-1) correctly — accented characters survive', () => {
      // "Ñoño" encoded as Latin-1 bytes, declared in the UNB header as UNOC
      const spanishName = 'Ba\xf1o'; // 'Baño' in Latin-1
      const buffer = makeEdifact('UNOC', `LIN+1++${spanishName}'`);
      const result = decodeDocumentBuffer(buffer, 'edifact');
      expect(result).toContain('Baño');
    });

    it('decodes UNOA (7-bit ASCII subset) as latin1', () => {
      const buffer = makeEdifact('UNOA', "LIN+1++MILK'");
      expect(decodeDocumentBuffer(buffer, 'edifact')).toContain('MILK');
    });

    it('decodes UNOB (7-bit ASCII subset) as latin1', () => {
      const buffer = makeEdifact('UNOB', "LIN+1++MILK'");
      expect(decodeDocumentBuffer(buffer, 'edifact')).toContain('MILK');
    });

    it('decodes UNOY (UTF-8) correctly', () => {
      const content = "UNB+UNOY:3+S+R+260401:1200+1'LIN+1++café'";
      const buffer = Buffer.from(content, 'utf-8');
      expect(decodeDocumentBuffer(buffer, 'edifact')).toContain('café');
    });

    it('falls back to UTF-8 when no UNB header is present', () => {
      const content = "LIN+1++MILK'";
      const buffer = Buffer.from(content, 'utf-8');
      expect(decodeDocumentBuffer(buffer, 'edifact')).toContain('MILK');
    });

    it('falls back to UTF-8 for unknown charset codes (e.g. UNOD)', () => {
      const buffer = makeEdifact('UNOD', "LIN+1++ITEM'");
      // Does not throw — returns a string (possibly with mojibake for non-ASCII)
      expect(() => decodeDocumentBuffer(buffer, 'edifact')).not.toThrow();
    });
  });
});
