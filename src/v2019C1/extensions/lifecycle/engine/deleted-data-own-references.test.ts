import { assertDecisionsCoherent } from './decide'
import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import project from './fixtures/own-references/project.xml?raw'
import templateWithQualityMeasured from './fixtures/own-references/template-with-quality-measured.xml?raw'
import templateWithoutBreakerLln0Described from './fixtures/own-references/template-without-breaker-lln0-described.xml?raw'
import templateWithoutBreaker from './fixtures/own-references/template-without-breaker.xml?raw'
import templateWithoutOriginCategory from './fixtures/own-references/template-without-origin-category.xml?raw'
import templateWithoutSecondDevice from './fixtures/own-references/template-without-second-device.xml?raw'
import { reconcile } from './reconcile'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { AcceptedIds } from './decide.types'
import type { DecisionGroup, DiffSummary } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

describe("diff of the project's own references to data a newer template deletes", () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each decision group, as `<change> <tag>:<id> <action>[ requires <reason>][ needs <tag>:<id>, ...]`. */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// project.xml: IED7's entries of DS (none carries a lineage: all the project's own), its own DS2's entry, its own
		// input ext7 in the template's Inputs, IED8's ext8 (internal address) and ext9 (none) name XCBR1; the template drops it
		'the breaker removed → each own entry, the own data set entry, the own input and both inputs of IED8 wait apart, the removal needs them':
			{
				sourceXml: templateWithoutBreaker,
				targetXml: project,
				expected: [
					'modified ExtRef:ext7 skip requires names-deleted-data',
					'modified ExtRef:ext8 skip requires names-deleted-data',
					'removed ExtRef:ext9 skip requires names-deleted-data',
					'removed LN:xcbr-t accept needs ExtRef:ext7, ExtRef:ext8, ExtRef:ext9, FCDA:fds2-t, FCDA:fo-t, FCDA:fq-t, FCDA:fst-t',
					'target-only DataSet:ds2-t skip needs FCDA:fds2-t',
					'target-only FCDA:fds2-t skip requires names-deleted-data',
					'target-only FCDA:fo-t skip requires names-deleted-data',
					'target-only FCDA:fq-t skip requires names-deleted-data',
					'target-only FCDA:fst-t skip requires names-deleted-data',
					'target-only FCDA:fx2-t skip',
				],
			},
		// the same project; the template drops the device LD2 (holding XCBR2, named by the own entry LD2/XCBR2 of DS)
		'the second device removed → the own entry naming its breaker waits, the removal needs it': {
			sourceXml: templateWithoutSecondDevice,
			targetXml: project,
			expected: [
				'removed LDevice:ld2-t accept needs FCDA:fx2-t',
				'target-only DataSet:ds2-t skip',
				'target-only ExtRef:ext7 skip',
				'target-only FCDA:fo-t skip',
				'target-only FCDA:fq-t skip',
				'target-only FCDA:fx2-t skip requires names-deleted-data',
			],
		},
		// the same project; the template's origin loses its category: the entry naming origin.orCat names nothing now
		"the origin's category dropped from the breaker type → the own entry naming it waits, each type change needing its own":
			{
				sourceXml: templateWithoutOriginCategory,
				targetXml: project,
				expected: [
					'modified LN:xcbr-t accept needs FCDA:fo-t',
					'modified LN:xcbr2-t accept',
					'target-only DataSet:ds2-t skip',
					'target-only ExtRef:ext7 skip',
					'target-only FCDA:fo-t skip requires names-deleted-data',
					'target-only FCDA:fq-t skip',
					'target-only FCDA:fx2-t skip',
				],
			},
		// the same project; the template moves the breaker's quality to the measured values (fc MX): the own entry naming
		// Pos.q under ST names nothing now
		'the quality moved to another functional constraint → the own entry naming it under the former one waits':
			{
				sourceXml: templateWithQualityMeasured,
				targetXml: project,
				expected: [
					'modified LN:xcbr-t accept needs FCDA:fq-t',
					'modified LN:xcbr2-t accept',
					'target-only DataSet:ds2-t skip',
					'target-only ExtRef:ext7 skip',
					'target-only FCDA:fo-t skip',
					'target-only FCDA:fq-t skip requires names-deleted-data',
					'target-only FCDA:fx2-t skip',
				],
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		expect(
			report.groups.map((group) => describeGroup({ group, groups: report.groups })).sort(),
		).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('summary of a diff with references to deleted data outside its tree', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; expected: DiffSummary }

	const testCases: SclTest.TestCases<TestCase> = {
		// project.xml against the template without XCBR1: IED8's ext8 is cleared (modified), ext9 removed, outside the tree
		'the breaker removed → the inputs of another IED counted with the tree': {
			sourceXml: templateWithoutBreaker,
			targetXml: project,
			expected: { added: 0, removed: 2, modified: 2, moved: 0, kept: 0 },
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		expect(report.summary).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe("reconcile of the project's own references to deleted data", () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; accepted: AcceptedIds }

	const testCases: SclTest.TestCases<TestCase> = {
		// project.xml; every group of the breaker's removal accepted
		'the breaker removed, everything accepted → own entries gone with one GOOSE raise, inputs with an address cleared, the one without gone':
			{
				sourceXml: templateWithoutBreaker,
				targetXml: project,
				accepted: {
					sourceIds: new Set(),
					instanceIds: new Set([
						'xcbr-t',
						'fst-t',
						'fq-t',
						'fo-t',
						'fds2-t',
						'ext7',
						'ext8',
						'ext9',
					]),
					typeChangeIds: new Set(),
				},
				expectedQueries: [
					'//default:GSEControl[@name="GC"][@confRev="10001"]',
					'//default:ExtRef[@intAddr="own7"]',
					'//default:ExtRef[@intAddr="pos8"]',
					'//default:FCDA[@lnUuid="xcbr2-ins"]',
				],
				unexpectedQueries: [
					'//default:FCDA[@lnUuid="xcbr-ins"]',
					'//default:ExtRef[@lnUuid="xcbr-ins" or @iedName]',
					'//default:ExtRef[not(@intAddr)]',
				],
			},
		// the same, the second device dropped; its removal and the own entry naming XCBR2 accepted
		'the second device removed, its removal and the entry accepted → the entry gone, the GOOSE raised once':
			{
				sourceXml: templateWithoutSecondDevice,
				targetXml: project,
				accepted: {
					sourceIds: new Set(),
					instanceIds: new Set(['ld2-t', 'fx2-t']),
					typeChangeIds: new Set(),
				},
				expectedQueries: [
					'//default:GSEControl[@name="GC"][@confRev="10001"]',
					'//default:FCDA[@daName="q"]',
				],
				unexpectedQueries: [
					'//default:LDevice[@inst="LD2"]',
					'//default:FCDA[@lnUuid="xcbr2-ins"]',
				],
			},
		// the same, the origin's category dropped; both type changes and the entry naming origin.orCat accepted
		'the origin category dropped, the type changes and the entry accepted → the entry gone, the GOOSE raised once':
			{
				sourceXml: templateWithoutOriginCategory,
				targetXml: project,
				accepted: {
					sourceIds: new Set(['xcbr-s', 'xcbr2-s']),
					instanceIds: new Set(['fo-t']),
					typeChangeIds: new Set(['xcbr-s', 'xcbr2-s']),
				},
				expectedQueries: [
					'//default:GSEControl[@name="GC"][@confRev="10001"]',
					'//default:FCDA[@daName="q"]',
				],
				unexpectedQueries: ['//default:FCDA[@daName="origin.orCat"]'],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function reconcileInstance(tx) {
			await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
				accepted: testCase.accepted,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				bumpsCollisions: true,
				removalBase: { kind: 'lineage' },
				namesFollow: 'project',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('reconcile of the update on its own, every change written', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// project.xml; the template drops XCBR1, no decisions given
		'the breaker removed → own entries gone with one GOOSE raise, inputs with an address cleared, the one without gone':
			{
				sourceXml: templateWithoutBreaker,
				targetXml: project,
				expectedQueries: [
					'//default:GSEControl[@name="GC"][@confRev="10001"]',
					'//default:ExtRef[@intAddr="own7"]',
					'//default:ExtRef[@intAddr="pos8"]',
				],
				unexpectedQueries: [
					'//default:FCDA[@lnUuid="xcbr-ins"]',
					'//default:ExtRef[@lnUuid="xcbr-ins" or @iedName]',
					'//default:ExtRef[not(@intAddr)]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function reconcileInstance(tx) {
			await reconcile(tx, {
				sourceQuery: source.query,
				sourceRootRef,
				instanceRootRef,
				matchKey: 'templateUuid',
				identityMode: 'stamp-template',
				bumpsCollisions: true,
				removalBase: { kind: 'lineage' },
				namesFollow: 'project',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('decisions accepting a deletion and skipping a reference to it', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** By group, as `<tag>:<id>`: every group accepted but these. */
		skipped: string[]
		/** The refusal, or none. */
		expected:
			| { key: string | undefined; meta: { groupId: string; dependencyId: string } }
			| undefined
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// project.xml; the breaker's removal accepted, the entry of the project's own data set DS2 (and DS2) skipped
		'the breaker removal accepted, the own data set entry naming it skipped → refused': {
			sourceXml: templateWithoutBreaker,
			targetXml: project,
			skipped: ['FCDA:fds2-t', 'DataSet:ds2-t'],
			expected: {
				key: 'DECISION_DEPENDENCY_SKIPPED',
				meta: { groupId: 'LN:xcbr-t', dependencyId: 'FCDA:fds2-t' },
			},
		},
		// the same; the project's data set DS2 removed (accepted) while its entry naming XCBR1 and the removal are skipped
		'the own data set removed, the entry in it waiting skipped → refused': {
			sourceXml: templateWithoutBreaker,
			targetXml: project,
			skipped: ['FCDA:fds2-t', 'LN:xcbr-t'],
			expected: {
				key: 'DECISION_DEPENDENCY_SKIPPED',
				meta: { groupId: 'DataSet:ds2-t', dependencyId: 'FCDA:fds2-t' },
			},
		},
		// the template also describes LLN0, which holds the waiting entries: its description accepted, the breaker's
		// removal and every reference to it skipped
		'a change of an element holding waiting references accepted, the removal and the references skipped → taken':
			{
				sourceXml: templateWithoutBreakerLln0Described,
				targetXml: project,
				skipped: [
					'LN:xcbr-t',
					'DataSet:ds2-t',
					'FCDA:fst-t',
					'FCDA:fq-t',
					'FCDA:fo-t',
					'FCDA:fds2-t',
					'ExtRef:ext7',
					'ExtRef:ext8',
					'ExtRef:ext9',
				],
				expected: undefined,
			},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef,
			instanceRootRef,
			diffPolicy: readDiffPolicy({}),
		})
		const keyById = new Map(report.groups.map((group) => [group.id, primaryKey(group)]))
		const idByKey = new Map(report.groups.map((group) => [primaryKey(group), group.id]))
		const decisions = new Map<string, 'accept' | 'skip'>([
			...report.groups.map((group): [string, 'accept'] => [group.id, 'accept']),
			...testCase.skipped.map((key): [string, 'skip'] => [idByKey.get(key) ?? key, 'skip']),
		])
		const refused = await Promise.resolve()
			.then(function check() {
				assertDecisionsCoherent({ groups: report.groups, decisions })
				return undefined
			})
			.catch(function refusal(error: unknown) {
				const dialecteError = toDialecteError(error)
				const meta = dialecteError?.meta as { groupId: string; dependencyId: string } | undefined
				return {
					key: dialecteError?.key,
					meta: {
						groupId: keyById.get(meta?.groupId ?? '') ?? '',
						dependencyId: keyById.get(meta?.dependencyId ?? '') ?? '',
					},
				}
			})
		expect(refused).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** A decision group as `<change> <tag>:<id> <action>[ requires <reason>][ needs <tag>:<id>, ...]`. */
function describeGroup(params: { group: DecisionGroup; groups: readonly DecisionGroup[] }): string {
	const { group, groups } = params
	const requires = group.requiresDecision ? ` requires ${group.requiresDecision}` : ''
	const needs = group.dependsOn
		.map((dependencyId) => groups.find((candidate) => candidate.id === dependencyId))
		.map((dependency) => (dependency ? primaryKey(dependency) : 'unknown'))
		.sort()
	const needed = needs.length > 0 ? ` needs ${needs.join(', ')}` : ''
	return [`${group.change} ${primaryKey(group)} ${group.suggestedAction}`, requires, needed].join(
		'',
	)
}

/** The primary of a group as `<tag>:<id>`, the project's element when it has one. */
function primaryKey(group: DecisionGroup): string {
	const ref = group.primary.instanceRef ?? group.primary.sourceRef
	return `${group.primary.tagName}:${ref?.id}`
}
