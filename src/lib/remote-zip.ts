/**
 * Minimal remote ZIP reader using HTTP range requests.
 * Reads the Central Directory from the end of the file, then extracts
 * individual entries by offset — without downloading the entire archive.
 */

import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
	/** Filename (including path) within the archive */
	filename: string;
	/** Compressed size in bytes */
	compressedSize: number;
	/** Uncompressed size in bytes */
	uncompressedSize: number;
	/** Compression method: 0 = stored, 8 = deflate */
	compressionMethod: number;
	/** Byte offset of the local file header in the archive */
	offset: number;
}

export class RemoteZip {
	private constructor(
		private url: string,
		private entries: ZipEntry[],
	) {}

	/**
	 * Opens a remote ZIP file by reading its Central Directory via HTTP range requests.
	 * Requires the server to support `Accept-Ranges: bytes`.
	 */
	static async open(url: string): Promise<RemoteZip> {
		// Step 1: HEAD to get file size
		const headRes = await fetch(url, { method: 'HEAD' });
		if (!headRes.ok) throw new Error(`HEAD ${url} failed: ${headRes.status}`);
		const contentLength = Number(headRes.headers.get('content-length'));
		if (!contentLength || isNaN(contentLength)) {
			throw new Error(`Could not determine file size for ${url}`);
		}

		// Step 2: Read last 65KB to find EOCD record
		const eocdSearchSize = Math.min(65536, contentLength);
		const eocdStart = contentLength - eocdSearchSize;
		const tailBuf = await fetchRange(url, eocdStart, contentLength - 1);

		const eocdOffset = findEOCD(tailBuf);
		if (eocdOffset === -1) {
			throw new Error(`Could not find End of Central Directory in ${url}`);
		}

		const eocd = tailBuf.subarray(eocdOffset);
		const cdSize = eocd.readUInt32LE(12);
		const cdOffset = eocd.readUInt32LE(16);

		// Step 3: Read Central Directory
		const cdBuf = await fetchRange(url, cdOffset, cdOffset + cdSize - 1);
		const entries = parseCentralDirectory(cdBuf);

		return new RemoteZip(url, entries);
	}

	/** Returns the list of entries (files) in the archive. */
	getEntries(): ZipEntry[] {
		return this.entries;
	}

	/**
	 * Extracts a single entry from the archive via one HTTP range request.
	 * Returns the uncompressed file content as a Buffer.
	 */
	async extract(entry: ZipEntry): Promise<Buffer> {
		// Local file header is 30 bytes + variable filename + extra field
		// We need to read the header first to determine the actual data offset
		const headerSize = 30 + 256; // 30 fixed + generous extra for filename/extra
		const rangeEnd = entry.offset + headerSize + entry.compressedSize;
		const buf = await fetchRange(this.url, entry.offset, rangeEnd);

		// Verify local file header signature
		if (buf.readUInt32LE(0) !== 0x04034b50) {
			throw new Error(`Invalid local file header for ${entry.filename}`);
		}

		const filenameLen = buf.readUInt16LE(26);
		const extraLen = buf.readUInt16LE(28);
		const dataStart = 30 + filenameLen + extraLen;
		const data = buf.subarray(dataStart, dataStart + entry.compressedSize);

		if (entry.compressionMethod === 0) {
			return Buffer.from(data);
		} else if (entry.compressionMethod === 8) {
			return Buffer.from(inflateRawSync(data));
		} else {
			throw new Error(`Unsupported compression method ${entry.compressionMethod} for ${entry.filename}`);
		}
	}
}

/** Fetches a byte range from a URL and returns it as a Buffer. */
async function fetchRange(url: string, start: number, end: number): Promise<Buffer> {
	const res = await fetch(url, {
		headers: { Range: `bytes=${start}-${end}` },
	});
	if (res.status !== 206 && res.status !== 200) {
		throw new Error(`Range request failed for ${url}: ${res.status}`);
	}
	return Buffer.from(await res.arrayBuffer());
}

/** Searches for the End of Central Directory signature (0x06054b50) from the end of a buffer. */
function findEOCD(buf: Buffer): number {
	// Search backwards — EOCD is at the end, but may have a comment after the signature
	for (let i = buf.length - 22; i >= 0; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			return i;
		}
	}
	return -1;
}

/** Parses the Central Directory and returns all file entries. */
function parseCentralDirectory(buf: Buffer): ZipEntry[] {
	const entries: ZipEntry[] = [];
	let pos = 0;

	while (pos + 46 <= buf.length) {
		const sig = buf.readUInt32LE(pos);
		if (sig !== 0x02014b50) break; // Not a central directory entry

		const compressionMethod = buf.readUInt16LE(pos + 10);
		const compressedSize = buf.readUInt32LE(pos + 20);
		const uncompressedSize = buf.readUInt32LE(pos + 24);
		const filenameLen = buf.readUInt16LE(pos + 28);
		const extraLen = buf.readUInt16LE(pos + 30);
		const commentLen = buf.readUInt16LE(pos + 32);
		const offset = buf.readUInt32LE(pos + 42);
		const filename = buf.subarray(pos + 46, pos + 46 + filenameLen).toString('utf-8');

		// Skip directories (names ending with /)
		if (!filename.endsWith('/')) {
			entries.push({ filename, compressedSize, uncompressedSize, compressionMethod, offset });
		}

		pos += 46 + filenameLen + extraLen + commentLen;
	}

	return entries;
}
