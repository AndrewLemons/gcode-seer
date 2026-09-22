import { describe, expect, it } from 'vitest';
import {
  analyze,
  bambuDialect,
  klipperDialect,
  marlinDialect,
} from '../src/index.js';
import type {
  AnalyzeOptions,
  Dialect,
  MoveEvent,
  PrinterProfile,
} from '../src/index.js';

const origin = { x: 0, y: 0, z: 0 };
const base: AnalyzeOptions = { initialPosition: origin, initialExtrusion: 0 };
const logical: Dialect = { ...marlinDialect, toolChange: 'logical' };
const printer: PrinterProfile = {
  name: 'test',
  homePosition: origin,
  travelBounds: { min: origin, max: { x: 100, y: 100, z: 100 } },
};
const codes = (text: string, options: AnalyzeOptions = base): string[] =>
  analyze(text, options).diagnostics.map((d) => d.code);

describe('motion state', () => {
  it('reports a provable axis violation even when other axes are unknown', () => {
    const report = analyze('G1 X101 F600', { printer });
    expect(report.constraints).toBe('violated');
    expect(report.complete).toBe(false);
  });
  it('rejects arithmetic overflow without putting infinity in a report', () => {
    const report = analyze(`G1 X10 F0.${'0'.repeat(310)}1`, base);
    expect(report.validity).toBe('invalid');
    expect(report.moves).toBe(0);
    expect(Number.isFinite(report.nominalDuration)).toBe(true);
  });
  it('resolves relative XYZ, absolute XYZ, G92 physical origins and unit changes', () => {
    const report = analyze(
      'G1 X10 Y20 Z1 F600\nG92 X0\nG1 X5\nG91\nG1 X2 Z3\nG90\nG1 X1',
      base,
    );
    expect(report.finalPosition).toEqual({ x: 11, y: 20, z: 4 });
    expect(report.bounds?.max.x).toBe(17);
    expect(report.validity).toBe('valid');
  });
  it('normalizes inch positions, E and feedrate without scaling stored positions twice', () => {
    const report = analyze('G20\nG1 X1 E1 F60\nG21\nG1 X50.8 E50.8', base);
    expect(report.finalPosition.x).toBeCloseTo(50.8);
    expect(report.maxAxisSpeed.x).toBeCloseTo(25.4);
    expect(report.tools[0]?.extruded).toBeCloseTo(50.8);
    expect(report.nominalDuration).toBeCloseTo(2);
  });
  it('uses vector components for simultaneous motion', () => {
    const report = analyze('G1 X3 Y4 E1 F600', base);
    expect(report.maxAxisSpeed).toEqual({ x: 6, y: 8, z: 0, e: 2 });
    expect(report.nominalDuration).toBe(0.5);
    expect(report.distance.total).toBe(5);
  });
  it('tracks Z speed, pure E motion, retractions and zero-length moves', () => {
    const report = analyze('M83\nG1 Z10 F120\nG1 E-2 F600\nG1 E4\nG1 X0', base);
    expect(report.maxAxisSpeed.z).toBe(2);
    expect(report.maxAxisSpeed.e).toBe(10);
    expect(report.tools[0]).toMatchObject({
      retracted: 2,
      extruded: 4,
      netExtrusion: 2,
    });
    expect(report.nominalDuration).toBeCloseTo(5.6);
  });
  it('applies M220 to modal feedrate and M221 to extrusion deltas', () => {
    const report = analyze(
      'M221 S150\nG1 X10 E2 F600\nM220 S50\nG1 X20 E4',
      base,
    );
    expect(report.tools[0]?.extruded).toBe(6);
    expect(report.maxAxisSpeed.e).toBe(3);
    expect(report.nominalDuration).toBe(3);
  });
  it('uses Marlin mode overrides that clear on G90/G91', () => {
    expect(analyze('M83\nG1 E2 F60\nG90\nG1 E3', base).tools[0]?.extruded).toBe(
      3,
    );
    expect(analyze('G91\nM82\nG1 E2 F60\nG1 E3', base).tools[0]?.extruded).toBe(
      3,
    );
  });
  it.each([klipperDialect, bambuDialect])(
    'uses relative override semantics for $name',
    (dialect) => {
      expect(
        analyze('M83\nG1 E2 F60\nG90\nG1 E3', { ...base, dialect }).tools[0]
          ?.extruded,
      ).toBe(5);
      expect(
        analyze('G91\nM82\nG1 E2 F60\nG1 E3', { ...base, dialect }).tools[0]
          ?.extruded,
      ).toBe(5);
    },
  );
  it('supports an independently configured E mode', () => {
    expect(
      analyze('G91\nM82\nG1 E2 F60\nG1 E3', {
        ...base,
        dialect: { ...logical, extrusionMode: 'independent' },
      }).tools[0]?.extruded,
    ).toBe(3);
  });
  it('rejects inches for Klipper', () => {
    expect(analyze('G20', { dialect: klipperDialect }).validity).toBe(
      'invalid',
    );
  });
  it('does not invent a starting position or feedrate', () => {
    const report = analyze('G1 X10 Y10 Z0\nG1 X20', { printer });
    expect(report.complete).toBe(false);
    expect(report.constraints).toBe('unknown');
    expect(report.distance.total).toBe(10);
    expect(report.maxAxisSpeed.x).toBe(0);
    expect(report.diagnostics.map((d) => d.code)).toContain('UNKNOWN_POSITION');
  });
  it('never interprets G92 as physical movement or homing', () => {
    const report = analyze('G92 X0 Y0 Z0\nG1 X100 Y100 Z10 F600');
    expect(report.finalPosition).toEqual({ x: null, y: null, z: null });
    expect(report.bounds).toBeNull();
    expect(report.complete).toBe(false);
  });
  it('uses configured home coordinates for selected axes', () => {
    const report = analyze('G28 X Y\nG1 X10 Y10 F600', {
      ...base,
      printer: { ...printer, homePosition: { x: 2, y: 3 } },
    });
    expect(report.bounds?.min).toEqual({ x: 2, y: 3, z: 0 });
    expect(report.complete).toBe(true);
  });
  it('reports missing homing positions', () => {
    expect(codes('G28')).toContain('UNKNOWN_HOME');
  });
  it('invalidates position after steppers are disabled', () => {
    expect(codes('M84\nG1 X10 F600')).toContain('UNKNOWN_POSITION');
    expect(codes('M84 S30\nG1 X10 F600')).not.toContain('UNKNOWN_POSITION');
  });
  it('does not count feed-only lines as movement', () => {
    expect(analyze('G1 F600', base).moves).toBe(0);
  });
  it.each([
    'G1 X',
    'G1 F0',
    'G1 F-1',
    'G4 S-1',
    'M220 S-1',
    'M109 S200 R210',
    'M149 C F',
    'G2 X1 Y1 R.1',
    'G2 X2 I0 J0',
  ])('rejects invalid commands: %s', (text) => {
    expect(analyze(text, base).validity).toBe('invalid');
  });
  it('does not count a rejected arc as motion', () => {
    const report = analyze('G2 X10 Y0 R1 E100 F600', base);
    expect(report.moves).toBe(0);
    expect(report.tools[0]).toBeUndefined();
    expect(report.finalPosition.x).toBeNull();
  });
});

describe('temperatures and tools', () => {
  it('separates heater-off and active ranges, bed, chamber and targeted tools', () => {
    const report = analyze(
      'M104 S200\nM109 R220\nM104 S0\nM140 S60\nM190 R65\nM141 S45\nM191 S50\nM104 T1 S240',
    );
    expect(report.temperatures['tool:0']).toEqual({
      targets: { min: 0, max: 220 },
      activeTargets: { min: 200, max: 220 },
      finalTarget: 0,
      commands: 3,
      waits: 1,
    });
    expect(report.temperatures.bed?.targets).toEqual({ min: 60, max: 65 });
    expect(report.temperatures.chamber?.targets.max).toBe(50);
    expect(report.temperatures['tool:1']?.finalTarget).toBe(240);
  });
  it('normalizes Fahrenheit and Kelvin', () => {
    const report = analyze('M149 F\nM104 S392\nM149 K\nM104 S473.15');
    expect(report.temperatures['tool:0']?.targets.min).toBeCloseTo(200);
    expect(report.temperatures['tool:0']?.targets.max).toBeCloseTo(200);
  });
  it('supports shared and independent tool E registers', () => {
    const program = 'G1 E10 F600\nT1\nG92 E0\nG1 E3\nT0\nG1 E12';
    expect(
      analyze(program, { ...base, dialect: logical }).tools[0]?.extruded,
    ).toBe(19);
    expect(
      analyze(program, {
        ...base,
        dialect: { ...logical, extrusionRegisters: 'per-tool' },
      }).tools[0]?.extruded,
    ).toBe(12);
  });
  it('shares physical heater state across material tools and accepts separate heater selectors', () => {
    const report = analyze('M104 T2 S230\nT1\nG92 E0\nG1 E2 F120', {
      ...base,
      dialect: logical,
      printer: {
        name: 'dual',
        heaterTargets: { 2: 'right' },
        tools: [
          { id: 0, heater: 'left' },
          { id: 1, heater: 'right', minExtrusionTemperature: 180 },
        ],
      },
    });
    expect(report.temperatures.right?.finalTarget).toBe(230);
    expect(report.tools[1]?.extruded).toBe(2);
    expect(report.constraints).toBe('passed');
  });
  it('flags tool changes with unmodeled movement and reserved tool IDs', () => {
    expect(codes('T1')).toContain('TOOL_CHANGE_MOTION');
    expect(codes('T255\nT1000')).toContain('UNSUPPORTED_COMMAND');
  });
  it('converts volumetric E into filament length', () => {
    const area = Math.PI;
    const report = analyze(
      `M200 D2\nM83\nG1 X10 E${area * 2} F600\nM200 D0\nG1 X20 E2`,
      base,
    );
    expect(report.tools[0]?.extruded).toBeCloseTo(4);
    expect(report.maxAxisSpeed.e).toBeCloseTo(2);
  });
  it('models Bambu wait durations and stops at interactive pauses', () => {
    expect(
      analyze('M400 S2 P500\nG4 P500', { dialect: bambuDialect })
        .nominalDuration,
    ).toBe(3);
    expect(
      analyze('M400 U1\nG1 X10 F600', { ...base, dialect: bambuDialect }).moves,
    ).toBe(0);
  });
});

describe('coverage and extensibility', () => {
  it.each([
    'M104',
    'M109',
    'M220',
    'M221',
    'M200',
    'G999\nM221 S100',
    'G999\nM200 D0',
  ])(
    'does not mistake firmware-specific forms or missing state for proven invalidity: %s',
    (program) => {
      expect(analyze(program, base).validity).toBe('unknown');
    },
  );
  it('keeps validity separate from constraints', () => {
    const report = analyze('G1 X101 F600', { ...base, printer });
    expect(report.validity).toBe('valid');
    expect(report.constraints).toBe('violated');
  });
  it('keeps unsupported code explicit and invalidates modal state', () => {
    const report = analyze('G1 X10 F600\nG999\nG1 X20 F600', {
      ...base,
      printer,
    });
    expect(report.validity).toBe('unknown');
    expect(report.constraints).toBe('unknown');
    expect(report.finalPosition.x).toBeNull();
    expect(report.distance.total).toBe(10);
  });
  it('stops interpreting after unknown branches but still parses syntax', () => {
    const report = analyze('M622 J1\nG1 X100 F600\nM623\nG1 X1 X2', base);
    expect(report.moves).toBe(0);
    expect(report.validity).toBe('invalid');
  });
  it('does not silently ignore unsupported parameters or planes', () => {
    expect(analyze('G1 X1 A90', base).validity).toBe('unknown');
    expect(analyze('G18\nG2 X1 Z1 I1', base).complete).toBe(false);
  });
  it('caps retained diagnostics without hiding validity or violations', () => {
    const report = analyze('G1 X101 F600\nG1 X102\nG1 X1 X2', {
      ...base,
      printer,
      maxDiagnostics: 0,
    });
    expect(report.validity).toBe('invalid');
    expect(report.constraints).toBe('violated');
    expect(report.diagnostics).toEqual([]);
    expect(report.droppedDiagnostics).toBe(3);
  });
  it('requires an executable program', () => {
    expect(analyze('; only comments').validity).toBe('invalid');
  });
  it('runs adapters and preserves source line numbers', () => {
    const moves: MoveEvent[] = [];
    const report = analyze('; header\nCUSTOM_MOVE', {
      ...base,
      adapters: [
        {
          name: 'custom',
          translate: (c) =>
            c.code === 'CUSTOM_MOVE'
              ? [{ ...c, code: 'G1', params: { X: 10, F: 600 }, line: 999 }]
              : undefined,
        },
      ],
      onEvent: (event) => {
        if (event.type === 'move') moves.push(event);
      },
    });
    expect(report.finalPosition.x).toBe(10);
    expect(moves[0]?.line).toBe(2);
  });
  it('supports custom event rules', () => {
    const report = analyze('G1 X10 F600', {
      ...base,
      rules: [
        {
          name: 'no-moves',
          onEvent: (event) =>
            event.type === 'move'
              ? [
                  {
                    code: 'CUSTOM',
                    line: event.line,
                    category: 'constraint',
                    severity: 'error',
                    message: 'No moves permitted.',
                  },
                ]
              : [],
        },
      ],
    });
    expect(report.constraints).toBe('violated');
  });
  it('serializes to JSON without infinities or NaN', () => {
    const report = analyze('G1 X0 F600\nM104 S0', base);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
