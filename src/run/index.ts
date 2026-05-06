/**
 * Public surface for the `run/` subsystem (CLI parsing, task implementations,
 * and SSH/SCP plumbing). Consumers outside `run/` should import from this
 * barrel rather than reaching into individual files.
 */

export { expandRegionPattern, getHelpText, parseArgs } from './args.ts';
export { checkRequiredCommands, remoteFileExists, runScpUpload, runSshCommand } from './commands.ts';
export { formatUnknownRegionError, runTask, type TaskContext } from './tasks.ts';
