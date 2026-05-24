/**
 * Computes MD5/SHA256 hashes for files on the remote SSH host and stores them
 * as `<file>.md5` / `<file>.sha256` sidecars next to each file.
 *
 * Approach (adapted from versatiles-org/tiles.versatiles.org/download/src/lib/file/hashes.ts):
 *   1. Optionally check if a sidecar already exists on the remote — skip if so
 *      (unless `force` is set).
 *   2. Run `md5sum` / `sha256sum` on the remote via SSH; capture the hash from
 *      stdout.
 *   3. Write the hash to a local temp file in `md5sum`-compatible format
 *      (`<hash>  <basename>\n`) and upload it via scp, so the sidecar can later
 *      be verified with `md5sum -c file.md5`.
 *
 * The remote host (e.g. Hetzner Storage Box) typically runs a restricted shell
 * — `ls`, `md5sum`, and `sha256sum` are available; pipelines and redirects are
 * not. That's why we capture stdout and upload via scp rather than just
 * redirecting on the remote.
 */

import { randomBytes } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { runCommand } from './command.ts';
import { getConfig } from './config.ts';

export type HashType = 'md5' | 'sha256';

const HASH_TYPES: readonly HashType[] = ['md5', 'sha256'];
const HASH_LENGTHS: Record<HashType, number> = { md5: 32, sha256: 64 };

function getSshArgs(): { host: string; ssh: string[]; scp: string[] } {
	const ssh = getConfig().ssh;
	if (!ssh) throw new Error('SSH configuration is missing');
	const { host, port, keyFile } = ssh;
	const sshArgs: string[] = ['-o', 'ConnectTimeout=15'];
	const scpArgs: string[] = ['-o', 'ConnectTimeout=15'];
	if (port) {
		sshArgs.push('-p', port);
		scpArgs.push('-P', port);
	}
	if (keyFile) {
		sshArgs.push('-i', keyFile);
		scpArgs.push('-i', keyFile);
	}
	return { host, ssh: sshArgs, scp: scpArgs };
}

function shellQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function sshCapture(command: string): Promise<{ success: boolean; stdout: string }> {
	const { host, ssh } = getSshArgs();
	try {
		const result = await runCommand('ssh', [...ssh, host, command], {
			stdout: 'piped',
			stderr: 'piped',
			quietOnError: true,
		});
		return { success: true, stdout: Buffer.from(result.stdout).toString('utf-8').trim() };
	} catch {
		return { success: false, stdout: '' };
	}
}

async function scpUpload(localPath: string, remotePath: string): Promise<void> {
	const { host, scp } = getSshArgs();
	await runCommand('scp', [...scp, localPath, `${host}:${remotePath}`], {
		stdout: 'piped',
		stderr: 'piped',
	});
}

/**
 * Parses `md5sum` / `sha256sum` output (`<hash>  <filename>`), returning the
 * lowercase hash hex or `undefined` if it doesn't match the expected length.
 *
 * Exported for testing.
 */
export function parseHashOutput(stdout: string, hashType: HashType): string | undefined {
	const hash = stdout.split(/\s/)[0]?.toLowerCase();
	if (!hash || hash.length !== HASH_LENGTHS[hashType]) return undefined;
	if (!/^[0-9a-f]+$/.test(hash)) return undefined;
	return hash;
}

/**
 * Formats a hash line in `md5sum -c` compatible form: `<hash>  <basename>\n`.
 * Exported for testing.
 */
export function formatHashLine(hash: string, remotePath: string): string {
	return `${hash}  ${basename(remotePath)}\n`;
}

export interface EnsureRemoteHashesOptions {
	/**
	 * Recompute hashes even when the remote sidecar already exists. Use this
	 * after re-uploading a file so the stale sidecar gets replaced. Default false.
	 */
	force?: boolean;
}

export interface RemoteHashStats {
	computed: number;
	skipped: number;
}

/**
 * For every `remotePath`, ensures `<remotePath>.md5` and `<remotePath>.sha256`
 * exist on the remote. Throws if any hash computation or upload fails.
 */
export async function ensureRemoteHashes(
	remotePaths: string[],
	options?: EnsureRemoteHashesOptions,
): Promise<RemoteHashStats> {
	const force = options?.force ?? false;
	const stats: RemoteHashStats = { computed: 0, skipped: 0 };

	for (const remotePath of remotePaths) {
		for (const hashType of HASH_TYPES) {
			const sidecarPath = `${remotePath}.${hashType}`;

			if (!force) {
				const exists = await sshCapture(`ls ${shellQuote(sidecarPath)}`);
				if (exists.success) {
					stats.skipped++;
					continue;
				}
			}

			console.log(`  ${hashType.padEnd(6)} ${basename(remotePath)} — computing on remote…`);
			const result = await sshCapture(`${hashType}sum ${shellQuote(remotePath)}`);
			if (!result.success || result.stdout.length === 0) {
				throw new Error(`Failed to compute ${hashType} for ${remotePath} on remote`);
			}
			const hash = parseHashOutput(result.stdout, hashType);
			if (!hash) {
				throw new Error(`Invalid ${hashType} output for ${remotePath}: "${result.stdout}"`);
			}

			const tmpFile = join(tmpdir(), `orthophoto-hash-${randomBytes(8).toString('hex')}.${hashType}`);
			writeFileSync(tmpFile, formatHashLine(hash, remotePath));
			try {
				await scpUpload(tmpFile, sidecarPath);
			} finally {
				try {
					unlinkSync(tmpFile);
				} catch {
					/* ignore */
				}
			}
			stats.computed++;
		}
	}

	return stats;
}
