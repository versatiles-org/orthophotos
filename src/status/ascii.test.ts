import { expect, test } from 'vitest';
import { string2ascii } from './ascii.ts';

test('string2ascii - basic lowercase conversion', () => {
	expect(string2ascii('Hello World')).toBe('hello_world');
	expect(string2ascii('abc')).toBe('abc');
});

test('string2ascii - punctuation becomes space then underscore', () => {
	expect(string2ascii('hello-world')).toBe('hello_world');
	expect(string2ascii('hello\u2014world')).toBe('hello_world'); // em dash
	expect(string2ascii('hello,world')).toBe('hello_world');
	expect(string2ascii('hello.world')).toBe('hello_world');
	expect(string2ascii('hello/world')).toBe('hello_world');
	expect(string2ascii('hello(world)')).toBe('hello_world');
});

test('string2ascii - multiple spaces become single underscore', () => {
	expect(string2ascii('hello   world')).toBe('hello_world');
	expect(string2ascii('hello - world')).toBe('hello_world');
});

test('string2ascii - trims whitespace', () => {
	expect(string2ascii('  hello  ')).toBe('hello');
	expect(string2ascii('  hello world  ')).toBe('hello_world');
});

test('string2ascii - German umlauts', () => {
	expect(string2ascii('M\u00FCnchen')).toBe('muenchen');
	expect(string2ascii('K\u00F6ln')).toBe('koeln');
	expect(string2ascii('D\u00FCsseldorf')).toBe('duesseldorf');
	expect(string2ascii('Stra\u00DFe')).toBe('strasse');
});

test('string2ascii - French accents', () => {
	expect(string2ascii('\u00CEle-de-France')).toBe('ile_de_france');
	expect(string2ascii('C\u00F4te')).toBe('cote');
	expect(string2ascii('Montr\u00E9al')).toBe('montreal');
});

test('string2ascii - Nordic characters', () => {
	expect(string2ascii('K\u00F8benhavn')).toBe('kobenhavn'); // ø -> o
	expect(string2ascii('Malm\u00F6')).toBe('malmoe'); // ö -> oe
	expect(string2ascii('\u00C5land')).toBe('aland'); // å -> a
});

test('string2ascii - Eastern European characters', () => {
	expect(string2ascii('\u0141\u00F3d\u017A')).toBe('lodz');
	expect(string2ascii('\u010Cesk\u00E9')).toBe('ceske');
	expect(string2ascii('Krak\u00F3w')).toBe('krakow');
	expect(string2ascii('Gda\u0144sk')).toBe('gdansk');
});

test('string2ascii - Spanish characters', () => {
	expect(string2ascii('Espa\u00F1a')).toBe('espana');
	expect(string2ascii('Catalu\u00F1a')).toBe('cataluna');
});

test('string2ascii - throws on unsupported character', () => {
	expect(() => string2ascii('Hello \u4F60\u597D')).toThrow('Unsupported character');
});

test('string2ascii - right single quotation mark', () => {
	// U+2019 RIGHT SINGLE QUOTATION MARK
	expect(string2ascii('Valle d\u2019Aosta')).toBe('valle_d_aosta');
});
