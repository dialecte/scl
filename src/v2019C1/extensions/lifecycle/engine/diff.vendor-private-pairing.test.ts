import { diff } from './diff'

import { describe, expect, it } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'
import { openSclDocument } from '@/v2019C1/test/open-scl-document'

import type { DiffNode } from './diff.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

/** A template function whose SCL Private holds a vendor Private (another namespace) of type A. */
const templateWithA = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<Private ${id}="private-s" type="ACME">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-A" type="A">A data</v:Private>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Its revision: a vendor Private of type B inserted before the one of type A. */
const templateWithBThenA = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<Private ${id}="private-s" type="ACME">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-B" type="B">B data</v:Private>
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-A" type="A">A data</v:Private>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Its revision: the vendor Private of type A with another text. */
const templateWithARevised = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<Private ${id}="private-s" type="ACME">
							<v:Private xmlns:v="urn:vendor" ${id}="vendor-A" type="A">A data, revised</v:Private>
						</Private>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
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

/** Each vendor Private node of a diff tree: its change and the type it names on the template side, else the instance's. */
function vendorPrivates(params: {
	node: DiffNode
	query: Core.Query<Config>
	types: Map<string, string>
}): string[] {
	const { node } = params
	const own =
		node.tagName === 'Private'
			? [
					`${node.change} ${params.types.get(node.sourceRef?.id ?? node.instanceRef?.id ?? '') ?? '?'}`,
				]
			: []
	return [...own, ...node.children.flatMap((child) => vendorPrivates({ ...params, node: child }))]
}

describe('diff - a vendor Private pairs by its type, never by order across types', () => {
	it('the template inserts a vendor Private of type B before the placed one of type A → B added, A unchanged', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: templateWithA,
			targetXml,
		})
		if (!target) throw new Error('target required')
		await target.document.transaction(async function place(tx) {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})
		const revision = await openSclDocument({
			project,
			xml: templateWithBThenA,
			label: 'revision',
		})
		const [instanceFunction] = await target.document.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'fn-src-uuid' },
		})
		if (!instanceFunction) throw new Error('instance not found')
		const instancePrivates = await target.document.query.getRecordsByTagName('Private')
		const types = new Map<string, string>([
			['vendor-A', 'A'],
			['vendor-B', 'B'],
			...instancePrivates.map(function typeOf(record) {
				const type = record.attributes.find((attribute) => attribute.name === 'type')?.value ?? ''
				return [record.id, type] as [string, string]
			}),
		])

		const report = await diff({
			sourceQuery: revision.query,
			targetQuery: target.document.query,
			sourceRootRef: functionRef,
			instanceRootRef: instanceFunction,
		})

		expect(
			vendorPrivates({
				node: report.root,
				query: target.document.query as Core.Query<Config>,
				types,
			}).sort(),
		).toEqual(['added B', 'unchanged A'])
	})

	it('the template changes the text of the placed vendor Private, the change accepted and applied → the project’s vendor Private holds the new text', async () => {
		const { project, source, target } = await createSclTestProject({
			sourceXml: templateWithA,
			targetXml,
		})
		if (!target) throw new Error('target required')
		await target.document.transaction(async function place(tx) {
			await instantiateFsd(tx, {
				sourceQuery: source.document.query,
				functionRef,
				targetParent: bayRef,
			})
		})
		const revision = await openSclDocument({
			project,
			xml: templateWithARevised,
			label: 'revision',
		})
		const lifecycle = {
			verb: 'fsd',
			sourceQuery: revision.query,
			ref: functionRef,
			anchor: bayRef,
			scenario: 'template',
		} as const
		const report = await target.document.query.lifecycle.report(lifecycle)
		// the text change is a group of its own, accepted
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, 'accept' as const]))
		await target.document.transaction(async function update(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		const privates = await target.document.query.getRecordsByTagName('Private')
		const vendor = privates.find(function isVendor(record) {
			return record.namespace.uri === 'urn:vendor'
		})

		expect(vendor?.value.trim()).toBe('A data, revised')
	})
})
