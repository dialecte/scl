import { apply } from './apply'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'
import { expectExportedQueries } from '@/v2019C1/test/expect-exported-queries'

import type { AppliedInstances } from './apply.types'
import type { Scl } from '@/v2019C1/config'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('apply — returns { report, instances }', () => {
	it('fsd instantiate: returns the placed Function root', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		})

		let result: Awaited<ReturnType<typeof apply>> | undefined
		await target.document.transaction(async (tx) => {
			result = await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
			})
		})

		expect(result?.report).toBe(rep)
		expect(result?.instances.verb).toBe('fsd')
		expect(result?.instances.verb === 'fsd' && result.instances.functions).toHaveLength(1)
	})
})

describe('apply — keepNameTypesFrom threads to the type import', () => {
	const dedupSourceXml = /* xml */ `
		<SCL ${ns} ${id}="fsd">
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="TEMPLATE" ${id}="bay-s">
						<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_ICD" ${id}="lnode-1" uuid="lnode-src-uuid"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-s">
				<LNodeType id="CSWI_ICD" lnClass="CSWI" ${id}="lnt-s">
					<DO name="Pos" type="DPC_ICD" ${id}="do-s"/>
				</LNodeType>
				<DOType id="DPC_ICD" cdc="DPC" ${id}="dot-s">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>
	`
	// target already holds a structurally-equal type under a different id (CSWI_SSD).
	const dedupTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t">
					<Bay name="B1" ${id}="bay-t"/>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-t">
				<LNodeType id="CSWI_SSD" lnClass="CSWI" ${id}="lnt-t">
					<DO name="Pos" type="DPC_SSD" ${id}="do-t"/>
				</LNodeType>
				<DOType id="DPC_SSD" cdc="DPC" ${id}="dot-t">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>
	`

	async function instantiate(
		keepNameTypesFrom: 'source' | 'target' | undefined,
	): Promise<string[]> {
		const { source, target } = await createSclTestProject({
			sourceXml: dedupSourceXml,
			targetXml: dedupTargetXml,
		})
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
			scenario: 'instantiate',
		})
		await target.document.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
				scenario: 'instantiate',
				report: rep,
				resolution: { keepNameTypesFrom },
			})
		})

		const records = await target.document.query.getRecordsByTagName('LNodeType')
		return records
			.map((record) => record.attributes.find((attribute) => attribute.name === 'id')?.value)
			.filter((value): value is string => value !== undefined)
	}

	it('keepNameTypesFrom "source": the reused type adopts the incoming id', async () => {
		const ids = await instantiate('source')
		expect(ids).toContain('CSWI_ICD')
		expect(ids).not.toContain('CSWI_SSD')
	})

	it('default (target): the reused type keeps the destination id', async () => {
		const ids = await instantiate(undefined)
		expect(ids).toContain('CSWI_SSD')
		expect(ids).not.toContain('CSWI_ICD')
	})
})

// An update that adds a logical node brings the type it names through the same import as a first placement: with
// `keepNameTypesFrom: 'source'` a project type equal to the template's takes the template's id and every referrer
// follows; otherwise the project id stays, and an id the project already gives to another type is never taken.
describe('apply — keepNameTypesFrom reaches a logical node an update adds', () => {
	/** The data object type both files hold under one id, so only the logical node types differ by id. */
	const POSITION_TYPE = /* xml */ `
		<DOType id="DPC_Type" cdc="DPC">
			<DA name="stVal" bType="BOOLEAN" fc="ST"/>
		</DOType>
	`
	const BREAKER_ICD = /* xml */ `
		<LNodeType id="XCBR_ICD" lnClass="XCBR">
			<DO name="Pos" type="DPC_Type"/>
		</LNodeType>
	`

	/** The template: the function `Prot` with a switch controller, and with a breaker from its second revision. */
	function templateRevisionXml(params: { withBreaker: boolean }): string {
		const breaker = params.withBreaker
			? '<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_ICD" uuid="breaker-src-uuid"/>'
			: ''
		return /* xml */ `
			<SCL ${ns} ${id}="fsd">
				<Substation name="TEMPLATE">
					<VoltageLevel name="TEMPLATE">
						<Bay name="TEMPLATE">
							<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
								<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_ICD" uuid="lnode-src-uuid"/>
								${breaker}
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates>
					<LNodeType id="CSWI_ICD" lnClass="CSWI">
						<DO name="Pos" type="DPC_Type"/>
					</LNodeType>
					${params.withBreaker ? BREAKER_ICD : ''}
					${POSITION_TYPE}
				</DataTypeTemplates>
			</SCL>
		`
	}

	/** A function of the project naming a type of another content under the id the template gives its breaker type. */
	const HELD_FUNCTION = /* xml */ `
		<Function name="Held" uuid="held-function-uuid">
			<LNode iedName="None" lnClass="XCBR" lnInst="8" lnType="XCBR_ICD" uuid="held-lnode-uuid"/>
		</Function>
	`
	const ANOTHER_TYPE_UNDER_THE_TEMPLATE_ID = /* xml */ `
		<LNodeType id="XCBR_ICD" lnClass="XCBR">
			<DO name="Pos" type="DPC_Type"/>
			<DO name="BlkOpn" type="DPC_Type"/>
		</LNodeType>
	`

	/**
	 * The project: the bay `B1` the function is placed in, and `B2` with a function of its own whose breaker is of
	 * the type `XCBR_SSD`, equal to the template's `XCBR_ICD`. `anotherTypeUnderTheTemplateId` adds a type of
	 * another content under the id `XCBR_ICD`, named by a function of its own.
	 */
	function projectXml(params: { anotherTypeUnderTheTemplateId: boolean }): string {
		const taken = params.anotherTypeUnderTheTemplateId
		return /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1">
					<VoltageLevel name="V1">
						<Bay name="B1" ${id}="bay-t"/>
						<Bay name="B2">
							<Function name="Own" uuid="own-function-uuid">
								<LNode iedName="None" lnClass="XCBR" lnInst="7" lnType="XCBR_SSD" uuid="own-lnode-uuid"/>
							</Function>
							${taken ? HELD_FUNCTION : ''}
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates>
					<LNodeType id="XCBR_SSD" lnClass="XCBR">
						<DO name="Pos" type="DPC_Type"/>
					</LNodeType>
					${taken ? ANOTHER_TYPE_UNDER_THE_TEMPLATE_ID : ''}
					${POSITION_TYPE}
				</DataTypeTemplates>
			</SCL>
		`
	}

	const ADDED_BREAKER =
		'//default:Bay[@name="B1"]/default:Function[@name="Prot"]/default:LNode[@lnClass="XCBR"]'
	const OWN_BREAKER = '//default:Function[@name="Own"]/default:LNode'
	const HELD_BREAKER = '//default:Function[@name="Held"]/default:LNode'
	const DANGLING_TYPE = '//default:LNode[@lnType][not(@lnType = //default:LNodeType/@id)]'

	type TestCase = SclTest.BaseXmlTestCase & {
		/** The `keepNameTypesFrom` the consumer gives to the apply of the update; none when absent. */
		keepNameTypesFrom?: 'source' | 'target'
	}

	// the document under test is the project, opened as the case's source; the template revisions are opened beside it
	const testCases: SclTest.TestCases<TestCase> = {
		"'source' -> the project type takes the template id, the logical node of the project and the added one follow":
			{
				sourceXml: projectXml({ anotherTypeUnderTheTemplateId: false }),
				keepNameTypesFrom: 'source',
				expectedQueries: [
					'//default:LNodeType[@id="XCBR_ICD"]',
					`${OWN_BREAKER}[@lnType="XCBR_ICD"]`,
					`${ADDED_BREAKER}[@lnType="XCBR_ICD"]`,
				],
				unexpectedQueries: ['//default:LNodeType[@id="XCBR_SSD"]', DANGLING_TYPE],
			},

		"'target' -> the project type keeps its id, the added logical node names it": {
			sourceXml: projectXml({ anotherTypeUnderTheTemplateId: false }),
			keepNameTypesFrom: 'target',
			expectedQueries: [
				'//default:LNodeType[@id="XCBR_SSD"]',
				`${OWN_BREAKER}[@lnType="XCBR_SSD"]`,
				`${ADDED_BREAKER}[@lnType="XCBR_SSD"]`,
			],
			unexpectedQueries: ['//default:LNodeType[@id="XCBR_ICD"]', DANGLING_TYPE],
		},

		'none given -> the project type keeps its id, the added logical node names it': {
			sourceXml: projectXml({ anotherTypeUnderTheTemplateId: false }),
			expectedQueries: [
				'//default:LNodeType[@id="XCBR_SSD"]',
				`${OWN_BREAKER}[@lnType="XCBR_SSD"]`,
				`${ADDED_BREAKER}[@lnType="XCBR_SSD"]`,
			],
			unexpectedQueries: ['//default:LNodeType[@id="XCBR_ICD"]', DANGLING_TYPE],
		},

		"'source', the template id already naming another type of the project -> the project type keeps its id, the other type is left alone":
			{
				sourceXml: projectXml({ anotherTypeUnderTheTemplateId: true }),
				keepNameTypesFrom: 'source',
				expectedQueries: [
					'//default:LNodeType[@id="XCBR_SSD"]',
					'//default:LNodeType[@id="XCBR_ICD"]/default:DO[@name="BlkOpn"]',
					`${OWN_BREAKER}[@lnType="XCBR_SSD"]`,
					`${ADDED_BREAKER}[@lnType="XCBR_SSD"]`,
					`${HELD_BREAKER}[@lnType="XCBR_ICD"]`,
				],
				unexpectedQueries: [DANGLING_TYPE],
			},
	}

	async function act(params: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { testCase, project, source: projectDocument } = params
		const resolution = { decisions: new Map(), keepNameTypesFrom: testCase.keepNameTypesFrom }
		const firstRevision = await openSclDocument({
			project,
			xml: templateRevisionXml({ withBreaker: false }),
			label: 'template revision 1',
		})
		const secondRevision = await openSclDocument({
			project,
			xml: templateRevisionXml({ withBreaker: true }),
			label: 'template revision 2',
		})

		// placed first, with no breaker to compare, then updated to the revision that adds it
		for (const { sourceQuery, scenario } of [
			{ sourceQuery: firstRevision.query, scenario: 'instantiate' as const },
			{ sourceQuery: secondRevision.query, scenario: 'template' as const },
		]) {
			const lifecycleTarget = {
				verb: 'fsd' as const,
				sourceQuery,
				ref: functionRef,
				anchor: bayRef,
				scenario,
			}
			const reported = await report(projectDocument.query, lifecycleTarget)
			await projectDocument.transaction(async function applyRevision(tx) {
				await apply(tx, {
					...lifecycleTarget,
					report: reported,
					resolution: scenario === 'template' ? resolution : { decisions: new Map() },
				})
			})
		}

		await expectExportedQueries({ act: params })
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})

describe("apply — the consumer's afterApply hook", () => {
	// the bay where the function is placed already holds a function named "Taken"
	const takenTargetXml = targetXml.replace(
		`<Bay name="B1" ${id}="bay-t"/>`,
		`<Bay name="B1" ${id}="bay-t"><Function name="Taken" ${id}="taken-t" uuid="taken-uuid"/></Bay>`,
	)

	async function placeFunction(params: {
		afterApply: NonNullable<Resolution['afterApply']>
		needsDecisions?: boolean
	}) {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml: takenTargetXml })
		if (!target) throw new Error('target required')

		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const reported = await report(target.document.query, lifecycleTarget)
		await target.document.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: params.needsDecisions ? { ...reported, needsDecisions: true } : reported,
				resolution: { afterApply: params.afterApply },
			})
		})
		return target.document.query
	}

	it('runs once after the apply, inside its transaction, with what was placed: what it writes is applied', async () => {
		const calls: AppliedInstances[] = []
		const query = await placeFunction({
			afterApply: async (tx, { instances }) => {
				calls.push(instances)
				for (const placed of instances.verb === 'fsd' ? instances.functions : []) {
					await tx.update(placed.ref, { attributes: { desc: 'named by the consumer' } })
				}
			},
		})

		expect(calls).toHaveLength(1)
		expect(calls[0]?.verb === 'fsd' && calls[0].functions).toHaveLength(1)
		const [placed] = await query.findByAttributes({
			tagName: 'Function',
			attributes: { desc: 'named by the consumer' },
		})
		expect(placed).toBeDefined()
	})

	it('the hook names what was placed with a name taken where it sits → the engine numbers it', async () => {
		const query = await placeFunction({
			afterApply: async (tx, { instances }) => {
				for (const placed of instances.verb === 'fsd' ? instances.functions : []) {
					await tx.update(placed.ref, { attributes: { name: 'Taken' } })
				}
			},
		})

		const names = await namesOfFunctions(query)
		expect(names.sort()).toEqual(['Taken', 'Taken_1'])
	})

	it('nothing decided yet (nothing is written) → the hook does not run', async () => {
		let called = false
		await placeFunction({
			needsDecisions: true,
			afterApply: async () => {
				called = true
			},
		})

		expect(called).toBe(false)
	})
})

describe('apply — the decisions belong to the report', () => {
	it('a decision for a group of another report → refused, nothing written', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const reported = await report(target.document.query, lifecycleTarget)
		const before = await target.document.query.getSnapshot({ as: 'xml' })

		const refused = target.document.transaction(async function applyStaleDecisions(tx) {
			await apply(tx, {
				...lifecycleTarget,
				report: reported,
				resolution: { decisions: new Map([['a-group-of-another-report', 'accept']]) },
			})
		})

		const caught = await refused.catch((error: unknown) => error)
		const refusal = toDialecteError(caught)
		expect(refusal?.key).toBe('DECISION_UNKNOWN')
		const after = await target.document.query.getSnapshot({ as: 'xml' })
		expect(after).toEqual(before)
	})
})

describe("apply — what the consumer's step writes is held to the uniqueness rules", () => {
	// a bay beside the one the function is placed in, and a function there holding two logical nodes of one key
	const busyTargetXml = targetXml.replace(
		`<Bay name="B1" ${id}="bay-t"/>`,
		/* xml */ `
			<Bay name="B1" ${id}="bay-t"/>
			<Bay name="B2" ${id}="bay-t2">
				<Function name="Held" uuid="held-uuid" ${id}="held-t">
					<LNode iedName="None" ldInst="LD1" prefix="QA" lnClass="XCBR" lnInst="1" ${id}="held-ln-1"/>
					<LNode iedName="None" ldInst="LD1" prefix="QA" lnClass="XCBR" lnInst="1" ${id}="held-ln-2"/>
					<LNode iedName="None" ldInst="LD1" prefix="QA" lnClass="XCBR" lnInst="2" ${id}="held-ln-3"/>
				</Function>
			</Bay>
		`,
	)

	async function placeWithStep(afterApply: NonNullable<Resolution['afterApply']>) {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml: busyTargetXml })
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'fsd' as const,
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		}
		const reported = await report(target.document.query, lifecycleTarget)
		const before = await target.document.query.getSnapshot({ as: 'xml' })
		const applied = target.document.transaction(async function applyWithStep(tx) {
			await apply(tx, { ...lifecycleTarget, report: reported, resolution: { afterApply } })
		})
		return { query: target.document.query, applied, before }
	}

	async function bayNames(query: Scl.Query): Promise<string[]> {
		const names: string[] = []
		for (const bay of await query.getRecordsByTagName('Bay')) {
			const name = await query.getAttribute(bay, { name: 'name' })
			names.push(name ?? '')
		}
		return names.sort()
	}

	it('the step renames a bay outside what was placed to a name taken beside it → numbered', async () => {
		const { query, applied } = await placeWithStep(async function renameBay(tx) {
			await tx.update({ tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>, {
				attributes: { name: 'B2' },
			})
		})
		await applied

		const names = await bayNames(query)
		expect(names).toEqual(['B2', 'B2_1'])
	})

	it('the step adds two logical nodes sharing their whole key → refused, nothing written', async () => {
		const { query, applied, before } = await placeWithStep(async function addTwins(
			tx,
			{ instances },
		) {
			const [placed] = instances.verb === 'fsd' ? instances.functions : []
			if (!placed) throw new Error('nothing placed')
			for (let twin = 0; twin < 2; twin++) {
				await tx.addChild(placed.ref as Scl.Ref<'Function'>, {
					tagName: 'LNode',
					attributes: {
						iedName: 'None',
						ldInst: 'LD1',
						prefix: 'QA',
						lnClass: 'XCBR',
						lnInst: '1',
					},
				})
			}
		})

		const caught = await applied.catch((error: unknown) => error)
		const refusal = toDialecteError(caught)
		expect(refusal?.key).toBe('IDENTITY_COLLISION')
		const after = await query.getSnapshot({ as: 'xml' })
		expect(after).toEqual(before)
	})

	it('the step renumbers a logical node onto the key of another → refused, nothing written', async () => {
		const { query, applied, before } = await placeWithStep(async function renumber(tx) {
			await tx.update({ tagName: 'LNode', id: 'held-ln-3' } as Scl.Ref<'LNode'>, {
				attributes: { lnInst: '1' },
			})
		})

		const caught = await applied.catch((error: unknown) => error)
		const refusal = toDialecteError(caught)
		expect({ key: refusal?.key, element: refusal?.meta?.element }).toEqual({
			key: 'IDENTITY_COLLISION',
			element: { tagName: 'LNode', id: 'held-ln-3' },
		})
		const after = await query.getSnapshot({ as: 'xml' })
		expect(after).toEqual(before)
	})

	it('the step renames a bay to a free name and deletes another bay → applied as it wrote', async () => {
		const { query, applied } = await placeWithStep(async function rewrite(tx) {
			await tx.update({ tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>, {
				attributes: { name: 'B9' },
			})
			await tx.delete({ tagName: 'Bay', id: 'bay-t2' } as Scl.Ref<'Bay'>)
		})
		await applied

		const names = await bayNames(query)
		expect(names).toEqual(['B9'])
	})

	it('the step changes the description of an element the project already held twice → left as it is', async () => {
		const { query, applied } = await placeWithStep(async function describe(tx) {
			await tx.update({ tagName: 'LNode', id: 'held-ln-2' } as Scl.Ref<'LNode'>, {
				attributes: { desc: 'described by the consumer' },
			})
		})
		await applied

		const held = await query.findByAttributes({
			tagName: 'LNode',
			attributes: { lnClass: 'XCBR', lnInst: '1' },
		})
		expect(held).toHaveLength(2)
	})
})

async function namesOfFunctions(query: Scl.Query): Promise<string[]> {
	const records = await query.getRecordsByTagName('Function')
	return records
		.map((record) => record.attributes.find((attribute) => attribute.name === 'name')?.value)
		.filter((value): value is string => value !== undefined)
}
