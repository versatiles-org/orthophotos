import { assertEquals } from '@std/assert';
import {
	ALL_TASKS,
	TASK_NAME_TO_NUMBER,
	TASK_NUMBER_TO_NAME,
	TASKS,
	VALID_TASK_NUMBERS,
} from './tasks.constants.ts';

Deno.test('TASKS - contains all 7 task definitions', () => {
	assertEquals(TASKS.length, 7);
});

Deno.test('TASKS - task numbers are 0-6', () => {
	const numbers = TASKS.map((t) => t.number).sort((a, b) => a - b);
	assertEquals(numbers, [0, 1, 2, 3, 4, 5, 6]);
});

Deno.test('TASK_NAME_TO_NUMBER - maps names correctly', () => {
	assertEquals(TASK_NAME_TO_NUMBER['download'], 0);
	assertEquals(TASK_NAME_TO_NUMBER['fetch'], 1);
	assertEquals(TASK_NAME_TO_NUMBER['vrt'], 2);
	assertEquals(TASK_NAME_TO_NUMBER['preview'], 3);
	assertEquals(TASK_NAME_TO_NUMBER['convert'], 4);
	assertEquals(TASK_NAME_TO_NUMBER['upload'], 5);
	assertEquals(TASK_NAME_TO_NUMBER['delete'], 6);
});

Deno.test('TASK_NAME_TO_NUMBER - includes aliases', () => {
	assertEquals(TASK_NAME_TO_NUMBER['0_download'], 0);
	assertEquals(TASK_NAME_TO_NUMBER['1_fetch'], 1);
	assertEquals(TASK_NAME_TO_NUMBER['2_vrt'], 2);
	assertEquals(TASK_NAME_TO_NUMBER['3_preview'], 3);
	assertEquals(TASK_NAME_TO_NUMBER['4_convert'], 4);
	assertEquals(TASK_NAME_TO_NUMBER['5_upload'], 5);
	assertEquals(TASK_NAME_TO_NUMBER['6_delete'], 6);
});

Deno.test('TASK_NUMBER_TO_NAME - provides inverse mapping', () => {
	assertEquals(TASK_NUMBER_TO_NAME[0], 'download');
	assertEquals(TASK_NUMBER_TO_NAME[1], 'fetch');
	assertEquals(TASK_NUMBER_TO_NAME[2], 'vrt');
	assertEquals(TASK_NUMBER_TO_NAME[3], 'preview');
	assertEquals(TASK_NUMBER_TO_NAME[4], 'convert');
	assertEquals(TASK_NUMBER_TO_NAME[5], 'upload');
	assertEquals(TASK_NUMBER_TO_NAME[6], 'delete');
});

Deno.test('VALID_TASK_NUMBERS - contains all valid numbers', () => {
	assertEquals(VALID_TASK_NUMBERS.has(0), true);
	assertEquals(VALID_TASK_NUMBERS.has(1), true);
	assertEquals(VALID_TASK_NUMBERS.has(2), true);
	assertEquals(VALID_TASK_NUMBERS.has(3), true);
	assertEquals(VALID_TASK_NUMBERS.has(4), true);
	assertEquals(VALID_TASK_NUMBERS.has(5), true);
	assertEquals(VALID_TASK_NUMBERS.has(6), true);
	assertEquals(VALID_TASK_NUMBERS.has(7), false);
	assertEquals(VALID_TASK_NUMBERS.has(-1), false);
});

Deno.test('ALL_TASKS - has correct pipeline order', () => {
	// Pipeline order: 0 1 5 2 5 3 5 4 5 6
	assertEquals(ALL_TASKS, [0, 1, 5, 2, 5, 3, 5, 4, 5, 6]);
});

Deno.test('ALL_TASKS - contains only valid task numbers', () => {
	for (const num of ALL_TASKS) {
		assertEquals(VALID_TASK_NUMBERS.has(num), true);
	}
});
