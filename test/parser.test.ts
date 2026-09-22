import { describe, expect, it } from 'vitest';
import { parseLine } from '../src/index.js';

describe('line parser', () => {
  it('ignores checksum markers inside parenthesized comments', () => {
    expect(parseLine('G1 X1 (2 * 3)').diagnostics).toEqual([]);
  });
  it('retains proprietary Bambu payloads for adapters', () => {
    expect(parseLine('M1002 gcode_claim_action : 0').command).toMatchObject({
      code: 'M1002',
      payload: 'gcode_claim_action : 0',
    });
  });
  it.each(['', '; comment', '(comment)', '%', '\uFEFF; comment'])(
    'accepts non-executable lines: %s',
    (line) => {
      expect(parseLine(line)).toEqual({ command: null, diagnostics: [] });
    },
  );
  it('parses compact, signed, fractional and case-insensitive words', () => {
    expect(
      parseLine('n42g01x+.5Y-2.25e3f1200 ; ignored').command,
    ).toMatchObject({
      code: 'G1',
      params: { X: 0.5, Y: -2.25, E: 3, F: 1200 },
    });
  });
  it('separates parenthesized comments and bare flags', () => {
    expect(parseLine('G28 X (home x) Y0').command?.params).toEqual({
      X: null,
      Y: 0,
    });
  });
  it('preserves a named command payload for an adapter', () => {
    expect(
      parseLine('SET_HEATER_TEMPERATURE HEATER=extruder TARGET=220').command,
    ).toMatchObject({
      code: 'SET_HEATER_TEMPERATURE',
      payload: 'HEATER=extruder TARGET=220',
    });
  });
  it('preserves display text', () => {
    expect(parseLine('M117 Printing layer 4').command?.payload).toBe(
      'Printing layer 4',
    );
  });
  it('validates RepRap XOR checksums', () => {
    const line = 'N12 G1 X20';
    const checksum = [...line].reduce(
      (sum, char) => sum ^ char.charCodeAt(0),
      0,
    );
    expect(parseLine(`${line}*${checksum}`).diagnostics).toEqual([]);
    expect(parseLine(`${line}*${checksum ^ 1}`).diagnostics[0]?.severity).toBe(
      'error',
    );
  });
  it.each([
    'G1 X1 X2',
    'G1 X1.2.3',
    'G1 X{value}',
    'G1 (oops',
    'G1 )',
    'G1 ((nested))',
    '\0G1',
    'G1*999',
    'G1 X99999999999999999999999',
    '123',
    'G1*abc',
  ])('rejects malformed input: %s', (line) => {
    const parsed = parseLine(line, 7);
    expect(parsed.command).toBeNull();
    expect(parsed.diagnostics[0]).toMatchObject({ severity: 'error', line: 7 });
  });
  it('does not treat a checksum marker inside a semicolon comment as data', () => {
    expect(parseLine('G1 X1 ; *99').diagnostics).toEqual([]);
  });
});
