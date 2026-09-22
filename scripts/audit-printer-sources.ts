/** Offline research aid. Resolve all concrete vendor presets, retaining only constraint facts.
 * bun scripts/audit-printer-sources.ts <BambuStudio checkout> <Prusa FFF checkout>
 * > test/fixtures/printer-sources.json
 * See docs/printer-research.md for pinned revisions. No runtime network or vendor scripts.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const [bambuRoot, prusaRoot] = Bun.argv.slice(2);
if (!bambuRoot || !prusaRoot) {
	throw new Error("Supply BambuStudio and PrusaSlicer-settings-prusa-fff checkout paths.");
}
const revisions = {
	bambu: "f977235e6d736c4c0b650520ac5a5b72cbfe9244",
	prusa: "65c5c8f1e1c3836f306119c49d717759cbc368db",
};
for (const [root, revision] of [
	[bambuRoot, revisions.bambu],
	[prusaRoot, revisions.prusa],
]) {
	const result = Bun.spawnSync(["git", "-C", root!, "rev-parse", "HEAD"]);
	if (result.exitCode || result.stdout.toString().trim() !== revision) {
		throw new Error(`Checkout ${root} must be at the documented revision ${revision}.`);
	}
}
type Fields = Record<string, string | string[]>;
const machines = join(bambuRoot, "resources/profiles/BBL/machine");
const json: Record<string, Fields> = {};
for (const file of (await readdir(machines)).filter((f) => f.endsWith(".json")).sort()) {
	json[file.slice(0, -5)] = (await Bun.file(join(machines, file)).json()) as Fields;
}
function resolveJson(name: string, trail: string[] = []): Fields {
	const p = json[name];
	if (!p || trail.includes(name)) {
		throw new Error(`Invalid JSON inheritance: ${name}`);
	}
	return {
		...(typeof p.inherits === "string" ? resolveJson(p.inherits, [...trail, name]) : {}),
		...p,
	};
}
const sections: Record<string, Record<string, string>> = {};
let section: Record<string, string> = {};
for (const line of (await Bun.file(join(prusaRoot, "PrusaResearch/2.5.10.ini")).text()).split(
	/\r?\n/,
)) {
	if (line.startsWith("[")) {
		section = sections[line.slice(1, -1)] = {};
	} else {
		const match = /^([^#;][^=]*?)\s*=\s*(.*)$/.exec(line);
		if (match) {
			section[match[1]!.trim()] = match[2]!;
		}
	}
}
function resolveIni(name: string, trail: string[] = []): Record<string, string> {
	const p = sections[`printer:${name}`];
	if (!p || trail.includes(name)) {
		throw new Error(`Invalid INI inheritance: ${name}`);
	}
	return Object.assign(
		{},
		...(p.inherits?.split(";").map((n) => resolveIni(n.trim(), [...trail, name])) ?? []),
		p,
	);
}
const pick = (p: Fields, keys: string[]): Fields =>
	Object.fromEntries(keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]!]));
type Group = { presets: string[]; variants: Fields[] };
function group(rows: { model: string; name: string; facts: Fields }[]): Record<string, Group> {
	const groups: Record<string, Group> = {};
	for (const { model, name, facts } of rows) {
		const g = (groups[model] ??= { presets: [], variants: [] });
		g.presets.push(name);
		if (!g.variants.some((v) => JSON.stringify(v) === JSON.stringify(facts))) {
			g.variants.push(facts);
		}
	}
	return groups;
}
const bambu = group(
	Object.entries(json)
		.filter(([, p]) => p.instantiation === "true")
		.map(([name]) => {
			const p = resolveJson(name);
			return {
				name,
				model: String(p.printer_model),
				facts: pick(p, [
					"printable_area",
					"printable_height",
					"bed_exclude_area",
					"extruder_printable_area",
					"extruder_printable_height",
					"extruder_height_gap",
					"physical_extruder_map",
				]),
			};
		}),
);
const prusa = group(
	Object.keys(sections)
		.filter((k) => k.startsWith("printer:") && !k.startsWith("printer:*"))
		.sort()
		.map((k) => {
			const name = k.slice(8);
			const p = resolveIni(name);
			return {
				name,
				model: p.printer_model!,
				facts: pick(p, [
					"bed_shape",
					"max_print_height",
					"gcode_flavor",
					"single_extruder_multi_material",
				]),
			};
		}),
);
const models = Object.keys(sections)
	.filter((k) => k.startsWith("printer_model:"))
	.map((k) => k.slice(14))
	.sort();
if (JSON.stringify(Object.keys(prusa).sort()) !== JSON.stringify(models)) {
	throw new Error("Every declared Prusa model must resolve to concrete presets.");
}
console.log(JSON.stringify({ revisions, bambu, prusa }, null, 2));
