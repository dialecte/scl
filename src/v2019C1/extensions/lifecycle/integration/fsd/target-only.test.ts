import { describe, expect, it } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="ln-1" uuid="ln1-uuid"/>
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
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

// An author-added element (no source lineage) is a TARGET-ONLY change: it must be
// PRESERVED by default (its own decision group defaults to skip), and only DELETED
// when the user explicitly accepts that group. Generic over the element tag.
async function setup(): Promise<{
	sourceQuery: Scl.Query
	targetDoc: Scl.Document
}> {
	const { source, target } = await createSclTestProject({ sourceXml, targetXml })
	if (!target) throw new Error('target required')
	const sourceQuery = source.document.query
	const targetDoc = target.document

	await targetDoc.transaction(async (tx) => {
		await instantiateFsd(tx, { sourceQuery, functionRef, targetParent: bayRef })
	})

	const functions = await targetDoc.query.getRecordsByTagName('Function')
	const instance = functions.find((f) =>
		f.attributes.some((a) => a.name === 'templateUuid' && a.value === 'fn-src-uuid'),
	)
	if (!instance) throw new Error('instance function not found')
	const instanceFunctionRef = { tagName: 'Function', id: instance.id } as Scl.Ref<'Function'>

	// the author adds a locally-authored LNode (no templateUuid, no source lineage)
	await targetDoc.transaction(async (tx) => {
		await tx.addChild(instanceFunctionRef, {
			tagName: 'LNode',
			attributes: { iedName: 'None', lnClass: 'GGIO', lnInst: '9', lnType: 'CSWI_Type' },
		})
	})

	return { sourceQuery, targetDoc }
}

async function reportAndApply(
	sourceQuery: Scl.Query,
	targetDoc: Scl.Document,
	decide: (groups: DecisionGroup[]) => DecisionMap,
): Promise<string> {
	const rep = await report(targetDoc.query, {
		verb: 'fsd',
		sourceQuery,
		ref: functionRef,
		anchor: bayRef,
	})
	await targetDoc.transaction(async (tx) => {
		await apply(tx, {
			verb: 'fsd',
			sourceQuery,
			ref: functionRef,
			anchor: bayRef,
			report: rep,
			decisions: decide(allGroups(rep)),
		})
	})
	return (await targetDoc.query.getSnapshot({ as: 'xml' })) as string
}

describe('lifecycle — target-only (author-added, no source lineage)', () => {
	it('reports the author element as its own group defaulting to skip (keep)', async () => {
		const { sourceQuery, targetDoc } = await setup()
		const rep = await report(targetDoc.query, {
			verb: 'fsd',
			sourceQuery,
			ref: functionRef,
			anchor: bayRef,
		})
		const targetOnly = allGroups(rep).filter((g) => g.change === 'target-only')
		expect(targetOnly).toHaveLength(1)
		expect(targetOnly[0]?.suggestedAction).toBe('skip')
	})

	it('KEEPS the author element by default (no explicit decision)', async () => {
		const { sourceQuery, targetDoc } = await setup()
		const xml = await reportAndApply(sourceQuery, targetDoc, () => new Map())
		expect(xml).toContain('lnClass="GGIO"')
	})

	it('DELETES the author element only when its group is accepted', async () => {
		const { sourceQuery, targetDoc } = await setup()
		const xml = await reportAndApply(
			sourceQuery,
			targetDoc,
			(groups) =>
				new Map(
					groups.filter((g) => g.change === 'target-only').map((g) => [g.id, 'accept'] as const),
				),
		)
		expect(xml).not.toContain('lnClass="GGIO"')
	})
})
