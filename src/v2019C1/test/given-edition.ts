import { ROOT_OPT_IN_NEEDS, SCL_EDITION_ATTRIBUTES } from './given-edition.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type {
	AssertGivenEditionsParams,
	MissingSclEditionParams,
	RootEdition,
	RootEditionParams,
	RootOptInReasonParams,
	SclEditionAttribute,
} from './given-edition.types'

/**
 * Refuse a case whose given document states its SCL version without its revision and release, always; refuse one whose
 * root states no SCL version (a first-edition file) unless the case says it is one on purpose (`editionOneRoot`, with
 * the reason); refuse the opt-in without a reason, or when every given document states its version. Every current
 * file states `version="2007" revision="C" release="5"`, as `ALL_XMLNS_NAMESPACES` does. One read of each document's
 * root.
 *
 * @intent check that a test fixture states its SCL edition, refuse a fixture root without version or with its version only, allow a first-edition fixture on purpose
 */
export async function assertGivenEditions(params: AssertGivenEditionsParams): Promise<void> {
	const { source, target, label, editionOneRoot } = params
	assertRootOptInReason({ name: 'editionOneRoot', reason: editionOneRoot, label })
	const editions = [
		await readRootEdition({ role: 'source', document: source }),
		await readRootEdition({ role: 'target', document: target }),
	].filter((edition): edition is RootEdition => edition !== undefined)
	const partial = editions.find((edition) => edition.version !== '' && edition.missing.length > 0)
	if (partial) {
		throw new Error(
			`${label}: the ${partial.role} document states SCL version ${partial.version} but not its ${partial.missing.join(' and ')} on its root: a current file states version="2007" revision="C" release="5" (ALL_XMLNS_NAMESPACES does)`,
		)
	}
	const withoutVersion = editions.filter((edition) => edition.version === '')
	if (editionOneRoot !== undefined) {
		if (withoutVersion.length > 0) return
		throw new Error(
			`${label}: editionOneRoot is given but every given document states its SCL version: remove it`,
		)
	}
	const [first] = withoutVersion
	if (!first) return
	throw new Error(
		`${label}: the ${first.role} document states no SCL version on its root: a current file states version="2007" revision="C" release="5" (ALL_XMLNS_NAMESPACES does); a first-edition file on purpose sets editionOneRoot with the reason`,
	)
}

/**
 * The edition attributes an `SCL` root lacks, in their order: `[]` when it states its edition whole, `version` among
 * them for a first-edition file.
 *
 * @intent tell which of version, revision and release an SCL root lacks
 */
export function missingSclEditionAttributes(
	params: MissingSclEditionParams,
): SclEditionAttribute[] {
	return SCL_EDITION_ATTRIBUTES.filter((name) => !params.states(name))
}

/** A document's root as its edition reads, `undefined` for no document. */
async function readRootEdition(params: RootEditionParams): Promise<RootEdition | undefined> {
	const { role, document } = params
	if (!document) return undefined
	const root = await document.query.getRoot()
	// as written, `''` when absent: an attribute written empty states nothing either
	function stated(name: SclEditionAttribute): string {
		return readAttribute({ record: root, name, defaults: 'none' }) ?? ''
	}
	return {
		role,
		version: stated('version'),
		missing: missingSclEditionAttributes({ states: (name) => stated(name) !== '' }),
	}
}

/**
 * Refuse a root opt-in of a case (`editionOneRoot`, `noExtensionVersion`) set without a reason; before the suite runs
 * when a runner checks its cases. A reason only, unlike `assertAllowInvalidFixtureReason`, which also checks the
 * violations an output opt-out lists.
 */
export function assertRootOptInReason(params: RootOptInReasonParams): void {
	const { name, reason, label } = params
	if (reason === undefined || reason.trim() !== '') return
	throw new Error(`${label}: ${name} needs ${ROOT_OPT_IN_NEEDS[name]}`)
}
