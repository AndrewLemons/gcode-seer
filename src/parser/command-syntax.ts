export const payloadCommands = new Set([
	"M117",
	"M118",
	"M23",
	"M28",
	"M30",
	"M32",
	"M1002",
	// Prusa model/version/feature checks accept quoted strings. Their effects remain unsupported.
	"M862.3",
	"M862.4",
	"M862.6",
]);
