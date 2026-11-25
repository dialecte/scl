import { finalizeClonedIdentity } from './finalize-cloned-identity'

import { describe, expect } from 'vitest'

import { cloneTree } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The source element cloned, the target element it is cloned under, and the tag it is cloned as. */
	clone: {
		ref: Scl.Ref<Scl.ElementsOf>
		under: Scl.Ref<Scl.ElementsOf>
		retagRoot?: { from: Scl.ElementsOf; to: Scl.ElementsOf }
	}
}

/** A function of a template instance: a subfunction holding a trip LNode and a breaker LNode reading the trip. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="S1" ${id}="source-substation">
			<VoltageLevel name="V1" ${id}="source-voltage-level">
				<Bay name="B1" ${id}="source-bay">
					<Function name="Prot" uuid="function-uuid" templateUuid="function-template" ${id}="source-function">
						<SubFunction name="Sub" uuid="subfunction-uuid" templateUuid="subfunction-template" ${id}="source-subfunction">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="trip-lnode-uuid" templateUuid="trip-template" ${id}="source-trip-lnode"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="breaker-lnode-uuid" templateUuid="breaker-template" ${id}="source-breaker-lnode">
								<Private type="eIEC61850-6-100" ${id}="source-breaker-private">
									<eIEC61850-6-100:LNodeInputs ${id}="source-inputs">
										<eIEC61850-6-100:SourceRef input="Trip" source="S1/V1/B1/Prot/Sub/PTRC1" sourceLNodeUuid="trip-lnode-uuid" sourceDoName="Op" uuid="source-ref-uuid" templateUuid="source-ref-template" ${id}="source-source-ref"/>
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</SubFunction>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A project bay holding a function of the given template. */
function targetXml(functionTemplate: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="target">
			<Substation name="S2" ${id}="target-substation">
				<VoltageLevel name="V2" ${id}="target-voltage-level">
					<Bay name="B2" ${id}="target-bay">
						<Function name="Prot" uuid="target-function-uuid" templateUuid="${functionTemplate}" ${id}="target-function"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

const subFunction = { tagName: 'SubFunction', id: 'source-subfunction' } as Scl.Ref<'SubFunction'>
const intoFunction = { tagName: 'Function', id: 'target-function' } as Scl.Ref<'Function'>

/** The signal of the copy reads the copy's trip LNode, by its fresh uuid. */
const signalRepointed = [
	'//v2019C1:SourceRef[@sourceLNodeUuid = //default:LNode[@lnClass="PTRC"]/@uuid]',
]
const signalLeftOnTheSource = [
	'//default:LNode[@uuid="trip-lnode-uuid"]',
	'//v2019C1:SourceRef[@sourceLNodeUuid="trip-lnode-uuid"]',
]

describe('finalizeClonedIdentity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'strip: the element cloned loses its link, what it holds keeps its lineage, its references read the copy':
			{
				sourceXml,
				targetXml: targetXml('function-template'),
				clone: { ref: subFunction, under: intoFunction },
				expectedQueries: [
					'//default:SubFunction/default:LNode[@templateUuid="trip-template"]',
					'//v2019C1:SourceRef[@templateUuid="source-ref-template"]',
					...signalRepointed,
				],
				unexpectedQueries: ['//default:SubFunction[@templateUuid]', ...signalLeftOnTheSource],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function cloneAndFinalize(tx) {
			const clone = await cloneTree(tx, {
				sourceQuery: source.query,
				ref: testCase.clone.ref,
				targetParent: testCase.clone.under,
				retagRoot: testCase.clone.retagRoot,
			})
			if (!clone) throw new Error('nothing cloned')
			await finalizeClonedIdentity(tx, {
				cloneMappings: clone.mappings,
				mode: 'strip',
				unlinked: new Set([testCase.clone.ref.id ?? '']),
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A copy keeps the lineage of every element as the clone copied it, wherever it is pasted: a copy of an instance is
// another instance of its template. Every element gets a uuid of its own, the references inside read the copy.
describe('finalizeClonedIdentity - copy', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'copy into a function of the same template → every lineage as copied, fresh uuids, its references read the copy':
			{
				sourceXml,
				targetXml: targetXml('function-template'),
				clone: { ref: subFunction, under: intoFunction },
				expectedQueries: [
					'//default:SubFunction[@templateUuid="subfunction-template"]/default:LNode[@templateUuid="trip-template"]',
					'//v2019C1:SourceRef[@templateUuid="source-ref-template"]',
					...signalRepointed,
				],
				unexpectedQueries: [
					...signalLeftOnTheSource,
					'//default:SubFunction[@uuid="subfunction-uuid"]',
					'//default:LNode[@uuid="breaker-lnode-uuid"]',
				],
			},
		'copy into a function of another template → every lineage still as copied, its references read the copy':
			{
				sourceXml,
				targetXml: targetXml('another-template'),
				clone: { ref: subFunction, under: intoFunction },
				expectedQueries: [
					'//default:SubFunction[@templateUuid="subfunction-template"]/default:LNode[@templateUuid="trip-template"]',
					'//default:LNode[@lnClass="XCBR"][@templateUuid="breaker-template"]',
					'//v2019C1:SourceRef[@templateUuid="source-ref-template"]',
					...signalRepointed,
				],
				unexpectedQueries: [
					...signalLeftOnTheSource,
					'//default:LNode[@uuid="breaker-lnode-uuid"]',
				],
			},
		'a subfunction copied as a function onto a level of another bay → its lineage as copied': {
			sourceXml,
			targetXml: targetXml('function-template'),
			clone: {
				ref: subFunction,
				under: { tagName: 'Bay', id: 'target-bay' } as Scl.Ref<'Bay'>,
				retagRoot: { from: 'SubFunction', to: 'Function' },
			},
			expectedQueries: [
				'//default:Bay[@name="B2"]/default:Function[@name="Sub"][@templateUuid="subfunction-template"]',
				...signalRepointed,
			],
			unexpectedQueries: [
				'//default:Function[@name="Sub"][@uuid="subfunction-uuid"]',
				...signalLeftOnTheSource,
				'//default:LNode[@uuid="breaker-lnode-uuid"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const finalized = target
			.transaction(async function cloneAndFinalize(tx) {
				const clone = await cloneTree(tx, {
					sourceQuery: source.query,
					ref: testCase.clone.ref,
					targetParent: testCase.clone.under,
					retagRoot: testCase.clone.retagRoot,
				})
				if (!clone) throw new Error('nothing cloned')
				await finalizeClonedIdentity(tx, { cloneMappings: clone.mappings, mode: 'copy' })
			})
			.then(() => 'finalized')
		await expect(finalized).resolves.toBe('finalized')
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
