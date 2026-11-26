import threeOutsideXml from '../../integration/copy/fixtures/a-function-to-copy-three-outside-signals.xml?raw'
import oneOutsideXml from '../../integration/copy/fixtures/a-function-to-copy.xml?raw'
import { planReferences } from './plan-references'
import {
	CID_REFERENCE_POLICIES,
	PROCESS_PAIRS_NOT_GROUPED,
	PROCESS_REFERENCE_FAMILIES,
	REFERENCE_HOLDER_TAGS,
} from './reference-closure.constants'

import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { openSclDocument, runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { ProcessReferencePolicy } from './reference-closure.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'
import type * as Core from '@dialecte/core'

/** Every family kept whatever its class: what a copy's report plans with. */
const KEEP_EVERY_FAMILY: ProcessReferencePolicy = {
	'source-signal': { inside: 'keep', present: 'keep', absent: 'keep' },
	'control-signal': { inside: 'keep', present: 'keep', absent: 'keep' },
	'function-reference': { inside: 'keep', present: 'keep', absent: 'keep' },
	'terminal-node': { inside: 'keep', present: 'keep', absent: 'keep' },
}

/** The registry pair of a holder and uuid attribute, read for a person. */
function pairKey(holder: string, uuidAttribute: string): string {
	return `${holder}.${uuidAttribute}`
}

// Each process family is one pair of the reference-pair registry, with the shape its holder takes when the reference is
// dropped: a specification of an input or an output keeps its own content and loses its link; a function reference and a
// terminal name what they need, and go whole.
describe('the process families of the reference planner', () => {
	it('each family -> its registry pair and its drop shape', () => {
		const rows = Object.entries(PROCESS_REFERENCE_FAMILIES).map(
			([family, row]) => `${family} ${pairKey(row.holder, row.uuidAttribute)} ${row.drop}`,
		)
		expect(rows.sort()).toEqual([
			'control-signal ControlRef.controlledLNodeUuid reduce',
			'function-reference FunctionRef.functionUuid remove',
			'source-signal SourceRef.sourceLNodeUuid reduce',
			'terminal-node Terminal.cNodeUuid remove',
		])
	})

	it("each family's pair -> a pair of the registry", () => {
		const registry = new Set(
			Object.entries(UUID_REFERENCE_PAIRS).flatMap(([holder, pairs]) =>
				pairs.map((pair) => pairKey(holder, pair.attribute.uuid)),
			),
		)
		const families = Object.values(PROCESS_REFERENCE_FAMILIES).map((row) =>
			pairKey(row.holder, row.uuidAttribute),
		)
		expect({
			count: families.length,
			unknown: families.filter((key) => !registry.has(key)),
		}).toEqual({
			count: 4,
			unknown: [],
		})
	})

	// no pair below what a copy places goes in silently: each is a family, or set aside with its reason
	it('the registry pairs of every holder a Function, SubFunction or Application may hold -> a family, or set aside', () => {
		const below = holdersBelow(['Function', 'SubFunction', 'Application'])
		const registered = Object.entries(UUID_REFERENCE_PAIRS)
			.filter(([holder]) => below.has(holder))
			.flatMap(([holder, pairs]) => pairs.map((pair) => pairKey(holder, pair.attribute.uuid)))
		const grouped = Object.values(PROCESS_REFERENCE_FAMILIES).map((row) =>
			pairKey(row.holder, row.uuidAttribute),
		)
		const setAside = PROCESS_PAIRS_NOT_GROUPED.map((pair) =>
			pairKey(pair.holder, pair.uuidAttribute),
		)
		expect({
			uncovered: registered
				.filter((key) => !grouped.includes(key) && !setAside.includes(key))
				.sort(),
			stale: setAside.filter((key) => !registered.includes(key)).sort(),
			overlap: grouped.filter((key) => setAside.includes(key)).sort(),
			withoutReason: PROCESS_PAIRS_NOT_GROUPED.filter((pair) => pair.reason.length === 0).length,
		}).toEqual({ uncovered: [], stale: [], overlap: [], withoutReason: 0 })
	})
})

type ReadsCase = SclTest.BaseXmlTestCase & { root: Scl.Ref<'Function'> }

// The process half reads what the roots hold and the targets it seeks once each: one outside reference or three, the
// same reads; and no read of the IED section when no root is an IED.
describe('the process half of the reference planner - its reads', () => {
	const testCases: SclTest.TestCases<ReadsCase> = {
		// F1 holds one SourceRef naming F2's ln2; the sibling file holds three
		'F1 with one outside signal, then with three → the same reads, none of the IED section': {
			sourceXml: oneOutsideXml,
			root: { tagName: 'Function', id: 'f1' } as Scl.Ref<'Function'>,
		},
	}

	async function act({ testCase, source, project }: SclTest.ActParams<ReadsCase>): Promise<void> {
		const three = await openSclDocument({ project, xml: threeOutsideXml, label: 'three-outside' })
		async function planOf(
			query: Core.Query<Config>,
		): Promise<{ reads: string[]; present: number }> {
			const counting = countDocumentQueryReads(query)
			const plan = await planReferences({
				roots: [{ ref: testCase.root, depth: 'whole' }],
				sourceQuery: counting.query,
				destinationQuery: counting.query,
				policy: CID_REFERENCE_POLICIES.keep,
				processPolicy: KEEP_EVERY_FAMILY,
			})
			const present = plan.references.filter(
				(reference) => reference.family === 'source-signal' && reference.class === 'present',
			).length
			return { reads: counting.calls().map(describeCall), present }
		}
		const compared = Promise.all([planOf(source.query), planOf(three.query)]).then(
			([one, threePlan]) => ({
				present: [one.present, threePlan.present],
				sameReads: [...one.reads].sort().join(' ') === [...threePlan.reads].sort().join(' '),
				iedReads: [...one.reads, ...threePlan.reads].filter(namesTheIedSection),
			}),
		)
		await expect(compared).resolves.toEqual({ present: [1, 3], sameReads: true, iedReads: [] })
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The tags the definition lets sit below the given ones, at any depth. */
function holdersBelow(tagNames: readonly string[]): Set<string> {
	const children: Readonly<Record<string, readonly string[]>> = SCL_DIALECTE_CONFIG.children
	const seen = new Set<string>()
	const pending = [...tagNames]
	while (pending.length > 0) {
		const tagName = pending.pop() as string
		for (const child of children[tagName] ?? []) {
			if (seen.has(child)) continue
			seen.add(child)
			pending.push(child)
		}
	}
	return seen
}

/** A read, as the cases compare them: its method, and the tags it names (a tag argument, a `collect` list, a ref's tag). */
function describeCall(call: CountedQueryCall): string {
	const tags = call.args.flatMap(function tagsOf(argument): string[] {
		if (typeof argument === 'string') return [argument]
		if (Array.isArray(argument)) return argument.flatMap(tagsOf)
		if (!argument || typeof argument !== 'object') return []
		const { tagName, collect } = argument as { tagName?: unknown; collect?: unknown }
		return [
			...(typeof tagName === 'string' ? [tagName] : []),
			...(Array.isArray(collect)
				? collect.filter((tag): tag is string => typeof tag === 'string')
				: []),
		]
	})
	return `${call.method}(${tags.join(',')})`
}

/** Whether a read names the IED section: an IED, or a tag the IED half of the planner reads. */
function namesTheIedSection(read: string): boolean {
	const named = read.slice(read.indexOf('(') + 1, -1).split(',')
	return read.includes('iedSection') || named.some((tag) => IED_SECTION_TAGS.has(tag))
}

/** The tags of the IED section the planner's IED half reads. */
const IED_SECTION_TAGS: ReadonlySet<string> = new Set(['IED', ...REFERENCE_HOLDER_TAGS])
