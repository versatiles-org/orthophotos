import { expect, test } from 'vitest';
import { ALL_TASKS, TASK_NAME_TO_NUMBER, TASK_NUMBER_TO_NAME, TASKS, VALID_TASK_NUMBERS } from './tasks.constants.ts';

test('TASKS - contains all 7 task definitions', () => {
	expect(TASKS.length).toBe(7);
});

test('TASKS - task numbers are 0-6', () => {
	const numbers = TASKS.map((t) => t.number).sort((a, b) => a - b);
	expect(numbers).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test('TASK_NAME_TO_NUMBER - maps names correctly', () => {
	expect(TASK_NAME_TO_NUMBER['download']).toBe(0);
	expect(TASK_NAME_TO_NUMBER['fetch']).toBe(1);
	expect(TASK_NAME_TO_NUMBER['vrt']).toBe(2);
	expect(TASK_NAME_TO_NUMBER['preview']).toBe(3);
	expect(TASK_NAME_TO_NUMBER['convert']).toBe(4);
	expect(TASK_NAME_TO_NUMBER['upload']).toBe(5);
	expect(TASK_NAME_TO_NUMBER['delete']).toBe(6);
});

test('TASK_NAME_TO_NUMBER - includes aliases', () => {
	expect(TASK_NAME_TO_NUMBER['0_download']).toBe(0);
	expect(TASK_NAME_TO_NUMBER['1_fetch']).toBe(1);
	expect(TASK_NAME_TO_NUMBER['2_vrt']).toBe(2);
	expect(TASK_NAME_TO_NUMBER['3_preview']).toBe(3);
	expect(TASK_NAME_TO_NUMBER['4_convert']).toBe(4);
	expect(TASK_NAME_TO_NUMBER['5_upload']).toBe(5);
	expect(TASK_NAME_TO_NUMBER['6_delete']).toBe(6);
});

test('TASK_NUMBER_TO_NAME - provides inverse mapping', () => {
	expect(TASK_NUMBER_TO_NAME[0]).toBe('download');
	expect(TASK_NUMBER_TO_NAME[1]).toBe('fetch');
	expect(TASK_NUMBER_TO_NAME[2]).toBe('vrt');
	expect(TASK_NUMBER_TO_NAME[3]).toBe('preview');
	expect(TASK_NUMBER_TO_NAME[4]).toBe('convert');
	expect(TASK_NUMBER_TO_NAME[5]).toBe('upload');
	expect(TASK_NUMBER_TO_NAME[6]).toBe('delete');
});

test('VALID_TASK_NUMBERS - contains all valid numbers', () => {
	expect(VALID_TASK_NUMBERS.has(0)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(1)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(2)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(3)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(4)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(5)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(6)).toBe(true);
	expect(VALID_TASK_NUMBERS.has(7)).toBe(false);
	expect(VALID_TASK_NUMBERS.has(-1)).toBe(false);
});

test('ALL_TASKS - has correct pipeline order', () => {
	// Pipeline order: 0 1 5 2 5 3 5 4 5 6
	expect(ALL_TASKS).toEqual([0, 1, 5, 2, 5, 3, 5, 4, 5, 6]);
});

test('ALL_TASKS - contains only valid task numbers', () => {
	for (const num of ALL_TASKS) {
		expect(VALID_TASK_NUMBERS.has(num)).toBe(true);
	}
});
