export interface Dialect {
	name: string;
	extrusionMode: "marlin" | "independent" | "relative-override";
	extrusionRegisters: "shared" | "per-tool";
	/** Explicit T commands may invoke unmodeled parking, offsets or macros. */
	toolChange: "logical" | "unmodeled";
	passiveCommands: readonly string[];
	/** Defaults to true. */
	inchUnits?: boolean;
	/** M400 accepts S seconds and P milliseconds. */
	timedPlannerWait?: boolean;
	/** M400 U suspends interpretation for user interaction. Requires timedPlannerWait. */
	interactivePlannerWait?: boolean;
	reservedTools?: readonly number[];
	/** M191 accepts a C cooling target. */
	chamberCooling?: boolean;
	/** Explicit hotend selectors must exist in printer.heaterTargets when configured. */
	strictHeaterSelectors?: boolean;
	/** Additional commands whose arguments must be preserved verbatim for adapters. */
	payloadCommands?: readonly string[];
}
