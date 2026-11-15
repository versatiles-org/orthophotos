/**
 * Worker thread of `maskFillFile`: masks one raster, so rasters masked in parallel use one core each.
 * An error is thrown out of the worker, and `maskFillFile` rejects with it.
 */

import { workerData } from 'node:worker_threads';
import { maskFillFileInThread, type FillMaskFileOptions } from './fill-mask.ts';

const { input, output, options } = workerData as { input: string; output: string; options?: FillMaskFileOptions };
await maskFillFileInThread(input, output, options);
