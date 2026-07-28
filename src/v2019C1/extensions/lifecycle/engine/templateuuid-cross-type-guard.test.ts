import { diff } from './diff'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A placeholder `templateUuid` reused across unrelated element TYPES (the real .ssd smears one
// dummy value over Substation, FunctionCategory, AllocationRole, LNode...) must never let a source
// element match an instance element of a DIFFERENT tag just because the value coincides with the
// source `uuid`. Template lineage is only valid within the same element type; a cross-type hit is a
// collision, not a lineage.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-src">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="priv-s">
				<eIEC61850-6-100:Application name="App" uuid="app-src" ${id}="app-s">
					<eIEC61850-6-100:Function name="Fn" uuid="123e4567-e89b-12d3-a456-789012345678" ${id}="fn-s"/>
				</eIEC61850-6-100:Application>
			</Private>
		</Substation>
	</SCL>`

// The instance carries NO Function; it has an AllocationRole whose templateUuid coincides with the
// source Function's uuid (the shared placeholder). The source Function must surface as `added`, not
// be matched onto the AllocationRole.
const instanceXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="priv-t">
				<eIEC61850-6-100:Application name="App" uuid="app-inst" templateUuid="app-src" ${id}="app-i">
					<eIEC61850-6-100:AllocationRole name="PIU" uuid="PIU_AR" templateUuid="123e4567-e89b-12d3-a456-789012345678" ${id}="ar-i"/>
				</eIEC61850-6-100:Application>
			</Private>
		</Substation>
	</SCL>`

describe('engine.diff — templateUuid lineage match must agree on element type', () => {
	it('classifies the source Function as added, not matched onto a same-value AllocationRole', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml: instanceXml })
		if (!target) throw new Error('target required')

		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>,
			instanceRootRef: { tagName: 'Application', id: 'app-i' } as Scl.Ref<'Application'>,
		})

		const fnGroup = report.groups.find((g) => g.primary.tagName === 'Function')
		expect(fnGroup?.change, 'source Function must be a genuine add, not a cross-type match').toBe(
			'added',
		)
	})
})
