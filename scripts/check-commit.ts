/** Shared validation for the commit-msg hook and CI commit range checks. */
export function validateCommitMessage(message: string): void {
	const subject = message.split(/\r?\n/, 1)[0] ?? "";
	const conventional =
		/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S.*$/;
	if (!conventional.test(subject) || subject.length > 100 || subject.trimEnd() !== subject) {
		throw new Error(
			"Use a Conventional Commit subject of at most 100 characters, e.g. fix(parser): handle empty lines.",
		);
	}
}

if (import.meta.main) {
	const [option, value] = Bun.argv.slice(2);
	if (option === "--title" && !value) {
		const title = process.env.PR_TITLE ?? "";
		if (/[\r\n]/.test(title)) {
			throw new Error("Pull request titles must be a single Conventional Commit subject.");
		}
		validateCommitMessage(title);
		const number = process.env.PR_NUMBER;
		if (number) {
			// GitHub appends the PR number to the title when squash merging.
			validateCommitMessage(`${title} (#${number})`);
		}
	} else if (option === "--range" && value) {
		const result = Bun.spawnSync(["git", "log", "--format=%s%x00", value], {
			stderr: "inherit",
		});
		if (result.exitCode !== 0) {
			throw new Error("Could not read the commit range.");
		}
		for (const subject of result.stdout.toString().split("\0")) {
			if (subject.trim()) {
				validateCommitMessage(subject.replace(/^\n/, ""));
			}
		}
	} else if (option && !value) {
		validateCommitMessage(await Bun.file(option).text());
	} else {
		throw new Error(
			"Usage: bun run commit:check <message-file> | --range <git-range> | --title (reads PR_TITLE)",
		);
	}
}
