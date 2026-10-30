/** A vitest project of the config, as the guard reads it. */
export type ConfiguredProject = {
	readonly name: string
	readonly include: readonly string[]
	readonly exclude: readonly string[]
	readonly setupFiles: readonly string[]
	readonly environment: string | undefined
	readonly inBrowser: boolean
}

/** A step of the package's `dialecte.gate` lists. */
export type GateStep = {
	readonly name: string
	readonly run: string
}

/** The part of package.json the guard reads. */
export type PackageManifest = {
	readonly scripts: Readonly<Record<string, string>>
	readonly dialecte: {
		readonly gate: {
			readonly fast: readonly GateStep[]
			readonly full: readonly GateStep[]
		}
	}
}

/** The projects a command runs, in order: the first one, then the others with their files. */
export type TierRun = {
	readonly first: string | undefined
	readonly thenFiles: readonly string[]
	readonly thenAllInBrowser: boolean
}
