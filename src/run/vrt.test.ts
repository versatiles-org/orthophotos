import { describe, expect, test } from 'vitest';
import { assembleVrtArgs } from './vrt.ts';
import type { VrtEntryConfig } from '../lib/framework.ts';

describe('assembleVrtArgs', () => {
	const vrtPath = '/data/tiles.vrt';
	const listPath = '/tmp/tiles_files.txt';

	test('defaults - addalpha only', () => {
		const config: VrtEntryConfig = {};
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual(['-addalpha', vrtPath, '-input_file_list', listPath]);
	});

	test('with bands', () => {
		const config: VrtEntryConfig = { bands: [1, 2, 3] };
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual([
			'-b',
			'1',
			'-b',
			'2',
			'-b',
			'3',
			'-addalpha',
			vrtPath,
			'-input_file_list',
			listPath,
		]);
	});

	test('with srcnodata', () => {
		const config: VrtEntryConfig = { srcnodata: '0 0 0' };
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual([
			'-srcnodata',
			'0 0 0',
			'-addalpha',
			vrtPath,
			'-input_file_list',
			listPath,
		]);
	});

	test('with srs', () => {
		const config: VrtEntryConfig = { srs: 'EPSG:25833' };
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual([
			'-addalpha',
			'-a_srs',
			'EPSG:25833',
			vrtPath,
			'-input_file_list',
			listPath,
		]);
	});

	test('with allowProjectionDifference and no addalpha', () => {
		const config: VrtEntryConfig = { addalpha: false, allowProjectionDifference: true, srs: 'EPSG:25832' };
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual([
			'-allow_projection_difference',
			'-a_srs',
			'EPSG:25832',
			vrtPath,
			'-input_file_list',
			listPath,
		]);
	});

	test('with srcnodata and bands combined', () => {
		const config: VrtEntryConfig = { srcnodata: '255 255 255', bands: [1, 2, 3] };
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual([
			'-b',
			'1',
			'-b',
			'2',
			'-b',
			'3',
			'-srcnodata',
			'255 255 255',
			'-addalpha',
			vrtPath,
			'-input_file_list',
			listPath,
		]);
	});

	test('addalpha explicitly true', () => {
		const config: VrtEntryConfig = { addalpha: true };
		expect(assembleVrtArgs(config, vrtPath, listPath)).toEqual(['-addalpha', vrtPath, '-input_file_list', listPath]);
	});
});
