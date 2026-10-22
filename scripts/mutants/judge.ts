/**
 * The verdict of the mutation gate on a StrykerJS report: every mutant a test notices (killed, or timed out again
 * when run alone), or recorded with the reason it cannot change any output. A record's key hashes what the mutant
 * changed - file, mutator, original code, replacement, the text of its line - and counts the identical lines written
 * earlier in the file, so a line moving does not unlist it.
 */
import { createHash } from 'node:crypto'

import {
	DIFF_HUNK,
	DIFF_NEW_PATH,
	KILLED_STATUS,
	MUTABLE_SOURCE,
	MUTATE_TARGET,
	SURVIVING_STATUSES,
	TIMEOUT_STATUS,
} from './mutants.constants'

import type {
	EquivalentMutant,
	EquivalentMutants,
	MutateTarget,
	MutationReport,
	Position,
	ReportedFile,
	ReportedMutant,
	Survivor,
	Verdict,
} from './mutants.types'

/**
 * The survivors, those the records do not list with a reason, and the recorded mutants that no longer survive: one
 * the run tested and killed, or, in a file mutated whole, one the run no longer finds.
 */
export function judgeReport(params: {
	report: MutationReport
	records: EquivalentMutants
	wholeFiles?: readonly string[]
}): Verdict {
	const { report, records, wholeFiles = [] } = params
	const tested = Object.entries(report.files).flatMap(([file, reported]) =>
		reported.mutants.map((mutant) => ({
			mutant,
			survivor: describeMutant({ file, reported, mutant }),
		})),
	)
	const survivors = tested
		.filter(({ mutant }) => SURVIVING_STATUSES.has(mutant.status))
		.map(({ survivor }) => survivor)
	const unlisted = survivors.filter(
		(survivor) => !(records[survivor.file]?.[survivor.key]?.equivalent ?? '').trim(),
	)
	const killed = tested
		.filter(
			({ mutant, survivor }) =>
				!SURVIVING_STATUSES.has(mutant.status) &&
				records[survivor.file]?.[survivor.key] !== undefined,
		)
		.map(({ survivor: { file, key } }) => ({ file, key }))
	const found = new Set(tested.map(({ survivor: { file, key } }) => `${file}\0${key}`))
	const gone = wholeFiles.flatMap((file) =>
		Object.keys(records[file] ?? {})
			.filter((key) => !found.has(`${file}\0${key}`))
			.map((key) => ({ file, key })),
	)
	return { survivors, unlisted, stale: [...killed, ...gone] }
}

/** The records with the run's survivors (a reason already written is kept) and without the stale ones. */
export function recordSurvivors(params: {
	records: EquivalentMutants
	verdict: Verdict
}): EquivalentMutants {
	const { records, verdict } = params
	const next: Record<string, Record<string, EquivalentMutant>> = Object.fromEntries(
		Object.entries(records).map(([file, mutants]) => [file, { ...mutants }]),
	)
	for (const { file, key } of verdict.stale) delete next[file]?.[key]
	for (const { file, key, line, mutation } of verdict.survivors)
		next[file] = {
			...next[file],
			[key]: { line, mutation, equivalent: records[file]?.[key]?.equivalent ?? '' },
		}
	return Object.fromEntries(
		Object.entries(next)
			.filter(([, mutants]) => Object.keys(mutants).length > 0)
			.sort(([first], [second]) => first.localeCompare(second))
			.map(([file, mutants]) => [
				file,
				Object.fromEntries(
					Object.entries(mutants).sort(([, first], [, second]) => first.line - second.line),
				),
			]),
	)
}

export function survivorKey(params: {
	file: string
	mutatorName: string
	original: string
	replacement: string
	line: string
	column: number
}): string {
	const { file, mutatorName, original, replacement, line, column } = params
	return createHash('sha256')
		.update([file, mutatorName, original, replacement, line, column].join('\0'))
		.digest('hex')
		.slice(0, 16)
}

/** A `--mutate` target read as StrykerJS reads it. */
export function parseTarget(params: { target: string }): MutateTarget {
	const [, file = '', startLine, startColumn, endLine, endColumn] =
		MUTATE_TARGET.exec(params.target) ?? []
	if (startLine === undefined || endLine === undefined) return { file }
	return {
		file,
		range: {
			start: { line: Number(startLine), column: Number(startColumn ?? 0) },
			end: { line: Number(endLine), column: Number(endColumn ?? Number.MAX_SAFE_INTEGER) },
		},
	}
}

/**
 * The report cut to the mutants of the targets: an incremental report also carries the results of earlier runs on
 * other files and ranges, which this run did not ask for.
 */
export function withinTargets(params: {
	report: MutationReport
	targets: readonly MutateTarget[]
}): MutationReport {
	const { report, targets } = params
	const files = Object.entries(report.files).flatMap(
		([file, reported]): [string, ReportedFile][] => {
			const ofFile = targets.filter((target) => target.file === file)
			const mutants = reported.mutants.filter((mutant) =>
				ofFile.some(({ range }) => range === undefined || contains({ range, mutant })),
			)
			return mutants.length > 0 ? [[file, { ...reported, mutants }]] : []
		},
	)
	return { ...report, files: Object.fromEntries(files) }
}

/**
 * The report with the verdicts of the timed-out mutants run again alone: each takes the status of its lone run, so a
 * timeout stays one only when it repeats. The lone run re-mutates them at their ranges.
 */
export function withLoneTimeouts(params: {
	report: MutationReport
	alone: MutationReport
}): MutationReport {
	const { report, alone } = params
	const statusAlone = new Map(
		Object.entries(alone.files).flatMap(([file, { mutants }]) =>
			mutants.map((mutant): [string, string] => [sameMutant({ file, mutant }), mutant.status]),
		),
	)
	return mapMutants({
		report,
		map: ({ file, mutant }) =>
			mutant.status === TIMEOUT_STATUS
				? { ...mutant, status: statusAlone.get(sameMutant({ file, mutant })) ?? mutant.status }
				: mutant,
	})
}

/**
 * The fast run's report with the full run's verdicts on its survivors: a mutant either run kills is killed. The full
 * run re-mutates only the survivors, at their ranges.
 */
export function withFullRun(params: {
	fast: MutationReport
	full: MutationReport
}): MutationReport {
	const { fast, full } = params
	const killedInFull = new Set(
		Object.entries(full.files).flatMap(([file, { mutants }]) =>
			mutants
				.filter((mutant) => !SURVIVING_STATUSES.has(mutant.status))
				.map((mutant) => sameMutant({ file, mutant })),
		),
	)
	return mapMutants({
		report: fast,
		map: ({ file, mutant }) =>
			SURVIVING_STATUSES.has(mutant.status) && killedInFull.has(sameMutant({ file, mutant }))
				? { ...mutant, status: KILLED_STATUS }
				: mutant,
	})
}

/** The mutants of a status, each at its range, once each. */
export function rangesOf(params: {
	report: MutationReport
	select: (status: string) => boolean
}): string[] {
	const { report, select } = params
	const ranges = Object.entries(report.files).flatMap(([file, { mutants }]) =>
		mutants.filter(({ status }) => select(status)).map((mutant) => exactRange({ file, mutant })),
	)
	return [...new Set(ranges)]
}

/**
 * A mutant's location in StrykerJS's `--mutate file:line:column-line:column` form - its start column counted from 0,
 * where the report counts from 1 - so a run re-mutates that mutant (and the mutants nested in it).
 */
export function exactRange(params: { file: string; mutant: ReportedMutant }): string {
	const { file, mutant } = params
	const { start, end } = mutant.location
	return `${file}:${start.line}:${start.column - 1}-${end.line}:${end.column}`
}

/**
 * The ranges a change holds, from `git diff -U0` output (paths unquoted): the added and changed lines of each source
 * file it keeps, then the untracked source files whole. A hunk that only deletes lines has nothing to mutate.
 */
export function diffRanges(params: { diff: string; untracked: readonly string[] }): string[] {
	const { diff, untracked } = params
	const ranges: string[] = []
	let file: string | undefined
	let previous = ''
	for (const line of diff.split('\n')) {
		// a file header follows its `--- ` line: an added line starting with `++ ` is content
		if (previous.startsWith('--- ') && line.startsWith('+++ ')) {
			const path = line.startsWith(DIFF_NEW_PATH)
				? line.slice(DIFF_NEW_PATH.length).replace(/\t$/, '')
				: undefined
			file = path !== undefined && MUTABLE_SOURCE.test(path) ? path : undefined
		} else {
			const hunk = DIFF_HUNK.exec(line)
			const count = hunk?.[2] === undefined ? 1 : Number(hunk[2])
			if (file && hunk && count > 0)
				ranges.push(`${file}:${Number(hunk[1])}-${Number(hunk[1]) + count - 1}`)
		}
		previous = line
	}
	return [...new Set([...ranges, ...untracked.filter((path) => MUTABLE_SOURCE.test(path))])]
}

function describeMutant(params: {
	file: string
	reported: ReportedFile
	mutant: ReportedMutant
}): Survivor {
	const { file, reported, mutant } = params
	const lines = reported.source.split('\n')
	const { start } = mutant.location
	const startLine = lines[start.line - 1] ?? ''
	const text = startLine.trim()
	const original = slice({ source: reported.source, mutant })
	const replacement = mutant.replacement ?? ''
	const base = survivorKey({
		file,
		mutatorName: mutant.mutatorName,
		original,
		replacement,
		line: text,
		column: start.column - 1 - (startLine.length - startLine.trimStart().length),
	})
	// the same line written earlier in the file: numbered in reading order
	const repeat = lines.slice(0, start.line - 1).filter((line) => line.trim() === text).length
	return {
		file,
		key: repeat === 0 ? base : `${base}-${repeat}`,
		line: start.line,
		mutation: `${mutant.mutatorName}: ${original} -> ${replacement}`.slice(0, 160),
		range: exactRange({ file, mutant }),
	}
}

/** The source text a mutant replaces. */
function slice(params: { source: string; mutant: ReportedMutant }): string {
	const { source, mutant } = params
	const { start, end } = mutant.location
	return source.slice(offsetOf({ source, position: start }), offsetOf({ source, position: end }))
}

function offsetOf(params: { source: string; position: Position }): number {
	const { source, position } = params
	let offset = 0
	for (let line = 1; line < position.line; line++) offset = source.indexOf('\n', offset) + 1
	return offset + position.column - 1
}

/** Whether a target's range holds the mutant (the report's columns from 1, the range's from 0). */
function contains(params: {
	range: NonNullable<MutateTarget['range']>
	mutant: ReportedMutant
}): boolean {
	const { range, mutant } = params
	const { start, end } = mutant.location
	return (
		compare({ first: range.start, second: { line: start.line, column: start.column - 1 } }) <= 0 &&
		compare({ first: { line: end.line, column: end.column - 1 }, second: range.end }) <= 0
	)
}

function compare(params: { first: Position; second: Position }): number {
	const { first, second } = params
	return first.line === second.line ? first.column - second.column : first.line - second.line
}

function mapMutants(params: {
	report: MutationReport
	map: (params: { file: string; mutant: ReportedMutant }) => ReportedMutant
}): MutationReport {
	const { report, map } = params
	return {
		...report,
		files: Object.fromEntries(
			Object.entries(report.files).map(([file, reported]) => [
				file,
				{ ...reported, mutants: reported.mutants.map((mutant) => map({ file, mutant })) },
			]),
		),
	}
}

/** A mutant across two runs: its file, location, mutator and replacement (ids differ from run to run). */
function sameMutant(params: { file: string; mutant: ReportedMutant }): string {
	const { file, mutant } = params
	const { start, end } = mutant.location
	return [
		file,
		start.line,
		start.column,
		end.line,
		end.column,
		mutant.mutatorName,
		mutant.replacement ?? '',
	].join('\0')
}
