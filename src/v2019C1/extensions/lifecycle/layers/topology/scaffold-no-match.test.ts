import { describe, expect, it } from 'vitest'

import { reportTopologyFrame } from '@/v2019C1/extensions/lifecycle/report/query/report-topology-frame'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A source scope Bay named "TEMPLATE" (scaffolding, uuid-bearing, no templateUuid link to the target)
// must NOT be name-matched to an unrelated existing "TEMPLATE" bay. uuid-bearing elements match by
// lineage ONLY — no name fallback. (Was: the blanket name scan adopted the scaffold bay → spurious
// reconcile with invented "removed equipment".)
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-doc" uuid="ssd-doc-uuid" version="0" revision="1" ${id}="hdr-s"/>
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" uuid="bay-src-uuid" ${id}="bay-s">
					<ConductingEquipment name="QA1" type="CBR" uuid="ce-src-uuid" ${id}="ce-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="TEMPLATE" uuid="bay-tgt-uuid" ${id}="bay-t">
					<ConductingEquipment name="QA9" type="CBR" uuid="ce-tgt-uuid" ${id}="ce-t"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('topology frame — no name adoption of a scaffold TEMPLATE bay', () => {
	it('reportTopologyFrame(template) returns no instance when only the name matches (no lineage)', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		const frame = await reportTopologyFrame(target.document.query, {
			sourceQuery: source.document.query,
			scopeRef: { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>,
			scenario: 'template',
		})

		// the target "TEMPLATE" bay shares only the name (different uuid, no templateUuid link),
		// so it is NOT its instance — no spurious frame reconcile
		expect(frame).toHaveLength(0)
	})
})
