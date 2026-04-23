/**
 * Argument parsing for the run script.
 * Validates region names and expands task specifications.
 */

import { ALL_TASKS, TASK_NAME_TO_NUMBER, VALID_TASK_NUMBERS } from './tasks.constants.ts';

export interface ParsedArgs {
	name: string;
	tasks: number[];
}

/**
 * Validates that a region name matches the expected format.
 * Format: "cc" or "cc/ss" where c and s are lowercase letters.
 */
export function validateRegionName(name: string): void {
	const pattern = /^[a-z\/_]{2,}$/;
	if (!pattern.test(name)) {
		throw new Error(`Invalid region name "${name}". Must be "cc" or "cc/ss" (e.g., "de" or "de/berlin")`);
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

	if (lowerToken in TASK_NAME_TO_NUMBER) {
		return [TASK_NAME_TO_NUMBER[lowerToken]];
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
 *   "all" -> [0, 1, 3, 2, 3, 4]
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
	if (args.length === 0 || args.includes('-h') || args.includes('--help') || args.includes('help')) {
		return null;
	}

	if (args.length < 2) {
		throw new Error(`Missing arguments. Usage: ${getCommand()} <name> <task>`);
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
 * Detects how the script was invoked and returns the appropriate command prefix.
 */
function getCommand(): string {
	const scriptPath = process.argv[1] ?? '';
	if (scriptPath.endsWith('run.sh')) return './run.sh';
	return 'npm run run --';
}

/**
 * Returns the help text for the run script.
 */
export function getHelpText(): string {
	const cmd = getCommand();
	return `Usage: ${cmd} <name> <task>

<name>  Region identifier: cc or cc/name (e.g., de or de/berlin)
<task>  One or more tasks: a single step (e.g., 2 or merge),
        a comma list (e.g., 1,2,3), and/or ranges (e.g., 1-3)

Tasks:
  1 | fetch      fetch + per-file versatiles mosaic tile
  2 | merge      versatiles mosaic assemble + upload to remote
  3 | delete     delete local data for the region
  all            run full pipeline: 1 2 3

Examples:
  ${cmd} de/berlin 1
  ${cmd} fr 1-2
  ${cmd} de/berlin 1,2
  ${cmd} de/berlin all
`;
}
