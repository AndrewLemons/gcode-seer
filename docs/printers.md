# Printer catalog

Reviewed September 22, 2026: 52 FFF profiles and four discoverable resin models. [Research and source revisions](printer-research.md) explain each family's geometry, firmware semantics, thermal limits and unresolved details. This is static tool-tip and target analysis, not firmware emulation or physical-printer certification.

```ts
import { analyze, createPrinterProfile, listPrinterProfiles } from "gcode-seer";

const catalog = listPrinterProfiles(); // Or filter by "Bambu Lab" / "Prusa".
const printer = createPrinterProfile("prusa-mk4s", { multiMaterial: "mmu3" });
const report = analyze("M104 S291", { printer });
console.log(report.constraints); // "violated"
console.log(printer.provenance); // ID, manufacturer, review date, sources, notes.
```

Catalog objects and created profiles are independent copies. No profile discovery or analysis accesses the network. Select the intended printer explicitly; slicer comments are not trusted configuration. Use `available` and `technology` when presenting choices. Resin creation throws an explanatory error; `.sl1`/`.sl1s` exposure archives need a separate analyzer. Extract Bambu G-code archives and decode Prusa binary G-code before calling the text APIs.

## Installed hardware and job mappings

```ts
const xl = createPrinterProfile("prusa-xl", { toolCount: 5 });
const indx = createPrinterProfile("prusa-core-one-plus-gen2-indx", { toolCount: 8 });
const mmu = createPrinterProfile("prusa-mk3s-plus", { multiMaterial: "mmu3" });
const x1 = createPrinterProfile("bambu-x1-carbon", { supplyVoltage: 220 });
const ht90 = createPrinterProfile("prusa-ht90-high-temperature");

// Material T0 prints with the left nozzle; material T3 with the right nozzle.
const dual = createPrinterProfile("bambu-h2d", { materialTools: { 0: 0, 3: 1 } });
// An AMS job on a single-nozzle machine: both materials share one hotend.
const ams = createPrinterProfile("bambu-a1", { materialTools: { 0: 0, 3: 0 } });
// A known Prusa XL job mapping from G-code tools to installed physical tools.
const mappedXL = createPrinterProfile("prusa-xl", {
	toolCount: 5,
	materialTools: { 0: 4, 1: 2 },
});
```

| Option          | Meaning and defaults                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolCount`     | Installed physical tools: XL 1/2/5 (default 1), INDX 4/8 (default 4). Bambu dual printers always have two physical extruders.                                                                                                                                    |
| `multiMaterial` | Supported `mmu1`, `mmu2`, `mmu2s`, `mmu3` upgrade, as listed in catalog metadata. MMU1 defines four material tools; others define five. All share one heater. Absent by default.                                                                                 |
| `materialTools` | Job G-code T ID → zero-based physical tool index. Nonempty, integer keys 0–254, with installed extruder values. Bambu physical 0=left/main, 1=right/auxiliary. For Prusa this also maps explicit temperature selectors. Cannot be combined with `multiMaterial`. |
| `supplyVoltage` | X1/X1 Carbon/X1E 110 or 220 V specification class; bed cap is 120 or 110 °C respectively. If omitted, the bed cap stays unconfigured. Other printers reject this option.                                                                                         |

By default, single-nozzle printers expose T0, XL/INDX expose each installed tool, and Bambu dual printers leave material tools unassigned. For a dual Bambu job without a mapping, explicit physical heater targets and the union print box can be checked, but per-nozzle coverage and implicit temperatures remain unknown. Bambu `M104/M109 T1` selects left/main and `T0` selects right/auxiliary; these are distinct from material T IDs. Unknown physical heater selectors are errors.

Tool selection and parking can invoke hidden motion. The analyzer preserves that uncertainty even when the mapping is known. XL T5, INDX T8 and Bambu T255 are non-printing selections, not extra print tools. INDX tool target registers do not imply parked passive nozzles can heat independently. H2C hotend exchange, AMS loading, mesh compensation and runtime conditionals remain unmodeled.

## Profile IDs

All Bambu IDs start with `bambu-`:

| Family | ID suffixes                     |
| ------ | ------------------------------- |
| A      | `a1-mini`, `a1`, `a2l`          |
| P      | `p1p`, `p1s`, `p2s`             |
| X      | `x1`, `x1-carbon`, `x1e`, `x2d` |
| H      | `h2s`, `h2d`, `h2d-pro`, `h2c`  |

All Prusa IDs start with `prusa-`:

| Family              | ID suffixes                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Legacy i3           | `i3-3mm`, `mk1`, `mk2`, `mk2s`, `mk2.5`, `mk2.5s`                                                                |
| MK3                 | `mk3`, `mk3s`, `mk3s-plus`, `mk3s-plus-anniversary`                                                              |
| Buddy MK upgrades   | `mk3.5`, `mk3.5s`, `mk3.9`, `mk3.9s`, `mk4`, `mk4s`                                                              |
| MINI                | `mini`, `mini-plus`                                                                                              |
| XL                  | `xl`, `xl-plus`, `xl-critical-infrastructure`, `xl-plus-critical-infrastructure`                                 |
| CORE One            | `core-one`, `core-one-plus`, `core-one-plus-gen2`, `signature-oak`                                               |
| CORE One L          | `core-one-l`, `core-one-l-plus`, `core-one-l-critical-infrastructure`, `core-one-l-plus-critical-infrastructure` |
| INDX                | `core-one-indx`, `core-one-plus-indx`, `core-one-plus-gen2-indx`, `core-one-l-indx`, `core-one-l-plus-indx`      |
| Professional FFF    | `ht90-high-flow`, `ht90-high-temperature`, `pro-afs`                                                             |
| Resin (unavailable) | `sl1`, `sl1s`, `pro-slx`, `pro-medical-one`                                                                      |

Nozzle diameter, Input Shaper, high-flow, kit/assembled, AMS/combo and enclosure bundles do not create duplicate geometry profiles. HT90's interchangeable head families have different thermal limits and therefore separate IDs. Profiles describe stock hardware; modified hotends, firmware, offsets or service areas require an explicitly customized `PrinterProfile`.

## Reading constraints correctly

P1/X1 profiles use the default slicer height of 250 mm and front-left deposition exclusion. Travel outside the printable box is not automatically a violation. H2D/H2C enforce per-nozzle reach; jobs mapping both nozzles also use the reviewed 320 mm shared Z limit. X2D uses the published 260 mm main-nozzle height rather than the slicer's 261 mm. HT90 uses the published radius 150 mm and height 400 mm rather than the slicer's larger allowance.

Legacy MK1 and 3 mm profiles enforce documented XY geometry; unverified printable Z and thermal limits remain absent. MK1 includes firmware travel limits and conservative glass-clip exclusions. CORE One L INDX uses published dimensions with a documented front-left-origin assumption; the reviewed development firmware's Y size disagrees with the product specification. Check its installed calibration or supply custom bounds.

Preset notes are included in report assumptions. `passed` means the configured limits passed for modeled input; it does not mean every possible limit was configured. Printer profiles intentionally omit universal material-flow limits, presumed homing endpoints, and acceleration-limited time predictions. The older `createBambuX1CarbonPrintProfile()` remains a geometry-only compatibility helper.
