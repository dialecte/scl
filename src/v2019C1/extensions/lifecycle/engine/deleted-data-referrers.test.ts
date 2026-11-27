import { diff } from './diff'
import { readDiffPolicy } from './diff-policy'
import templateWithoutBreaker from './fixtures/deleted-data/breaker-template-without-breaker.xml?raw'
import templateWithoutGoose from './fixtures/deleted-data/breaker-template-without-goose.xml?raw'
import templateWithoutQuality from './fixtures/deleted-data/breaker-template-without-quality.xml?raw'
import template from './fixtures/deleted-data/breaker-template.xml?raw'
import project from './fixtures/deleted-data/project-with-a-breaker-subscribed-to.xml?raw'
import { reconcile } from './reconcile'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { AcceptedIds } from './decide.types'
import type { DecisionGroup } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const sourceRootRef = { tagName: 'IED', id: 'ied-s' } as Scl.Ref<'IED'>
const instanceRootRef = { tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>

describe('diff of the references to data a newer template deletes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** Each decision group, as `<change> <tag>:<id> <action>[ requires <reason>][ needs <tag>:<id>, ...]`. */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// project: IED7's data set holds the breaker's stVal (template) and q (project-added); IED8's input names IED7's breaker Pos.q, by uuid, through its GOOSE control block
		// template: the breaker type's DPC has no q
		'the breaker type drops the quality → the entry and the input naming it each wait for a decision, the type change needs them':
			{
				sourceXml: templateWithoutQuality,
				targetXml: project,
				expected: [
					'modified ExtRef:ext8 skip requires names-deleted-data',
					'modified LN:xcbr-t accept needs ExtRef:ext8, FCDA:fq-t',
					'target-only FCDA:fq-t skip requires names-deleted-data',
				],
			},
		// template: the breaker LN and its data-set entry removed
		'the breaker removed → every entry and input naming it waits for a decision, the removal needs them':
			{
				sourceXml: templateWithoutBreaker,
				targetXml: project,
				expected: [
					'modified ExtRef:ext8 skip requires names-deleted-data',
					'removed LN:xcbr-t accept needs ExtRef:ext8, FCDA:fq-t, FCDA:fst-t',
					'target-only FCDA:fq-t skip requires names-deleted-data',
					'target-only FCDA:fst-t skip requires names-deleted-data',
				],
			},
		// template: the GOOSE control block removed, the breaker kept
		'the GOOSE control block removed → the input naming it waits for a decision, the removal needs it':
			{
				sourceXml: templateWithoutGoose,
				targetXml: project,
				expected: [
					'modified ExtRef:ext8 skip requires names-deleted-data',
					'removed GSEControl:gc-t accept needs ExtRef:ext8',
					'target-only FCDA:fq-t skip',
				],
			},
		// template: unchanged, so only the project-added entry differs
		'the same template → nothing waits, the project entry kept as its own': {
			sourceXml: template,
			targetXml: project,
			expected: ['target-only FCDA:fq-t skip'],
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

describe('reconcile of the references to data a newer template deletes', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; accepted: AcceptedIds }

	const testCases: SclTest.TestCases<TestCase> = {
		// same project and quality-less template as the diff case; the deletion and both references accepted
		"the quality's deletion and its two references accepted → the entry removed, its GOOSE revision raised, the input's source and service cleared":
			{
				sourceXml: templateWithoutQuality,
				targetXml: project,
				accepted: {
					sourceIds: new Set(['xcbr-s']),
					instanceIds: new Set(['fq-t', 'ext8']),
					typeChangeIds: new Set(['xcbr-s']),
				},
				expectedQueries: [
					'//default:GSEControl[@name="GC"][@confRev="10001"]',
					'//default:ExtRef[@intAddr="posQ"][@desc="breaker position quality"]',
				],
				unexpectedQueries: [
					'//default:FCDA[@daName="q"]',
					'//default:ExtRef[@serviceType]',
					'//default:ExtRef[@iedName or @ldInst or @lnClass or @doName or @daName or @lnUuid]',
					'//default:ExtRef[@srcLDInst or @srcLNClass or @srcCBName or @srcCBUuid]',
				],
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
