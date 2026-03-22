import { expect, test } from 'vitest';
import { ALL_TASKS, TASK_NAME_TO_NUMBER, TASK_NUMBER_TO_NAME, TASKS, VALID_TASK_NUMBERS } from './tasks.constants.ts';

test('TASKS - contains all 4 task definitions', () => {
	expect(TASKS.length).toBe(4);
});

test('TASKS - task numbers are 0-3', () => {
	const numbers = TASKS.map((t) => t.number).sort((a, b) => a - b);
	expect(numbers).toEqual([0, 1, 2, 3]);
});

test('TASK_NAME_TO_NUMBER - maps names correctly', () => {
	expect(TASK_NAME_TO_NUMBER['download']).toBe(0);
	expect(TASK_NAME_TO_NUMBER['fetch']).toBe(1);
	expect(TASK_NAME_TO_NUMBER['merge']).toBe(2);
	expect(TASK_NAME_TO_NUMBER['delete']).toBe(3);
});

test('TASK_NAME_TO_NUMBER - includes aliases', () => {
	expect(TASK_NAME_TO_NUMBER['0_download']).toBe(0);
	expect(TASK_NAME_TO_NUMBER['1_fetch']).toBe(1);
	expect(TASK_NAME_TO_NUMBER['2_merge']).toBe(2);
	expect(TASK_NAME_TO_NUMBER['3_delete']).toBe(3);
});

test('TASK_NUMBER_TO_NAME - provides inverse mapping', () => {
	expect(TASK_NUMBER_TO_NAME[0]).toBe('download');
	expect(TASK_NUMBER_TO_NAME[1]).toBe('fetch');
	expect(TASK_NUMBER_TO_NAME[2]).toBe('merge');
	expect(TASK_NUMBER_TO_NAME[3]).toBe('delete');
});

test('VALID_TASK_NUMBERS - contains all valid numbers', () => {
	expect(VALID_TASK_NUMBERS.has(0)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(1)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(2)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(3)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(4)).toBe(false);
	expect(VALID_TASK_NUMBERS.has(-1)).toBe(false);
});

test('ALL_TASKS - has correct pipeline order', () => {
	expect(ALL_TASKS).toEqual([0, 1, 2, 3]);
});

test('ALL_TASKS - contains only valid task numbers', () => {
	for (const num of ALL_TASKS) {
		expect(VALID_TASK_NUMBERS.has(num)).toBe(true);
	}
});
