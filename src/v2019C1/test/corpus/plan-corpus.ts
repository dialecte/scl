import type {
	CorpusEntry,
	CorpusFamily,
	PlanCorpusFamilyParams,
	PlanCorpusParams,
} from './corpus.types'

/**
 * The families of the corpus, one per Header uuid (a file of its own uuid is its own family), in path order of their
 * smoke file (of their first file when they have none). A byte duplicate of another file of its family is dropped,
 * keeping a file with the dialect's own extension (`.fsd`, `.asd`, `.ssd`) over an `.xml` copy, then the shorter name,
 * then the first path. The smoke file is the latest revision (version, then revision) that is not excluded; a family
 * whose every revision is excluded has none. In a family of several revisions the others are kept as pairs, an
 * excluded one included (fork tests read a revision as it was written); the only revision of a family, when excluded,
 * is left out. Two files of one revision with other bytes cannot be ordered: the copy order decides, and the family
 * lists them (`sameRevision`).
 */
export function planCorpus(params: PlanCorpusParams): CorpusFamily[] {
	const { entries, excluded } = params

	const byUuid = new Map<string, CorpusEntry[]>()
	for (const entry of entries)
		byUuid.set(entry.headerUuid, [...(byUuid.get(entry.headerUuid) ?? []), entry])

	return [...byUuid.entries()]
		.map(([headerUuid, members]) => planFamily({ headerUuid, members, excluded }))
		.sort((left, right) => familyPath(left).localeCompare(familyPath(right)))
}

function planFamily(params: PlanCorpusFamilyParams): CorpusFamily {
	const { headerUuid, members, excluded } = params

	const kept: CorpusEntry[] = []
	const duplicates: CorpusEntry[] = []
	for (const entry of [...members].sort(byPreferredCopy)) {
		if (kept.some((other) => other.sha256 === entry.sha256)) duplicates.push(entry)
		else kept.push(entry)
	}

	const latestFirst = [...kept].sort(byLatestRevision)
	const smoke = latestFirst.find((entry) => !excluded(entry.path))
	const others = latestFirst
		.filter((entry) => entry !== smoke)
		.sort((left, right) => left.path.localeCompare(right.path))
	const pairs = kept.length > 1 ? others : []
	const sameRevision = smoke ? pairs.filter((pair) => byLatestRevision(pair, smoke) === 0) : []
	return {
		headerUuid,
		smoke,
		pairs,
		duplicates,
		sameRevision,
		excluded: kept.length > 1 ? [] : others,
	}
}

/** The path a family is ordered by: its smoke file, or its first file when it has none. */
function familyPath(family: CorpusFamily): string {
	return family.smoke?.path ?? [...family.pairs, ...family.excluded][0]?.path ?? ''
}

/** The copy to keep first: the dialect's own extension over `.xml`, then the shorter name, then the path. */
function byPreferredCopy(left: CorpusEntry, right: CorpusEntry): number {
	const xml = Number(isXmlCopy(left.path)) - Number(isXmlCopy(right.path))
	if (xml !== 0) return xml
	const length = fileNameOf(left.path).length - fileNameOf(right.path).length
	return length !== 0 ? length : left.path.localeCompare(right.path)
}

/** The latest revision first: by version, then revision, numbers compared as numbers. */
function byLatestRevision(left: CorpusEntry, right: CorpusEntry): number {
	const version = compareRevisionPart(right.version, left.version)
	return version !== 0 ? version : compareRevisionPart(right.revision, left.revision)
}

function compareRevisionPart(left: string, right: string): number {
	return left.localeCompare(right, undefined, { numeric: true })
}

function isXmlCopy(path: string): boolean {
	return path.toLowerCase().endsWith('.xml')
}

function fileNameOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1)
}
