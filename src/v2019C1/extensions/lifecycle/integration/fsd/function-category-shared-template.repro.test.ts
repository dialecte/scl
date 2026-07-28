import { describe, expect, it } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { reportFsd } from '@/v2019C1/extensions/lifecycle/report/query/report-fsd'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

// Reproduces the real "Current Transformer" ASD shape at the function layer: a composed
// Function with SubFunctions that all share ONE library `templateUuid` (PhsA/B/C/N), plus a
// FunctionCategory satellite whose SubCategory carries one FunctionCatRef per SubFunction.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:FunctionCategory name="Measurement" uuid="cat-src" ${id}="cat-s">
					<eIEC61850-6-100:SubCategory name="Current" uuid="subcat-src" ${id}="subcat-s">
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfa-src" function="TEMPLATE/CT_Fn/PhsA" ${id}="ref-a"/>
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfb-src" function="TEMPLATE/CT_Fn/PhsB" ${id}="ref-b"/>
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfc-src" function="TEMPLATE/CT_Fn/PhsC" ${id}="ref-c"/>
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfn-src" function="TEMPLATE/CT_Fn/N" ${id}="ref-n"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="CT_Fn" uuid="fn-src" ${id}="fn-1">
						<SubFunction name="PhsA" uuid="sfa-src" templateUuid="lib-subfn" ${id}="sfa-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="1" lnType="TCTR_Type" ${id}="ln-a" uuid="lna-src"/>
						</SubFunction>
						<SubFunction name="PhsB" uuid="sfb-src" templateUuid="lib-subfn" ${id}="sfb-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="2" lnType="TCTR_Type" ${id}="ln-b" uuid="lnb-src"/>
						</SubFunction>
						<SubFunction name="PhsC" uuid="sfc-src" templateUuid="lib-subfn" ${id}="sfc-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="3" lnType="TCTR_Type" ${id}="ln-c" uuid="lnc-src"/>
						</SubFunction>
						<SubFunction name="N" uuid="sfn-src" templateUuid="lib-subfn" ${id}="sfn-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="4" lnType="TCTR_Type" ${id}="ln-n" uuid="lnn-src"/>
						</SubFunction>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="TCTR_Type" lnClass="TCTR" ${id}="lnt-s">
				<DO name="Amp" type="SAV_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="SAV_Type" cdc="SAV" ${id}="dot-s">
				<DA name="instMag" bType="Struct" fc="MX" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

/** Ids of every companion node folded onto the report's decision groups. */
function companionIds(groups: DecisionGroup[]): Set<string> {
	const ids = new Set<string>()
	for (const group of groups)
		for (const companion of group.companions) {
			const ref = companion.sourceRef ?? companion.instanceRef
			if (ref?.id) ids.add(ref.id)
		}
	return ids
}

describe('repro — FunctionCategory satellite highlight cluster (memberIds)', () => {
	// SYMPTOM 1 (first-time instantiate): the carried FunctionCategory satellite must be part of
	// the instance's member cluster so the UI highlights it. Today the first-time branch of
	// buildReportInstance only collects the source subtree, dropping the satellite companion.
	it('first-time instantiate: satellite folded AND in the instance memberIds', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const rep = await reportFsd(target.document.query, {
			sourceQuery: source.document.query,
			functionRef,
			targetParent: bayRef,
			scenario: 'instantiate',
		})

		const groups = allGroups(rep)
		const functionGroup = groups.find((g) => g.primary.tagName === 'Function')
		expect(functionGroup, 'function decision group present').toBeDefined()

		const catCompanion = functionGroup?.companions.find((c) => c.tagName === 'FunctionCategory')
		expect(catCompanion, 'FunctionCategory folded as companion of the function group').toBeDefined()

		const instance = rep.instances[0]
		expect(instance, 'one reported instance').toBeDefined()

		// every folded satellite companion id must be inside the instance member cluster,
		// so selecting the instance highlights the satellite too
		const members = new Set(instance!.memberIds)
		const missing = [...companionIds(groups)].filter((cid) => !members.has(cid))
		expect(missing, 'every folded satellite companion id is in memberIds').toEqual([])
	})

	// SYMPTOM 3 (update, unchanged template): re-report after instantiate must be a clean no-op.
	it('update (unchanged template): nothing is falsely removed/target-only', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		await target.document.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		})

		const falselyRemoved = allGroups(rep).filter(
			(g) => g.change === 'removed' || g.change === 'target-only',
		)
		expect(
			falselyRemoved.map((g) => `${g.change}:${g.primary.tagName}`),
			'unchanged template must not classify anything removed/target-only',
		).toEqual([])
	})

	// SYMPTOM 2 (instantiate): the nested SubCategory + every FunctionCatRef must be created.
	it('instantiate creates FunctionCategory > SubCategory > 4 FunctionCatRef', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		await target.document.transaction(async (tx) => {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})

		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		const subCategories = xml.match(/<(?:[A-Za-z0-9.-]+:)?SubCategory\b/g) ?? []
		const funcCatRefs = xml.match(/<(?:[A-Za-z0-9.-]+:)?FunctionCatRef\b/g) ?? []
		expect(subCategories.length, 'one SubCategory instantiated').toBe(1)
		expect(funcCatRefs.length, 'all four nested FunctionCatRef instantiated').toBe(4)
	})
})
