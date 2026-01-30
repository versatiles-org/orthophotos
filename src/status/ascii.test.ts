import { assertEquals, assertThrows } from '@std/assert';
import { string2ascii } from './ascii.ts';

Deno.test('string2ascii - basic lowercase conversion', () => {
	assertEquals(string2ascii('Hello World'), 'hello_world');
	assertEquals(string2ascii('abc'), 'abc');
});

Deno.test('string2ascii - punctuation becomes space then underscore', () => {
	assertEquals(string2ascii('hello-world'), 'hello_world');
	assertEquals(string2ascii('hello—world'), 'hello_world'); // em dash
	assertEquals(string2ascii('hello,world'), 'hello_world');
	assertEquals(string2ascii('hello.world'), 'hello_world');
	assertEquals(string2ascii('hello/world'), 'hello_world');
	assertEquals(string2ascii('hello(world)'), 'hello_world');
});

Deno.test('string2ascii - multiple spaces become single underscore', () => {
	assertEquals(string2ascii('hello   world'), 'hello_world');
	assertEquals(string2ascii('hello - world'), 'hello_world');
});

Deno.test('string2ascii - trims whitespace', () => {
	assertEquals(string2ascii('  hello  '), 'hello');
	assertEquals(string2ascii('  hello world  '), 'hello_world');
});

Deno.test('string2ascii - German umlauts', () => {
	assertEquals(string2ascii('München'), 'muenchen');
	assertEquals(string2ascii('Köln'), 'koeln');
	assertEquals(string2ascii('Düsseldorf'), 'duesseldorf');
	assertEquals(string2ascii('Straße'), 'strasse');
});

Deno.test('string2ascii - French accents', () => {
	assertEquals(string2ascii('Île-de-France'), 'ile_de_france');
	assertEquals(string2ascii('Côte'), 'cote');
	assertEquals(string2ascii('Montréal'), 'montreal');
});

Deno.test('string2ascii - Nordic characters', () => {
	assertEquals(string2ascii('København'), 'kobenhavn'); // ø -> o
	assertEquals(string2ascii('Malmö'), 'malmoe'); // ö -> oe
	assertEquals(string2ascii('Åland'), 'aland'); // å -> a
});

Deno.test('string2ascii - Eastern European characters', () => {
	assertEquals(string2ascii('Łódź'), 'lodz');
	assertEquals(string2ascii('České'), 'ceske');
	assertEquals(string2ascii('Kraków'), 'krakow');
	assertEquals(string2ascii('Gdańsk'), 'gdansk');
});

Deno.test('string2ascii - Spanish characters', () => {
	assertEquals(string2ascii('España'), 'espana');
	assertEquals(string2ascii('Cataluña'), 'cataluna');
});

Deno.test('string2ascii - throws on unsupported character', () => {
	assertThrows(
		() => string2ascii('Hello 你好'),
		Error,
		'Unsupported character',
	);
});

Deno.test('string2ascii - right single quotation mark', () => {
	// U+2019 RIGHT SINGLE QUOTATION MARK
	assertEquals(string2ascii('Valle d\u2019Aosta'), 'valle_d_aosta');
});
