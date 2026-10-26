import { listGroups, reportAndApply } from '../integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

/** Every field of the key of an LNode under a function: none of them can be changed by the engine. */
const BREAKER = {
	iedName: 'None',
	ldInst: 'LD1',
	prefix: 'QA',
	lnClass: 'XCBR',
	lnInst: '1',
	lnType: 'XCBR_T',
}

function types(suffix: string): string {
	return /* xml */ `
		<DataTypeTemplates ${id}="dtt-${suffix}">
			<LNodeType id="CSWI_T" lnClass="CSWI" ${id}="lnt-cswi-${suffix}">
				<DO name="Pos" type="DPC_T" ${id}="do-cswi-${suffix}"/>
			</LNodeType>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="lnt-xcbr-${suffix}">
				<DO name="Pos" type="DPC_T" ${id}="do-xcbr-${suffix}"/>
			</LNodeType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dot-${suffix}">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-${suffix}"/>
			</DOType>
		</DataTypeTemplates>
	`
}

function sourceXml(functionContent: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-uuid" ${id}="fn-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_T" uuid="ln-cswi-uuid" ${id}="ln-cswi-s"/>
						${functionContent}
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		${types('s')}
	</SCL>
	`
}

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
		${types('t')}
	</SCL>
`

function lifecycle(sourceQuery: Scl.Query) {
	return {
		verb: 'fsd',
		scenario: 'template',
		sourceQuery,
		ref: functionRef,
		anchor: bayRef,
	} as const
}

/**
 * The template placed in the project, then the project's own breaker LNode added to the instance, then the template
 * given a breaker LNode of the very same key.
 */
async function projectHoldingTheBreaker() {
	const { source, target } = await createSclTestProject({ sourceXml: sourceXml(''), targetXml })
	if (!target) throw new Error('target required')
	await reportAndApply({ document: target.document, lifecycle: lifecycle(source.document.query) })
	const [instance] = await target.document.query.findByAttributes({
		tagName: 'Function',
		attributes: { templateUuid: 'fn-uuid' },
	})
	const projectBreaker = await target.document.transaction(async function addOwnBreaker(tx) {
		return tx.addChild(instance as Scl.Ref<'Function'>, {
			tagName: 'LNode',
			attributes: { ...BREAKER, uuid: 'project-breaker-uuid' },
		})
	})
	await source.document.transaction(async function templateGainsTheBreaker(tx) {
		await tx.addChild(functionRef, {
			tagName: 'LNode',
			attributes: { ...BREAKER, uuid: 'template-breaker-uuid' },
		})
	})
	return { source: source.document, target: target.document, projectBreaker }
}

/** The breaker LNodes of the project, each by the template element it stands for, else its own uuid. */
async function breakersOf(document: Scl.Document): Promise<string[]> {
	const breakers = await document.query.findByAttributes({
		tagName: 'LNode',
		attributes: { lnClass: 'XCBR' },
	})
	const uuids: string[] = []
	for (const breaker of breakers) {
		const { templateUuid, uuid } = await document.query.getAttributes(breaker)
		uuids.push(templateUuid ?? uuid ?? '')
	}
	return uuids.sort()
}

/** The decisions accepting every group but those of the project's own elements, which are accepted too when asked. */
function deciding(params: { removeProjectBreaker: boolean }): (report: DiffReport) => DecisionMap {
	return function decide(report) {
		const decisions: DecisionMap = new Map()
		for (const group of allGroups(report)) {
			if (group.change === 'target-only' && params.removeProjectBreaker)
				decisions.set(group.id, 'accept')
		}
		return decisions
	}
}

describe('update: an element the template brings that collides with the project on a key nothing can change', () => {
	it('every change at its suggested action → refused, naming the key and the element it collides with; nothing written', async () => {
		const { source, target, projectBreaker } = await projectHoldingTheBreaker()
		const before = await target.query.getSnapshot({ as: 'xml' })

		const refused = reportAndApply({ document: target, lifecycle: lifecycle(source.query) })

		const refusal = toDialecteError(await refused.catch((error: unknown) => error))
		expect({
			key: refusal?.key,
			constraint: refusal?.meta?.constraint,
			fields: refusal?.meta?.fields,
			element: (refusal?.meta?.element as { tagName?: string } | undefined)?.tagName,
			collidesWith: refusal?.meta?.collidesWith,
		}).toEqual({
			key: 'IDENTITY_COLLISION',
			constraint: 'uniqueLNodeInFunctionB',
			fields: expect.arrayContaining(['prefix', 'lnClass', 'lnInst', 'ldInst', 'iedName']),
			element: 'LNode',
			collidesWith: { tagName: 'LNode', id: projectBreaker.id },
		})
		expect(await target.query.getSnapshot({ as: 'xml' }), 'nothing written').toEqual(before)
	})

	it("the project's own element removed in the same apply → the template's written, one breaker", async () => {
		const { source, target } = await projectHoldingTheBreaker()

		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycle(source.query),
			decide: deciding({ removeProjectBreaker: true }),
		})

		expect(listGroups(report)).toEqual(['added LNode', 'target-only LNode'])
		expect(await breakersOf(target)).toEqual(['template-breaker-uuid'])
	})

	it('the update run on its own, with no report → refused while writing, nothing written', async () => {
		const { source, target, projectBreaker } = await projectHoldingTheBreaker()
		const before = await target.query.getSnapshot({ as: 'xml' })

		const refused = target.transaction(async function updateWithoutReport(tx) {
			await updateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		const refusal = toDialecteError(await refused.catch((error: unknown) => error))
		expect({
			key: refusal?.key,
			code: refusal?.code,
			collidesWith: refusal?.meta?.collidesWith,
		}).toEqual({
			key: 'IDENTITY_COLLISION',
			code: 'SCL1010',
			collidesWith: { tagName: 'LNode', id: projectBreaker.id },
		})
		expect(await target.query.getSnapshot({ as: 'xml' }), 'nothing written').toEqual(before)
	})

	it('the template replacing its breaker by another of the same key → written, one breaker', async () => {
		const breaker = /* xml */ `<LNode iedName="None" ldInst="LD1" prefix="QA" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="old-breaker-uuid" ${id}="ln-old-s"/>`
		const { source, target } = await createSclTestProject({
			sourceXml: sourceXml(breaker),
			targetXml,
		})
		if (!target) throw new Error('target required')
		await reportAndApply({ document: target.document, lifecycle: lifecycle(source.document.query) })
		await source.document.transaction(async function templateReplacesTheBreaker(tx) {
			await tx.delete({ tagName: 'LNode', id: 'ln-old-s' } as Scl.Ref<'LNode'>)
			await tx.addChild(functionRef, {
				tagName: 'LNode',
				attributes: { ...BREAKER, uuid: 'new-breaker-uuid' },
			})
		})

		const { report } = await reportAndApply({
			document: target.document,
			lifecycle: lifecycle(source.document.query),
		})

		expect(listGroups(report)).toEqual(['added LNode', 'removed LNode'])
		expect(await breakersOf(target.document)).toHaveLength(1)
	})
})
