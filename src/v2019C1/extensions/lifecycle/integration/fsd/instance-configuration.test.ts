import { listAttributeChanges, listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect, it } from 'vitest'

import { readAttributes } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'
import { treeEntriesOf } from '@/v2019C1/test/tree-entries'

import type { Scl } from '@/v2019C1/config'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const variableRef = { tagName: 'Variable', id: 'var-s' } as Scl.Ref<'Variable'>
const behaviorRef = { tagName: 'BehaviorDescription', id: 'bd-s' } as Scl.Ref<'BehaviorDescription'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

// a function template with a variable and a behaviour description applying to its logical node
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Header id="prot" uuid="fsd-file" version="1" revision="A" ${id}="fsd-header"/>
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Variable name="Prefix" value="template-value" uuid="var-src-uuid" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/Prot/CSWI1" elementUuid="lnode-src-uuid" ${id}="vat-s"/>
				</eIEC61850-6-100:Variable>
				<eIEC61850-6-100:BehaviorDescription name="Logic" fileReference="template-logic.xml" uuid="bd-src-uuid" ${id}="bd-s">
					<eIEC61850-6-100:InputVar dataName="TEMPLATE/Prot/CSWI1" lnodeUuid="lnode-src-uuid" doName="Pos" ${id}="iv-s"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
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
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const lifecycle = (sourceQuery: Scl.Query) =>
	({ verb: 'fsd', sourceQuery, ref: functionRef, anchor: bayRef }) as const

/** Every kept difference of a report: `<tag>.<name>: <before> -> <after> (<reason>)`, sorted. */
function listKept(report: DiffReport): string[] {
	const out: string[] = []
	const visit = (node: DiffNode): void => {
		for (const kept of node.keptAttributeChanges ?? [])
			out.push(`${node.tagName}.${kept.name}: ${kept.before} -> ${kept.after} (${kept.reason})`)
		for (const child of node.children) visit(child)
	}
	for (const instance of report.instances) visit(instance.tree)
	return out.sort()
}

/** The function placed, then configured by the project: its variable's value and its behaviour's file. */
async function placedAndConfigured() {
	const { source, target } = await createSclTestProject({ sourceXml, targetXml })
	if (!target) throw new Error('target required')
	await reportAndApply({ document: target.document, lifecycle: lifecycle(source.document.query) })
	const [variable] = await target.document.query.getRecordsByTagName('Variable')
	const [behavior] = await target.document.query.getRecordsByTagName('BehaviorDescription')
	await target.document.transaction(async (tx) => {
		await tx.update(variable, { attributes: { value: 'project-value' } })
		await tx.update(behavior, { attributes: { fileReference: 'project-logic.xml' } })
	})
	return { source: source.document, target: target.document }
}

async function configuredValues(document: Scl.Document): Promise<string[]> {
	const tree = await document.query.getSnapshot({ as: 'tree' })
	return treeEntriesOf(tree)
		.map((entry) => entry.record)
		.filter((record) => record.tagName === 'Variable' || record.tagName === 'BehaviorDescription')
		.map((record) => {
			const { name, value, fileReference, desc } = readAttributes({ record, defaults: 'none' })
			return record.tagName === 'Variable'
				? `Variable ${name} ${value} ${desc ?? ''}`.trim()
				: `BehaviorDescription ${name} ${fileReference} ${desc ?? ''}`.trim()
		})
		.sort()
}

describe('update: what an instance configures is kept on a template update', () => {
	it('a template changing the value of a variable and the file of a behaviour: kept, listed, the instance up to date', async () => {
		const { source, target } = await placedAndConfigured()
		await source.transaction(async (tx) => {
			await tx.update(variableRef, { attributes: { value: 'template-value-2' } })
			await tx.update(behaviorRef, { attributes: { fileReference: 'template-logic-2.xml' } })
		})

		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycle(source.query),
		})

		expect(listGroups(report), 'nothing to decide').toEqual([])
		expect(listKept(report)).toEqual([
			'BehaviorDescription.fileReference: project-logic.xml -> template-logic-2.xml (instance-configuration)',
			'Variable.value: project-value -> template-value-2 (instance-configuration)',
		])
		expect(report.instances.every((instance) => instance.upToDate)).toBe(true)
		expect(report.summary.kept).toBe(2)
		expect(await configuredValues(target)).toEqual([
			'BehaviorDescription Logic project-logic.xml',
			'Variable Prefix project-value',
		])
	})

	it('beside another change of the same elements: that change is written, the configuration kept', async () => {
		const { source, target } = await placedAndConfigured()
		await source.transaction(async (tx) => {
			await tx.update(variableRef, { attributes: { value: 'template-value-2', desc: 'r2' } })
			await tx.update(behaviorRef, {
				attributes: { fileReference: 'template-logic-2.xml', desc: 'r2' },
			})
		})

		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycle(source.query),
		})

		expect(listAttributeChanges(report)).toEqual(['desc: - -> r2', 'desc: - -> r2'])
		expect(await configuredValues(target)).toEqual([
			'BehaviorDescription Logic project-logic.xml r2',
			'Variable Prefix project-value r2',
		])
	})

	it('an update that changes nothing lists no satellite in the tree', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		await reportAndApply({ document: target.document, lifecycle: lifecycle(source.document.query) })

		const { report } = await reportAndApply({
			document: target.document,
			lifecycle: lifecycle(source.document.query),
		})

		expect(
			report.instances.map((instance) => instance.tree.children.map((child) => child.tagName)),
		).toEqual([['LNode']])
	})

	it('a behaviour description the template gains carries the template file', async () => {
		const { source, target } = await placedAndConfigured()
		await source.transaction(async (tx) => {
			const added = await tx.addChild(
				{ tagName: 'Substation', id: 'sub-s' } as Scl.Ref<'Substation'>,
				{
					tagName: 'BehaviorDescription',
					attributes: { name: 'Interlock', fileReference: 'template-interlock.xml' },
				},
			)
			await tx.addChild(added, {
				tagName: 'InputVar',
				attributes: {
					varName: 'in1',
					dataName: 'TEMPLATE/Prot/CSWI1',
					lnodeUuid: 'lnode-src-uuid',
					doName: 'Pos',
				},
			})
		})

		await reportAndApply({ document: target, lifecycle: lifecycle(source.query) })

		expect(await configuredValues(target)).toEqual([
			'BehaviorDescription Interlock template-interlock.xml',
			'BehaviorDescription Logic project-logic.xml',
			'Variable Prefix project-value',
		])
	})
})
