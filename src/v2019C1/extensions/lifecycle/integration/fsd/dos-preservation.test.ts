import { describe, expect, it } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

// Merge-review item 5: an author adds a `DOS` (e.g. EEName) INSIDE an already-instantiated
// LNode's `Private`, then re-runs update against the SAME template. `DOS`/`SDS`/`DAS` are
// CONTENT-spec containers that carry an OPTIONAL `mapped*Name` -> LN mapping, so they appear
// in the reference-pair table; the dropped-link removal heuristic must NOT treat an
// author-added one as a removed link. It is a `target-only` change: kept by default,
// removed only when its group is explicitly accepted.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="CT Function" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="TCTR" lnInst="1" lnType="TCTR_Type" uuid="ln-src-uuid" ${id}="ln-1">
							<Private type="eIEC61850-6-100" ${id}="lnpriv-s">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="TCTR" sLnInst="1" ${id}="lnsn-s"/>
							</Private>
						</LNode>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="TCTR_Type" lnClass="TCTR" ${id}="lnt-s">
				<DO name="AmpSv" type="SAV_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="SAV_Type" cdc="SAV" ${id}="dot-s">
				<DA name="q" bType="Quality" fc="MX" ${id}="da-s"/>
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

async function instantiateWithAuthorDos(): Promise<{
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

	const lnodes = await targetDoc.query.getRecordsByTagName('LNode')
	const instanceLNode = lnodes.find((ln) =>
		ln.attributes.some((a) => a.name === 'templateUuid' && a.value === 'ln-src-uuid'),
	)
	if (!instanceLNode) throw new Error('instance LNode not found')
	const [priv] = await targetDoc.query.any.getChildren(
		{ tagName: 'LNode', id: instanceLNode.id },
		'Private',
	)
	if (!priv) throw new Error('instance LNode Private not found')

	// the author adds a DOS (EEName) inside the existing Private
	await targetDoc.transaction(async (tx) => {
		await tx.any.addChild(
			{ tagName: 'Private', id: priv.id },
			{ tagName: 'DOS', attributes: { name: 'EEName' } },
		)
	})

	return { sourceQuery, targetDoc }
}

async function updateAndSerialize(
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
			decisions: decide(rep.groups),
		})
	})
	return (await targetDoc.query.getSnapshot({ as: 'xml' })) as string
}

describe('lifecycle — author DOS under a matched LNode/Private (content-reference tag)', () => {
	it('classifies the author DOS as target-only, not a dropped link', async () => {
		const { sourceQuery, targetDoc } = await instantiateWithAuthorDos()
		const rep = await report(targetDoc.query, {
			verb: 'fsd',
			sourceQuery,
			ref: functionRef,
			anchor: bayRef,
		})
		const dosGroup = rep.groups.find((g) => g.primary.tagName === 'DOS')
		expect(dosGroup?.primary.change).toBe('target-only')
		expect(dosGroup?.suggestedAction).toBe('skip')
	})

	it('keeps the author DOS by default (no explicit decision)', async () => {
		const { sourceQuery, targetDoc } = await instantiateWithAuthorDos()
		const xml = await updateAndSerialize(sourceQuery, targetDoc, () => new Map())
		expect(xml).toContain('name="EEName"')
	})

	it('removes the author DOS only when its group is accepted', async () => {
		const { sourceQuery, targetDoc } = await instantiateWithAuthorDos()
		const xml = await updateAndSerialize(
			sourceQuery,
			targetDoc,
			(groups) =>
				new Map(
					groups.filter((g) => g.primary.tagName === 'DOS').map((g) => [g.id, 'accept'] as const),
				),
		)
		expect(xml).not.toContain('name="EEName"')
	})
})
