import { readAttribute } from '@/v2019C1/helpers'

import type {
	AssertGivenEditionsParams,
	EditionOneRootReasonParams,
	RootVersionParams,
} from './given-edition.types'

/**
 * Refuse a case whose given document states no SCL version on its root (a first-edition file) unless the case says it
 * is one on purpose (`editionOneRoot`, with the reason); refuse the opt-in without a reason, or when every given
 * document states its version. Every current file states `version="2007" revision="C" release="5"`, as
 * `ALL_XMLNS_NAMESPACES` does. One read of each document's root.
 *
 * @intent check that a test fixture states its SCL edition, refuse a fixture root without version, allow a first-edition fixture on purpose
 */
export async function assertGivenEditions(params: AssertGivenEditionsParams): Promise<void> {
	const { source, target, label, editionOneRoot } = params
	if (editionOneRoot !== undefined && editionOneRoot.trim() === '')
		throw new Error(
			`${label}: editionOneRoot needs the reason a given document is a first-edition file`,
		)
	const sourceVersion = await readRootVersion({ document: source })
	const targetVersion = await readRootVersion({ document: target })
	const withoutVersion = [
		...(sourceVersion === '' ? ['source'] : []),
		...(targetVersion === '' ? ['target'] : []),
	]
	if (editionOneRoot !== undefined) {
		if (withoutVersion.length > 0) return
		throw new Error(
			`${label}: editionOneRoot is given but every given document states its SCL version: remove it`,
		)
	}
	const [first] = withoutVersion
	if (!first) return
	throw new Error(
		`${label}: the ${first} document states no SCL version on its root: a current file states version="2007" revision="C" release="5" (ALL_XMLNS_NAMESPACES does); a first-edition file on purpose sets editionOneRoot with the reason`,
	)
}

/** The version a document's root states as written: `''` when it states none, `undefined` for no document. */
async function readRootVersion(params: RootVersionParams): Promise<string | undefined> {
	if (!params.document) return undefined
	const root = await params.document.query.getRoot()
	return readAttribute({ record: root, name: 'version', defaults: 'none' }) ?? ''
}

/** Refuse an `editionOneRoot` opt-in that gives no reason, before the suite runs when a runner checks its cases. */
export function assertEditionOneRootReason(params: EditionOneRootReasonParams): void {
	const { editionOneRoot, label } = params
	if (editionOneRoot === undefined || editionOneRoot.trim() !== '') return
	throw new Error(
		`${label}: editionOneRoot needs the reason a given document is a first-edition file`,
	)
}
