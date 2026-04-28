/**
 * Minimal remote ZIP reader using HTTP range requests.
 * Reads the Central Directory from the end of the file, then extracts
 * individual entries by offset — without downloading the entire archive.
 * Supports both standard ZIP and ZIP64.
 */

import { createInflateRaw, inflateRawSync } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

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
		// Step 1: One suffix-range request — fetches the last 64 KB and returns the
		// total file size in `Content-Range`, saving the HEAD round-trip.
		const eocdSearchSize = 65536;
		const tailRes = await fetch(url, { headers: { Range: `bytes=-${eocdSearchSize}` } });
		if (!tailRes.ok) throw new Error(`fetch ${url} failed: ${tailRes.status}`);
		if (tailRes.status !== 206) {
			throw new Error(
				`Server ignored Range request for ${url} (status ${tailRes.status}); RemoteZip requires range support`,
			);
		}
		const contentRange = tailRes.headers.get('content-range');
		if (!contentRange?.match(/^bytes \d+-\d+\/\d+$/)) {
			throw new Error(`Missing or invalid Content-Range for ${url}: ${contentRange}`);
		}
		const tailBuf = Buffer.from(await tailRes.arrayBuffer());

		const eocdOffset = findEOCD(tailBuf);
		if (eocdOffset === -1) {
			throw new Error(`Could not find End of Central Directory in ${url}`);
		}

		const eocd = tailBuf.subarray(eocdOffset);
		let cdSize = eocd.readUInt32LE(12);
		let cdOffset = eocd.readUInt32LE(16);

		// Step 2b: Check for ZIP64 — if cdOffset or cdSize is 0xFFFFFFFF, read ZIP64 EOCD
		if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
			// ZIP64 EOCD locator is 20 bytes before the standard EOCD
			const locatorOffset = eocdOffset - 20;
			if (locatorOffset >= 0 && tailBuf.readUInt32LE(locatorOffset) === 0x07064b50) {
				const zip64EocdAbsOffset = Number(tailBuf.readBigUInt64LE(locatorOffset + 8));

				// Read ZIP64 EOCD record (56 bytes minimum)
				const zip64Buf = await fetchRange(url, zip64EocdAbsOffset, zip64EocdAbsOffset + 55);
				if (zip64Buf.readUInt32LE(0) !== 0x06064b50) {
					throw new Error('Invalid ZIP64 End of Central Directory record');
				}

				cdSize = Number(zip64Buf.readBigUInt64LE(40));
				cdOffset = Number(zip64Buf.readBigUInt64LE(48));
			} else {
				throw new Error('ZIP64 EOCD locator not found');
			}
		}

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
	/**
	 * Extracts a single entry and returns the uncompressed content as a Buffer.
	 * Only suitable for small files — for large files, use extractToFile().
	 */
	async extract(entry: ZipEntry): Promise<Buffer> {
		const headerSize = 30 + 256;
		const rangeEnd = entry.offset + headerSize + entry.compressedSize;
		const buf = await fetchRange(this.url, entry.offset, rangeEnd);

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

	/**
	 * Extracts a single entry directly to a file, streaming the data.
	 * Suitable for large files — does not load the entire entry into memory.
	 */
	async extractToFile(entry: ZipEntry, destPath: string): Promise<void> {
		// First, read just the local file header to determine the data offset
		const headerBuf = await fetchRange(this.url, entry.offset, entry.offset + 30 + 256);

		if (headerBuf.readUInt32LE(0) !== 0x04034b50) {
			throw new Error(`Invalid local file header for ${entry.filename}`);
		}

		const filenameLen = headerBuf.readUInt16LE(26);
		const extraLen = headerBuf.readUInt16LE(28);
		const dataOffset = entry.offset + 30 + filenameLen + extraLen;
		const dataEnd = dataOffset + entry.compressedSize - 1;

		// Stream the compressed data directly to disk
		const res = await fetch(this.url, {
			headers: { Range: `bytes=${dataOffset}-${dataEnd}` },
		});
		if (res.status !== 206 && res.status !== 200) {
			throw new Error(`Range request failed for ${this.url}: ${res.status}`);
		}
		if (!res.body) throw new Error('No response body');

		const source = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
		const dest = createWriteStream(destPath);

		if (entry.compressionMethod === 0) {
			await streamPipeline(source, dest);
		} else if (entry.compressionMethod === 8) {
			await streamPipeline(source, createInflateRaw(), dest);
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
	for (let i = buf.length - 22; i >= 0; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			return i;
		}
	}
	return -1;
}

/** Parses the Central Directory and returns all file entries. Handles ZIP64 extra fields. */
function parseCentralDirectory(buf: Buffer): ZipEntry[] {
	const entries: ZipEntry[] = [];
	let pos = 0;

	while (pos + 46 <= buf.length) {
		const sig = buf.readUInt32LE(pos);
		if (sig !== 0x02014b50) break;

		const compressionMethod = buf.readUInt16LE(pos + 10);
		let compressedSize = buf.readUInt32LE(pos + 20);
		let uncompressedSize = buf.readUInt32LE(pos + 24);
		const filenameLen = buf.readUInt16LE(pos + 28);
		const extraLen = buf.readUInt16LE(pos + 30);
		const commentLen = buf.readUInt16LE(pos + 32);
		let offset = buf.readUInt32LE(pos + 42);
		const filename = buf.subarray(pos + 46, pos + 46 + filenameLen).toString('utf-8');

		// Parse ZIP64 extra field if any sizes/offset are 0xFFFFFFFF
		if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || offset === 0xffffffff) {
			const extraStart = pos + 46 + filenameLen;
			const extraEnd = extraStart + extraLen;
			let ep = extraStart;
			while (ep + 4 <= extraEnd) {
				const tag = buf.readUInt16LE(ep);
				const size = buf.readUInt16LE(ep + 2);
				if (tag === 0x0001) {
					// ZIP64 extended information extra field
					let fieldPos = ep + 4;
					if (uncompressedSize === 0xffffffff && fieldPos + 8 <= ep + 4 + size) {
						uncompressedSize = Number(buf.readBigUInt64LE(fieldPos));
						fieldPos += 8;
					}
					if (compressedSize === 0xffffffff && fieldPos + 8 <= ep + 4 + size) {
						compressedSize = Number(buf.readBigUInt64LE(fieldPos));
						fieldPos += 8;
					}
					if (offset === 0xffffffff && fieldPos + 8 <= ep + 4 + size) {
						offset = Number(buf.readBigUInt64LE(fieldPos));
					}
					break;
				}
				ep += 4 + size;
			}
		}

		if (!filename.endsWith('/')) {
			entries.push({ filename, compressedSize, uncompressedSize, compressionMethod, offset });
		}

		pos += 46 + filenameLen + extraLen + commentLen;
	}

	return entries;
}
