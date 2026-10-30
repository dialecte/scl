/**
 * Prints the projects of a vitest config as JSON on stdout, loaded as vitest loads it, in the environment of the
 * process: the tier guard runs it in the environment of a run it stands for (a mutation run names its project in the
 * environment). What the config logs goes to stderr. `tsx scripts/test-tiers/print-vitest-projects.ts <config file>`
 */
import { printedProjectsOf, routeConsoleToStderr } from './printed-projects'

import { loadConfigFromFile } from 'vite'

const configFile = process.argv[2]
if (configFile === undefined) throw new Error('print-vitest-projects: name the config file')
routeConsoleToStderr()
const loaded = await loadConfigFromFile(
	{ command: 'serve', mode: 'test' },
	configFile,
	process.cwd(),
)
if (!loaded) throw new Error(`print-vitest-projects: no config in ${configFile}`)
process.stdout.write(JSON.stringify(printedProjectsOf({ config: loaded.config })))
