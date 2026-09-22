import { marlinDialect } from './dialects.js';
import { arcParameter, createArc, pathLength } from './geometry.js';
import type {
  AnalysisEvent,
  AnalyzeOptions,
  AxisSpeeds,
  Command,
  DiagnosticCategory,
  Dialect,
  MotionPath,
  Position,
  Vector3,
} from './types.js';

const axes = ['x', 'y', 'z'] as const;
const known = (position: Position): position is Vector3 =>
  axes.every((axis) => position[axis] !== null);
const emptyPosition = (): Position => ({ x: null, y: null, z: null });

/** Stateful command interpreter. Create one instance per file. */
export class Interpreter {
  private position: Position;
  private offset: Position = { x: 0, y: 0, z: 0 };
  private unit: number | null = 1;
  private absolute: boolean | null = true;
  private extruderAbsolute: boolean | null = true;
  private feedrate: number | null;
  private speedFactor: number | null = 1;
  private flowFactors = new Map<number, number>();
  private extrusionRegisters = new Map<number, number | null>();
  private volumetric = new Map<number, number>();
  private volumetricKnown = new Set<number>();
  private tool: number | null = 0;
  private plane = 'G17';
  private temperatureUnit: 'C' | 'F' | 'K' | null = 'C';
  private suspended = false;
  private uncertainTools = false;
  readonly dialect: Dialect;

  constructor(private readonly options: AnalyzeOptions = {}) {
    this.position = { ...emptyPosition(), ...options.initialPosition };
    this.feedrate = options.initialFeedrate ?? null;
    this.dialect = options.dialect ?? options.printer?.dialect ?? marlinDialect;
    this.extrusionRegisters.set(0, options.initialExtrusion ?? null);
  }
  get finalPosition(): Position {
    return { ...this.position };
  }

  /** Unknown commands may change modal state, origins and tool selection. */
  invalidate(): void {
    this.position = emptyPosition();
    this.offset = emptyPosition();
    this.unit = null;
    this.absolute = null;
    this.extruderAbsolute = null;
    this.feedrate = null;
    this.speedFactor = null;
    this.temperatureUnit = null;
    this.tool = null;
    this.uncertainTools = true;
    this.extrusionRegisters.clear();
    this.flowFactors.clear();
    this.volumetric.clear();
    this.volumetricKnown.clear();
    this.plane = 'unknown';
  }

  process(command: Command): AnalysisEvent[] {
    for (const adapter of this.options.adapters ?? []) {
      const translated = adapter.translate(command);
      if (translated !== undefined)
        return translated.flatMap((c) =>
          this.execute({ ...c, line: command.line }),
        );
    }
    return this.execute(command);
  }

  private execute(command: Command): AnalysisEvent[] {
    const events: AnalysisEvent[] = [];
    const { code, params: p, line } = command;
    const diagnostic = (
      id: string,
      message: string,
      category: DiagnosticCategory = 'coverage',
      severity: 'warning' | 'error' | 'info' = 'warning',
    ): void => {
      events.push({
        type: 'diagnostic',
        diagnostic: {
          code: id,
          message,
          category,
          severity,
          line,
          command: code,
        },
      });
    };
    const invalid = (message: string): AnalysisEvent[] => {
      diagnostic('INVALID_COMMAND', message, 'semantic', 'error');
      this.invalidate();
      return events;
    };
    const unsupported = (message: string): AnalysisEvent[] => {
      diagnostic('UNSUPPORTED_COMMAND', message);
      this.invalidate();
      return events;
    };
    const has = (key: string): boolean => Object.hasOwn(p, key);
    const value = (key: string): number | undefined => p[key] ?? undefined;
    const validate = (allowed: string, flags = ''): boolean => {
      for (const key of Object.keys(p)) {
        if (!allowed.includes(key)) {
          diagnostic(
            'UNSUPPORTED_PARAMETER',
            `${code} parameter ${key} is not modeled.`,
          );
          this.invalidate();
          return false;
        }
        if (p[key] === null && !flags.includes(key)) {
          diagnostic(
            'MISSING_VALUE',
            `${key} requires a numeric value.`,
            'semantic',
            'error',
          );
          this.invalidate();
          return false;
        }
      }
      return true;
    };
    if (this.suspended) return events;
    if (this.dialect.passiveCommands.includes(code)) return events;
    if (code === 'M400') {
      if (!validate(this.dialect.name === 'bambu' ? 'SPU' : '')) return events;
      if (has('U')) {
        this.suspended = true;
        return unsupported(
          'Bambu M400 U requires user interaction. Interpretation stops here.',
        );
      }
      const seconds = (value('S') ?? 0) + (value('P') ?? 0) / 1000;
      if (seconds < 0) return invalid('Wait duration cannot be negative.');
      if (seconds) events.push({ type: 'dwell', line, seconds });
      return events;
    }
    if (this.dialect.name === 'klipper' && code === 'G20')
      return invalid('Klipper does not support inch units.');
    // Branches, macros that invoke files, and repeated blocks cannot be interpreted sequentially.
    if (
      ['M622', 'M623', 'M808', 'M98', 'M99', 'M32', 'M24'].includes(code) ||
      code.startsWith('IF') ||
      code.startsWith('WHILE')
    ) {
      this.suspended = true;
      return unsupported(
        'Execution depends on unmodeled control flow. Interpretation stops here; syntax checking continues.',
      );
    }
    if (/^T\d+$/.test(code)) {
      if (!validate('')) return events;
      const id = Number(code.slice(1));
      if (id > 255)
        return unsupported(
          'Reserved or nonphysical tool selection requires a dialect adapter.',
        );
      if (
        this.options.printer?.tools &&
        !this.options.printer.tools.some((t) => t.id === id)
      ) {
        diagnostic(
          'UNKNOWN_TOOL',
          `Tool ${id} is absent from the printer profile.`,
          'constraint',
          'error',
        );
        this.tool = null;
        return events;
      }
      this.tool = id;
      events.push({ type: 'tool', line, tool: id });
      if (this.dialect.toolChange === 'unmodeled') {
        diagnostic(
          'TOOL_CHANGE_MOTION',
          'Tool selection is recorded, but parking, offsets and loading are not modeled.',
        );
        this.position = emptyPosition();
        this.offset = emptyPosition();
        this.extrusionRegisters.clear();
      }
      return events;
    }
    if (['G20', 'G21', 'G90', 'G91', 'M82', 'M83', 'G17'].includes(code)) {
      if (!validate('')) return events;
      if (code === 'G20' || code === 'G21')
        this.unit = code === 'G20' ? 25.4 : 1;
      else if (code === 'G17') this.plane = code;
      else if (code === 'G90' || code === 'G91') {
        this.absolute = code === 'G90';
        if (this.dialect.extrusionMode === 'marlin')
          this.extruderAbsolute = this.absolute;
      } else this.extruderAbsolute = code === 'M82';
      return events;
    }
    if (code === 'G18' || code === 'G19') {
      if (!validate('')) return events;
      this.plane = code;
      return events;
    }
    if (code === 'G28') {
      if (!validate('XYZ', 'XYZ')) return events;
      const selected = axes.filter((a) => has(a.toUpperCase()));
      for (const axis of selected.length ? selected : axes) {
        this.position[axis] =
          this.options.printer?.homePosition?.[axis] ?? null;
        this.offset[axis] = 0;
      }
      if (!known(this.position))
        diagnostic(
          'UNKNOWN_HOME',
          'Provide homePosition for each homed axis to resolve its machine coordinate.',
        );
      diagnostic(
        'HOMING_NOT_SIMULATED',
        'Only the configured home endpoint is modeled; the homing trajectory is excluded.',
        'coverage',
        'info',
      );
      return events;
    }
    if (code === 'G92') {
      if (!validate('XYZE')) return events;
      if (this.unit === null)
        return unsupported('Coordinate reset requires known distance units.');
      const resetAll = Object.keys(p).length === 0;
      for (const axis of axes)
        if (has(axis.toUpperCase()) || resetAll) {
          const coordinate = (value(axis.toUpperCase()) ?? 0) * this.unit;
          this.offset[axis] =
            this.position[axis] === null
              ? null
              : this.position[axis] - coordinate;
          if (this.offset[axis] === null)
            diagnostic(
              'UNKNOWN_ORIGIN',
              `G92 ${axis.toUpperCase()} cannot establish a machine position without a known current position.`,
            );
        }
      if (has('E') || resetAll) {
        if (this.tool === null)
          return unsupported('E reset requires a known tool.');
        this.extrusionRegisters.set(
          this.register(),
          (value('E') ?? 0) *
            (this.volumetric.has(this.tool) ? this.unit ** 3 : this.unit),
        );
      }
      return events;
    }
    if (code === 'M220' || code === 'M221') {
      if (!validate(code === 'M220' ? 'S' : 'ST')) return events;
      const percent = value('S');
      if (percent === undefined)
        return unsupported(
          'Override query/default forms require firmware-specific interpretation.',
        );
      if (percent < 0 || percent > 10000)
        return invalid('Override S must be between 0 and 10000 percent.');
      if (code === 'M220') this.speedFactor = percent / 100;
      else {
        const target = value('T') ?? this.tool;
        if (target === null)
          return unsupported('Flow override requires a known tool.');
        if (!Number.isInteger(target) || target < 0 || target > 255)
          return invalid('Invalid flow override tool.');
        this.flowFactors.set(target, percent / 100);
      }
      return events;
    }
    if (code === 'M200') {
      if (!validate('DT')) return events;
      const diameter = value('D');
      const target = value('T') ?? this.tool;
      if (diameter === undefined)
        return unsupported(
          'M200 query forms require firmware-specific interpretation.',
        );
      if (target === null) return unsupported('M200 requires a known tool.');
      if (
        diameter < 0 ||
        diameter > 100 ||
        !Number.isInteger(target) ||
        target < 0 ||
        target > 255
      )
        return invalid(
          'M200 requires a valid tool and D between 0 and 100 mm.',
        );
      if (this.unit === null)
        return unsupported('M200 requires known distance units.');
      this.volumetricKnown.add(target);
      if (diameter === 0) this.volumetric.delete(target);
      else
        this.volumetric.set(
          target,
          Math.PI * ((diameter * this.unit) / 2) ** 2,
        );
      return events;
    }
    if (code === 'M149') {
      if (!validate('CFK', 'CFK')) return events;
      const units = Object.keys(p);
      if (units.length !== 1)
        return invalid('M149 requires exactly one temperature unit.');
      this.temperatureUnit = units[0] as 'C' | 'F' | 'K';
      return events;
    }
    if (['M104', 'M109', 'M140', 'M190', 'M141', 'M191'].includes(code)) {
      const hotend = code === 'M104' || code === 'M109';
      const wait = ['M109', 'M190', 'M191'].includes(code);
      if (!validate(`${wait ? 'SR' : 'S'}${hotend ? 'T' : ''}`)) return events;
      if (has('S') && has('R'))
        return invalid('A temperature command cannot specify both S and R.');
      const target = value('S') ?? (wait ? value('R') : undefined);
      if (target === undefined)
        return unsupported(
          'Temperature commands without explicit targets require firmware-specific interpretation.',
        );
      if (this.temperatureUnit === null)
        return unsupported(
          'Temperature units are unknown after an unsupported command.',
        );
      const celsius =
        this.temperatureUnit === 'F'
          ? ((target - 32) * 5) / 9
          : this.temperatureUnit === 'K'
            ? target - 273.15
            : target;
      if (celsius < -273.15 || celsius > 10000)
        return invalid('Temperature target is outside the supported range.');
      const tool = value('T') ?? this.tool;
      if (
        hotend &&
        (tool === null || !Number.isInteger(tool) || tool < 0 || tool > 255)
      )
        return unsupported(
          'Temperature command has an unknown or invalid tool.',
        );
      const profile = this.options.printer?.tools?.find((t) => t.id === tool);
      const mappedHeater = has('T')
        ? this.options.printer?.heaterTargets?.[tool!]
        : undefined;
      if (hotend && this.options.printer?.tools && !profile && !mappedHeater)
        diagnostic(
          'UNKNOWN_TOOL',
          `Heater tool ${tool} is absent from the printer profile.`,
          'constraint',
          'error',
        );
      events.push({
        type: 'temperature',
        line,
        heater: hotend
          ? (mappedHeater ?? profile?.heater ?? `tool:${tool}`)
          : ['M140', 'M190'].includes(code)
            ? 'bed'
            : 'chamber',
        target: celsius,
        wait,
      });
      return events;
    }
    if (code === 'G4') {
      if (!validate('PS')) return events;
      if (has('P') && has('S'))
        return invalid('Specify one dwell duration, P or S.');
      const seconds = value('S') ?? (value('P') ?? 0) / 1000;
      if (seconds < 0) return invalid('Dwell duration cannot be negative.');
      events.push({ type: 'dwell', line, seconds });
      return events;
    }
    if (['M201', 'M203', 'M204', 'M205'].includes(code)) {
      if (
        !validate(
          code === 'M204' ? 'PRST' : code === 'M205' ? 'BESXYZJ' : 'XYZE',
        )
      )
        return events;
      if (Object.values(p).some((v) => v !== null && v < 0))
        return invalid('Planner settings cannot be negative.');
      diagnostic(
        'PLANNER_SETTINGS',
        'Planner settings do not change the reported requested speeds or constant-feed duration.',
        'coverage',
        'info',
      );
      return events;
    }
    if (code === 'M18' || code === 'M84') {
      if (!validate('XYZES', 'XYZE')) return events;
      if (!has('S')) this.position = emptyPosition();
      return events;
    }
    if (code === 'M211' || code === 'M302') {
      diagnostic(
        'SAFETY_OVERRIDE',
        `${code} changes firmware safety protections.`,
        'constraint',
        'error',
      );
      return unsupported('Safety protection settings are not simulated.');
    }
    if (['M0', 'M1', 'M25', 'M600', 'M112', 'M2', 'M30'].includes(code)) {
      this.suspended = true;
      return unsupported(
        'Stop, pause or filament-change execution requires runtime information. Interpretation stops here.',
      );
    }
    if (!['G0', 'G1', 'G2', 'G3'].includes(code))
      return unsupported(`${code} has no registered interpretation.`);
    const isArc = code === 'G2' || code === 'G3';
    if (!validate(isArc ? 'XYZEFIJR' : 'XYZEF')) return events;
    if (this.unit === null || this.absolute === null)
      return unsupported('Movement units or positioning mode are unknown.');
    if (value('F') !== undefined) {
      if (value('F')! <= 0) return invalid('Feedrate must be positive.');
      this.feedrate = (value('F')! * this.unit) / 60;
    }
    if (!isArc && !'XYZE'.split('').some(has)) return events;
    if (isArc && this.plane !== 'G17')
      return unsupported('Only XY arcs are modeled in this release.');
    const start = { ...this.position };
    const end = { ...start };
    for (const axis of axes) {
      const coordinate = value(axis.toUpperCase());
      if (coordinate !== undefined) {
        const base = this.absolute ? this.offset[axis] : start[axis];
        end[axis] = base === null ? null : base + coordinate * this.unit;
      }
    }
    let extrusion: number | null = 0;
    if (has('E')) {
      if (this.tool === null) extrusion = null;
      else {
        const register = this.register();
        const previous = this.extrusionRegisters.get(register) ?? null;
        const area = this.volumetric.get(this.tool);
        const requested =
          value('E')! * (area === undefined ? this.unit : this.unit ** 3);
        const mode =
          this.dialect.extrusionMode === 'relative-override'
            ? this.extruderAbsolute === null
              ? null
              : this.absolute && this.extruderAbsolute
            : this.extruderAbsolute;
        const delta =
          mode === null || (mode && previous === null)
            ? null
            : mode
              ? requested - previous!
              : requested;
        this.extrusionRegisters.set(
          register,
          mode === null
            ? null
            : mode
              ? requested
              : previous === null
                ? null
                : previous + requested,
        );
        const flow =
          this.flowFactors.get(this.tool) ?? (this.uncertainTools ? null : 1);
        extrusion =
          delta === null ||
          flow === null ||
          (this.uncertainTools && !this.volumetricKnown.has(this.tool))
            ? null
            : (delta / (area ?? 1)) * flow;
      }
      if (extrusion === null)
        diagnostic(
          'UNKNOWN_EXTRUSION',
          'Extrusion needs a known tool, E mode, flow multiplier and absolute E baseline.',
        );
    }
    let path: MotionPath | null = null;
    if (known(start) && known(end)) {
      if (isArc) {
        try {
          path = createArc(start, end, code === 'G2', {
            ...(has('I') ? { i: value('I')! * this.unit } : {}),
            ...(has('J') ? { j: value('J')! * this.unit } : {}),
            ...(has('R') ? { r: value('R')! * this.unit } : {}),
          });
        } catch (error) {
          return invalid(
            error instanceof Error ? error.message : 'Invalid arc.',
          );
        }
      } else path = { kind: 'line', start, end };
    } else
      diagnostic(
        'UNKNOWN_POSITION',
        'The full motion path cannot be resolved from known machine coordinates.',
      );
    this.position = { ...end };
    const distance = path === null ? null : pathLength(path);
    const feedrate =
      this.feedrate === null || this.speedFactor === null
        ? null
        : this.feedrate * this.speedFactor;
    // Pure E moves use filament distance as their timing reference.
    const timingDistance =
      distance === null
        ? null
        : distance > 0
          ? distance
          : extrusion === null
            ? null
            : Math.abs(extrusion);
    const duration =
      timingDistance === 0
        ? 0
        : feedrate === null || feedrate === 0 || timingDistance === null
          ? null
          : timingDistance / feedrate;
    if (duration === null)
      diagnostic(
        'UNKNOWN_DURATION',
        'Move duration and axis speeds require a resolved path, E delta and positive feedrate.',
      );
    let axisSpeeds: AxisSpeeds | null = null;
    if (duration !== null && path !== null) {
      axisSpeeds = { x: 0, y: 0, z: 0, e: 0 };
      if (duration > 0) {
        for (const axis of axes)
          axisSpeeds[axis] =
            Math.abs(path.end[axis] - path.start[axis]) / duration;
        axisSpeeds.e = Math.abs(extrusion ?? 0) / duration;
        if (path.kind === 'arc') {
          const angularSpeed = Math.abs(path.sweep) / duration;
          let sin = Math.max(
            Math.abs(Math.sin(path.startAngle)),
            Math.abs(Math.sin(path.startAngle + path.sweep)),
          );
          let cos = Math.max(
            Math.abs(Math.cos(path.startAngle)),
            Math.abs(Math.cos(path.startAngle + path.sweep)),
          );
          if (
            [Math.PI / 2, Math.PI * 1.5].some(
              (a) => arcParameter(path, a) !== null,
            )
          )
            sin = 1;
          if ([0, Math.PI].some((a) => arcParameter(path, a) !== null)) cos = 1;
          axisSpeeds.x = path.radius * angularSpeed * sin;
          axisSpeeds.y = path.radius * angularSpeed * cos;
        }
      }
    }
    const computed = [
      ...Object.values(end),
      extrusion,
      feedrate,
      distance,
      duration,
      ...Object.values(axisSpeeds ?? {}),
    ];
    if (
      computed.some((value) => value !== null && !Number.isFinite(value)) ||
      (timingDistance !== null && timingDistance > 0 && duration === 0)
    )
      return invalid(
        'Movement exceeds the supported numeric precision or range.',
      );
    if (this.tool === null)
      diagnostic(
        'UNKNOWN_ACTIVE_TOOL',
        'Movement cannot be attributed to a known tool.',
      );
    events.push({
      type: 'move',
      line,
      tool: this.tool ?? -1,
      start,
      end,
      path,
      distance,
      extrusion,
      feedrate,
      duration,
      axisSpeeds,
    });
    return events;
  }
  private register(): number {
    return this.dialect.extrusionRegisters === 'shared' ? 0 : (this.tool ?? -1);
  }
}
