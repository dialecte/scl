/** The part of StrykerJS's JSON report (mutation-testing-elements) the gate reads. */
export type MutationReport = {
	readonly files: Readonly<Record<string, ReportedFile>>
}

export type ReportedFile = {
	readonly source: string
	readonly mutants: readonly ReportedMutant[]
}

export type ReportedMutant = {
	readonly id: string
	readonly mutatorName: string
	readonly replacement?: string
	readonly status: string
	readonly location: { readonly start: Position; readonly end: Position }
}

/** 1-based line and column, as StrykerJS reports them. */
export type Position = { readonly line: number; readonly column: number }

/** A mutant no test noticed: where it is, what it changed, its key in the records and its exact range. */
export type Survivor = {
	readonly file: string
	readonly key: string
	readonly line: number
	readonly mutation: string
	/** `file:line:column-line:column`, the form `--mutate` takes to re-mutate exactly this mutant. */
	readonly range: string
}

/** Per mutated file, the mutants recorded with the reason none of them can alter any output. */
export type EquivalentMutants = Readonly<Record<string, Readonly<Record<string, EquivalentMutant>>>>

export type EquivalentMutant = {
	readonly line: number
	readonly mutation: string
	/** Why no output can differ; empty until someone writes it - the gate refuses an empty reason. */
	readonly equivalent: string
}

export type Verdict = {
	readonly survivors: readonly Survivor[]
	/** Survivors the records do not list, or list without a reason. */
	readonly unlisted: readonly Survivor[]
	/** Recorded mutants the run tested that no longer survive. */
	readonly stale: readonly { readonly file: string; readonly key: string }[]
}

/** A test file the node stand-ins cannot carry: only the browser tier runs it. */
export type BrowserOnlyTest = { readonly file: string; readonly reason: string }

/** A `--mutate` target: a file, whole or within a range (lines 1-based, columns 0-based as `--mutate` counts them). */
export type MutateTarget = {
	readonly file: string
	readonly range?: { readonly start: Position; readonly end: Position }
}

/** What the driver runs: the node tier, the browser tier on the survivors, or both in turn. */
export type MutantsTier = 'fast' | 'full' | 'all'

export type MutantsArguments = {
	readonly tier: MutantsTier
	/** Write the survivors into the records (new ones with an empty reason) and drop the stale ones. */
	readonly record: boolean
	/** Run every mutant again, the incremental results left aside. */
	readonly force: boolean
	/** The changed lines since this git revision are mutated, the untracked source files whole. */
	readonly diffBase?: string
	/** Files and ranges named on the command line, in the form `--mutate` takes. */
	readonly targets: readonly string[]
}

/** The fast tier's verdicts, kept for the full tier: the report and the files it mutated whole. */
export type FastVerdict = MutationReport & { readonly wholeFiles: readonly string[] }

/** The part of a StrykerJS config the driver reads: where the run writes its report. */
export type StrykerConfig = { readonly jsonReporter: { readonly fileName: string } }
