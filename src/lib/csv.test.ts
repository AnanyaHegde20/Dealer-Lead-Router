import { describe, expect, it } from 'vitest';
import { csvToObjects, parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a trailing newline from creating an empty row', () => {
    expect(parseCsv('a\n1\n')).toEqual([
      ['a'],
      ['1'],
    ]);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('id,name\n1,"Smith, ""Jr"""\n')).toEqual([
      ['id', 'name'],
      ['1', 'Smith, "Jr"'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('csvToObjects', () => {
  it('keys rows by the header', () => {
    expect(csvToObjects('lead_id,name\nL1,Ravi\n')).toEqual([
      { lead_id: 'L1', name: 'Ravi' },
    ]);
  });

  it('fills missing cells with empty strings', () => {
    expect(csvToObjects('a,b,c\n1,2\n')).toEqual([{ a: '1', b: '2', c: '' }]);
  });
});
