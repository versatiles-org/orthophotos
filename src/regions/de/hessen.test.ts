import { expect, test } from 'vitest';
import { withXmlExceptions } from './hessen.ts';

test('withXmlExceptions asks for the XML error report instead of an error image', () => {
	const url =
		'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows?REQUEST=GetMap&FORMAT=image/tiff&EXCEPTIONS=application/vnd.ogc.se_inimage';
	expect(withXmlExceptions(url)).toBe(
		'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows?REQUEST=GetMap&FORMAT=image/tiff&EXCEPTIONS=application/vnd.ogc.se_xml',
	);
	expect(withXmlExceptions('https://example.com/?REQUEST=GetMap')).toBe('https://example.com/?REQUEST=GetMap');
});
