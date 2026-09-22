import { executionCommands } from "./execution.js";
import { modalCommands } from "./modal.js";
import { coordinatesCommands } from "./coordinates.js";
import { extrusionCommands } from "./extrusion.js";
import { temperatureCommands } from "./temperature.js";
import { motionCommands } from "./motion.js";
import type { CommandHandler } from "./types.js";
const handlers: readonly CommandHandler[] = [
	...executionCommands,
	...modalCommands,
	...coordinatesCommands,
	...extrusionCommands,
	...temperatureCommands,
	...motionCommands,
];
export const commandHandlers: ReadonlyMap<string, CommandHandler> = new Map(
	handlers.flatMap((handler) => handler.codes.map((code) => [code, handler] as const)),
);
