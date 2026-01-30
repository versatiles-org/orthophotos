/**
 * Retry logic wrapper for operations that may fail due to transient issues.
 */

interface RetryOptions {
	maxAttempts?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
	backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
	maxAttempts: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function with exponential backoff retry logic.
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns The result of the function
 * @throws The last error if all attempts fail
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let lastError: Error | undefined;
	let delay = opts.initialDelayMs;

	for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === opts.maxAttempts) {
				break;
			}

			console.warn(
				`Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`,
			);

			await sleep(delay);
			delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
		}
	}

	throw lastError;
}

/**
 * Executes a Deno.Command with retry logic.
 * @param commandName The command to execute
 * @param args Command arguments
 * @param options Retry configuration options
 * @returns The command output
 * @throws If the command fails after all retry attempts
 */
export function runCommandWithRetry(
	commandName: string,
	args: string[],
	options: RetryOptions = {},
): Promise<Deno.CommandOutput> {
	return withRetry(async () => {
		const command = new Deno.Command(commandName, {
			args,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		const output = await command.output();
		if (!output.success) {
			throw new Error(`${commandName} exited with code ${output.code}`);
		}
		return output;
	}, options);
}
