/**
 * Task constants - single source of truth for task definitions.
 */

export interface TaskDefinition {
	number: number;
	name: string;
	aliases: string[];
}

/** All task definitions */
export const TASKS: TaskDefinition[] = [
	{ number: 0, name: 'download', aliases: ['0_download'] },
	{ number: 1, name: 'fetch', aliases: ['1_fetch'] },
	{ number: 2, name: 'merge', aliases: ['2_merge'] },
	{ number: 3, name: 'upload', aliases: ['3_upload'] },
	{ number: 4, name: 'delete', aliases: ['4_delete'] },
];

/** Map from task name/alias to task number */
export const TASK_NAME_TO_NUMBER: Record<string, number> = Object.fromEntries(
	TASKS.flatMap((task) => [[task.name, task.number], ...task.aliases.map((alias) => [alias, task.number])]),
);

/** Map from task number to task name */
export const TASK_NUMBER_TO_NAME: Record<number, string> = Object.fromEntries(
	TASKS.map((task) => [task.number, task.name]),
);

/** Valid task numbers */
export const VALID_TASK_NUMBERS = new Set(TASKS.map((task) => task.number));

/** The full pipeline order: 0 1 3 2 3 4 */
export const ALL_TASKS = [0, 1, 3, 2, 3, 4];
