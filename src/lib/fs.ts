/**
 * Filesystem helper utilities.
 */

/**
 * Safely removes a directory, ignoring NotFound errors.
 * @param path Path to the directory to remove
 */
export async function safeRemoveDir(path: string): Promise<void> {
	try {
		await Deno.remove(path, { recursive: true });
	} catch (e) {
		if (!(e instanceof Deno.errors.NotFound)) {
			throw e;
		}
	}
}

/**
 * Safely removes a file, ignoring NotFound errors.
 * @param path Path to the file to remove
 */
export async function safeRemoveFile(path: string): Promise<void> {
	try {
		await Deno.remove(path);
	} catch (e) {
		if (!(e instanceof Deno.errors.NotFound)) {
			throw e;
		}
	}
}
