import type {
	CorpusV2Entry,
	CorpusV2Family,
	PlanCorpusV2FamilyParams,
	PlanCorpusV2Params,
} from './corpus-v2.types'

/**
 * The families of the corpus, one per Header uuid (a file of its own uuid is its own family), in path order of their
 * smoke file. A byte duplicate of another file of its family is dropped, keeping a file with the dialect's own
 * extension (`.fsd`, `.asd`, `.ssd`) over an `.xml` copy, then the shorter name, then the first path. The smoke file
 * is the latest revision (version, then revision) that is not quarantined, or the latest when all are; the other
 * revisions are kept as pairs. Two files of one revision with other bytes cannot be ordered: the copy order decides,
 * and the family lists them (`sameRevision`).
 */
export function planCorpusV2(params: PlanCorpusV2Params): CorpusV2Family[] {
	const { entries, quarantined } = params

	const byUuid = new Map<string, CorpusV2Entry[]>()
	for (const entry of entries)
		byUuid.set(entry.headerUuid, [...(byUuid.get(entry.headerUuid) ?? []), entry])

	return [...byUuid.entries()]
		.map(([headerUuid, members]) => planFamily({ headerUuid, members, quarantined }))
		.sort((left, right) => left.smoke.path.localeCompare(right.smoke.path))
}

function planFamily(params: PlanCorpusV2FamilyParams): CorpusV2Family {
	const { headerUuid, members, quarantined } = params

	const kept: CorpusV2Entry[] = []
	const duplicates: CorpusV2Entry[] = []
	for (const entry of [...members].sort(byPreferredCopy)) {
		if (kept.some((other) => other.sha256 === entry.sha256)) duplicates.push(entry)
		else kept.push(entry)
	}

	const latestFirst = [...kept].sort(byLatestRevision)
	const smoke = latestFirst.find((entry) => !quarantined(entry.path)) ?? latestFirst[0]
	const pairs = latestFirst
		.filter((entry) => entry !== smoke)
		.sort((l, r) => l.path.localeCompare(r.path))
	const sameRevision = pairs.filter((pair) => byLatestRevision(pair, smoke) === 0)
	return { headerUuid, smoke, pairs, duplicates, sameRevision }
}

/** The copy to keep first: the dialect's own extension over `.xml`, then the shorter name, then the path. */
function byPreferredCopy(left: CorpusV2Entry, right: CorpusV2Entry): number {
	const xml = Number(isXmlCopy(left.path)) - Number(isXmlCopy(right.path))
	if (xml !== 0) return xml
	const length = fileNameOf(left.path).length - fileNameOf(right.path).length
	return length !== 0 ? length : left.path.localeCompare(right.path)
}

/** The latest revision first: by version, then revision, numbers compared as numbers. */
function byLatestRevision(left: CorpusV2Entry, right: CorpusV2Entry): number {
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
