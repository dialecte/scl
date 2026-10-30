/** How `print-vitest-projects.ts` reads a vitest config's projects: the fields the tier guard compares, as data. */
import type { PrintedProject } from './test-tiers.types'

function recordOf(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** What the guard reads of a project: the browser's provider is no data, its `enabled` flag is. */
export function toPrintedProject(params: { project: unknown }): PrintedProject {
	const test = recordOf(recordOf(params.project).test)
	return {
		test: {
			name: test.name,
			include: test.include,
			exclude: test.exclude,
			setupFiles: test.setupFiles,
			environment: test.environment,
			isolate: test.isolate,
			browser: { enabled: recordOf(test.browser).enabled },
		},
	}
}

/** The inline projects of a loaded vitest config, each as the guard reads it. */
export function printedProjectsOf(params: { config: unknown }): PrintedProject[] {
	const projects = recordOf(recordOf(params.config).test).projects
	return (Array.isArray(projects) ? projects : []).map(function printed(project: unknown) {
		return toPrintedProject({ project })
	})
}

/** Sends what a loaded config logs to stderr: stdout carries the printed projects alone. */
export function routeConsoleToStderr(): void {
	function toStderr(...values: unknown[]): void {
		process.stderr.write(`${values.map(String).join(' ')}\n`)
	}
	console.log = toStderr
	console.info = toStderr
	console.debug = toStderr
}
