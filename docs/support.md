# Supported behavior

## Result semantics

| Field         | Values                                            | Meaning                                                                                                                                                            |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validity`    | `valid`, `invalid`, `unknown`                     | Validity within the supported grammar and interpreter. A definite syntax or semantic error takes precedence. Unsupported commands or parameters yield `unknown`.   |
| `constraints` | `passed`, `violated`, `unknown`, `not-configured` | Results for supplied constraints. Detected violations take precedence over incomplete coverage.                                                                    |
| `complete`    | boolean                                           | Whether all relevant effects were resolved within the model's assumptions. Informational limitations, such as omitted homing trajectories, do not make this false. |

`validity: 'valid'` can accompany `complete: false`, for example when a syntactically valid move starts from an unknown position. `constraints: 'passed'` does not mean every category of constraint was configured. A profile containing only a temperature limit checks only that limit.

An empty or comment-only program is invalid. Diagnostics use one-based physical line numbers; line zero denotes a whole-input finding. Checksum line numbers do not replace physical line numbers. Transmission sequence continuity is not checked.

## Commands

| Commands                                                            | Behavior                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `G0`, `G1`                                                          | Cartesian linear XYZE motion, modal F in current distance units per minute. G0 shares the G1 feedrate.                              |
| `G2`, `G3`                                                          | XY arcs using relative I/J centers or signed R, full circles with I/J, and helical Z interpolation.                                 |
| `G17`, `G18`, `G19`                                                 | Plane state. Only G17 arc geometry is implemented. An arc in another plane is unsupported.                                          |
| `G20`, `G21`                                                        | Inches and millimeters. Klipper rejects G20.                                                                                        |
| `G90`, `G91`, `M82`, `M83`                                          | XYZ and extrusion modes according to the chosen dialect.                                                                            |
| `G92`                                                               | Logical coordinate rebasing. Machine coordinates are preserved. A reset cannot establish an unknown physical position.              |
| `G28`                                                               | Profile-specified homing endpoints, including individual axes. No homing trajectory or probing simulation.                          |
| `G4`                                                                | Explicit dwell with P milliseconds or S seconds.                                                                                    |
| `M104`, `M109`                                                      | Hotend targets, optional T selection; M109 also accepts R.                                                                          |
| `M140`, `M190`, `M141`, `M191`                                      | Bed and chamber targets; waiting commands accept S or R.                                                                            |
| `M149`                                                              | Celsius, Fahrenheit and Kelvin target conversion.                                                                                   |
| `M200 D… [T…]`                                                      | Volumetric E conversion with D diameter; D0 disables it. Extended S/L forms are unsupported.                                        |
| `M220 S…`                                                           | Requested speed multiplier. S0 makes nonzero move duration unresolved. Save/restore forms are unsupported.                          |
| `M221 S… [T…]`                                                      | Per-tool flow multiplier. Bambu's additional endstop-control forms are unsupported.                                                 |
| `M201`, `M203`, `M204`, `M205`                                      | Recognized planner configuration. Limits and acceleration are not applied to requested-speed metrics.                               |
| `M18`, `M84`                                                        | Disabling motors invalidates the known position. S schedules a timeout without immediate invalidation.                              |
| `M400`                                                              | Synchronization. Bambu S/P durations are included; Bambu U pauses stop interpretation.                                              |
| `T0` through `T255`                                                 | Tool selection; profile membership is checked. Tool-change motion is unmodeled by default. Reserved Bambu selections need adapters. |
| `M73`, `M105` through `M107`, `M110`, `M114` through `M119`, `M300` | Ancillary/reporting commands. Their parameters and physical effects are outside the analysis model.                                 |

Not every firmware implements every listed command. Dialects describe the analysis semantics; they are not comprehensive firmware capability databases. Except for specifically checked differences, `valid` does not establish that a particular firmware build accepts a command.

The parser supports compact words, signs, decimal fractions, lowercase commands, semicolon comments, single-level parenthesized comments, N line numbers, XOR checksums, BOMs, and LF/CRLF/CR line endings. It retains text payloads for display, file-selection and Bambu M1002 commands. Named macro payloads are available to adapters.

One command is expected per physical line. Modal command omission, multi-command CNC blocks, expressions, scientific notation and nested comments are outside the grammar. `G1 X1E3` means X=1 and E=3, not scientific notation. Numeric words have an absolute limit of 10¹². Binary G-code and 3MF containers require a separate decoder or extractor.

## Extrusion modes

| Dialect mode        | G90/G91                                        | M82                   | M83               |
| ------------------- | ---------------------------------------------- | --------------------- | ----------------- |
| `marlin`            | Also sets E mode and clears its override       | Forces absolute E     | Forces relative E |
| `relative-override` | Changes global coordinates; does not clear M83 | E follows global mode | Forces relative E |
| `independent`       | Changes XYZ only                               | Absolute E            | Relative E        |

The Marlin preset uses `marlin`. Klipper and Bambu use `relative-override`. The Bambu choice follows Bambu Studio's processor, which is a slicer-side reference rather than a specification for every firmware release.

Initial E is unknown unless `initialExtrusion` is supplied or G92 establishes it. Relative E can be measured without a prior E baseline. Positive E includes priming, unretraction and deposition; `extruded` is not a model-material estimate. Flow multipliers affect measured filament deltas. Volumetric extrusion is converted to filament length before it contributes to output metrics.

## Unsupported operations and recovery

An unsupported command or parameter emits a coverage diagnostic and invalidates modal, tool and coordinate state. Subsequent explicit state-setting commands can recover individual fields. Coverage remains incomplete for the whole report. A complete spatial recovery normally needs G21, G90, a profiled G28, M220 S100 and a new feedrate. E recovery additionally needs a known tool, M82/M83, M221, M200 and, for absolute E, G92 E.

Unmodeled conditional/repeat/file-execution commands stop interpretation for the remaining input. Parsing still continues to find syntax errors. This includes Bambu M622/M623, M808 and M98/M99. Pause and stop commands also stop interpretation because the resumed state is unknown. An adapter may replace a command only when its behavior is known for the target machine.

Bed leveling, firmware retraction, tool offsets, workspaces, mesh compensation, pressure advance, macros, independent-carriage mirror/copy motion, nonlinear kinematics and vendor calibration operations are not simulated. Unrecognized versions remain visible as unsupported commands.

## Geometry and physical limits

Arcs use analytic extrema and line/circle intersections with polygon edges. Z limits are evaluated at boundary crossings and interval interiors. There is no fixed-step chord approximation. Geometry uses an absolute comparison tolerance of 10⁻⁷ mm. Arc endpoint radius mismatch is rejected above the larger of 0.001 mm and 10⁻⁵ times the radius; accepted arcs follow the starting radius and preserve the requested endpoint.

The geometry model covers the active tool tip. It does not model nozzle width, carriage extent, gantry clearance, inactive extruders or deposited material. It cannot detect every collision, mechanical fault, firmware protection failure or thermal fault.

Temperature ranges are commanded targets, not measured temperatures. Heater-off targets are included in `targets` and omitted from `activeTargets`. A low target before extrusion can violate a configured minimum; a high target does not prove that the nozzle has warmed up. The analyzer does not simulate heater ramp rates.

Speeds are absolute magnitudes of requested axis velocities. Linear XYZ components derive from path length and feedrate. Arc components use tangent extrema. Pure E moves use filament distance. Firmware may clamp these requests; this analyzer still reports and checks the requests. Constant-feed duration excludes acceleration, heater waits, homing and unmodeled operations and is not a print-time prediction.
