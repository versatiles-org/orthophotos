/**
 * Argument parsing for the run script.
 * Validates region names and expands task specifications.
 */

/** Map of named tasks to their numeric values */
const TASK_NAMES: Record<string, number> = {
	download: 0,
	'0_download': 0,
	fetch: 1,
	'1_fetch': 1,
	vrt: 2,
	'2_vrt': 2,
	preview: 3,
	'3_preview': 3,
	convert: 4,
	'4_convert': 4,
	upload: 5,
	'5_upload': 5,
	delete: 6,
	'6_delete': 6,
};

/** The full pipeline order: 0 1 5 2 5 3 5 4 5 6 */
const ALL_TASKS = [0, 1, 5, 2, 5, 3, 5, 4, 5, 6];

/** Valid task numbers */
const VALID_TASK_NUMBERS = new Set([0, 1, 2, 3, 4, 5, 6]);

export interface ParsedArgs {
	name: string;
	tasks: number[];
}

/**
 * Validates that a region name matches the expected format.
 * Format: "cc" or "cc/ss" where c and s are lowercase letters.
 */
export function validateRegionName(name: string): void {
	const pattern = /^[a-z][a-z](\/[a-z][a-z])?$/;
	if (!pattern.test(name)) {
		throw new Error(
			`Invalid region name "${name}". Must be "cc" or "cc/ss" (e.g., "de" or "de/bw")`,
		);
	}
}

/**
 * Parses a single task token into task number(s).
 * Handles: numeric (e.g., "3"), named (e.g., "fetch"), ranges (e.g., "1-3")
 */
function parseTaskToken(token: string): number[] {
	// Check for named tasks first
	const lowerToken = token.toLowerCase();
	if (lowerToken === 'all') {
		return [...ALL_TASKS];
	}

	if (lowerToken in TASK_NAMES) {
		return [TASK_NAMES[lowerToken]];
	}

	// Check for range (e.g., "1-3")
	const rangeMatch = token.match(/^(\d+)-(\d+)$/);
	if (rangeMatch) {
		const start = parseInt(rangeMatch[1], 10);
		const end = parseInt(rangeMatch[2], 10);

		const tasks: number[] = [];
		if (start <= end) {
			for (let i = start; i <= end; i++) {
				if (!VALID_TASK_NUMBERS.has(i)) {
					throw new Error(`Invalid task number: ${i}`);
				}
				tasks.push(i);
			}
		} else {
			for (let i = start; i >= end; i--) {
				if (!VALID_TASK_NUMBERS.has(i)) {
					throw new Error(`Invalid task number: ${i}`);
				}
				tasks.push(i);
			}
		}
		return tasks;
	}

	// Check for single numeric task
	const num = parseInt(token, 10);
	if (!isNaN(num)) {
		if (!VALID_TASK_NUMBERS.has(num)) {
			throw new Error(`Invalid task number: ${num}`);
		}
		return [num];
	}

	throw new Error(`Unknown task: "${token}"`);
}

/**
 * Expands a task specification string into an array of task numbers.
 * Handles comma-separated lists, ranges, and named tasks.
 *
 * Examples:
 *   "3" -> [3]
 *   "1,2,3" -> [1, 2, 3]
 *   "1-3" -> [1, 2, 3]
 *   "fetch" -> [1]
 *   "all" -> [0, 1, 5, 2, 5, 3, 5, 4, 5, 6]
 */
export function expandTasks(taskSpec: string): number[] {
	const tokens = taskSpec.split(',');
	const tasks: number[] = [];

	for (const token of tokens) {
		const trimmed = token.trim();
		if (trimmed === '') continue;
		tasks.push(...parseTaskToken(trimmed));
	}

	return tasks;
}

/**
 * Parses command line arguments.
 * Returns null if help was requested.
 */
export function parseArgs(args: string[]): ParsedArgs | null {
	// Check for help flag
	if (
		args.length === 0 || args.includes('-h') || args.includes('--help') || args.includes('help')
	) {
		return null;
	}

	if (args.length < 2) {
		throw new Error('Missing arguments. Usage: deno task run <name> <task>');
	}

	const [name, taskSpec] = args;

	validateRegionName(name);
	const tasks = expandTasks(taskSpec);

	if (tasks.length === 0) {
		throw new Error('No tasks specified');
	}

	return { name, tasks };
}

/**
 * Returns the help text for the run script.
 */
export function getHelpText(): string {
	return `Usage: deno task run <name> <task>

<name>  Region identifier: cc or cc/ss (e.g., de/bw)
<task>  One or more tasks: a single step (e.g., 3 or upload),
        a comma list (e.g., 1,2,3), and/or ranges (e.g., 1-3,5)

Tasks:
  0 | download   rsync pull existing data from remote
  1 | fetch      fetch new source data
  2 | vrt        build VRTs
  3 | preview    create preview TIFFs
  4 | convert    convert to .versatiles
  5 | upload     rsync push to remote
  6 | delete     delete local data for the region
  all            run full pipeline: 0 1 5 2 5 3 5 4 5 6

Examples:
  deno task run de/bw 1
  deno task run fr 2-4
  deno task run de/bw 1,2,3
  deno task run de/bw all

Note: Tasks 2, 3, and 4 may require increasing the file descriptor limit:
  ulimit -n 8192
`;
}
