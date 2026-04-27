import { XMLParser } from 'fast-xml-parser';

/**
 * Returns a fast-xml-parser instance configured for the ATOM/WMS feeds we
 * consume across the project. Attribute keys are prefixed with `@_` so callers
 * can distinguish element children from XML attributes.
 */
export function createXmlParser(): XMLParser {
	return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
}
