import { expect, test } from 'vitest';
import { formatHashLine, parseHashOutput } from './remote-hashes.ts';

test('parseHashOutput extracts md5 hash from md5sum output', () => {
	expect(parseHashOutput('d41d8cd98f00b204e9800998ecf8427e  /home/incoming/x.versatiles', 'md5')).toBe(
		'd41d8cd98f00b204e9800998ecf8427e',
	);
});

test('parseHashOutput extracts sha256 hash from sha256sum output', () => {
	expect(
		parseHashOutput(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  /home/incoming/x.versatiles',
			'sha256',
		),
	).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('parseHashOutput lower-cases hex digits', () => {
	expect(parseHashOutput('D41D8CD98F00B204E9800998ECF8427E  file', 'md5')).toBe('d41d8cd98f00b204e9800998ecf8427e');
});

test('parseHashOutput rejects wrong length', () => {
	// 31 chars — too short for md5
	expect(parseHashOutput('d41d8cd98f00b204e9800998ecf8427  file', 'md5')).toBeUndefined();
	// md5-length string passed as sha256
	expect(parseHashOutput('d41d8cd98f00b204e9800998ecf8427e  file', 'sha256')).toBeUndefined();
});

test('parseHashOutput rejects non-hex characters', () => {
	expect(parseHashOutput('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz  file', 'md5')).toBeUndefined();
});

test('parseHashOutput returns undefined for empty input', () => {
	expect(parseHashOutput('', 'md5')).toBeUndefined();
});

test('formatHashLine writes md5sum-compatible line using basename only', () => {
	expect(formatHashLine('d41d8cd98f00b204e9800998ecf8427e', '/home/incoming/de/bayern.versatiles')).toBe(
		'd41d8cd98f00b204e9800998ecf8427e  bayern.versatiles\n',
	);
});
