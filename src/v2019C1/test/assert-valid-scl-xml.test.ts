import { assertValidSclXml } from './assert-valid-scl-xml'
import { ALL_XMLNS_NAMESPACES } from './hydrated-test'

import { describe, expect, it } from 'vitest'

const XMLNS_VENDOR_NAMESPACE = 'xmlns:vendor="http://vendor.example/private-elements"'

function captureErrorMessage(run: () => void): string {
	try {
		run()
	} catch (error) {
		return (error as Error).message
	}
	return ''
}

describe('assertValidSclXml', () => {
	describe('accepts', () => {
		it('a structurally valid snippet', () => {
			const xml = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="Substation1">
						<VoltageLevel name="VoltageLevel1">
							<Bay name="Bay1" />
						</VoltageLevel>
					</Substation>
				</SCL>
			`
			expect(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			).not.toThrow()
		})

		it('a foreign-namespace element whose local name collides with a schema element', () => {
			const xml = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${XMLNS_VENDOR_NAMESPACE}>
					<Substation name="Substation1">
						<Private type="vendor-address">
							<vendor:Address casdu="10" ioa="1000" locked="false" />
						</Private>
					</Substation>
				</SCL>
			`
			expect(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			).not.toThrow()
		})

		it('the colliding children of a foreign-namespace element', () => {
			const xml = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${XMLNS_VENDOR_NAMESPACE}>
					<Substation name="Substation1">
						<Private type="vendor-address">
							<vendor:Services>
								<vendor:TimeSyncProt>
									<vendor:P kind="custom">value</vendor:P>
								</vendor:TimeSyncProt>
							</vendor:Services>
						</Private>
					</Substation>
				</SCL>
			`
			expect(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			).not.toThrow()
		})
	})

	describe('rejects', () => {
		it('schema elements left in no namespace', () => {
			const xml = /* xml */ `
				<SCL>
					<Substation name="Substation1" />
				</SCL>
			`
			const message = captureErrorMessage(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			)
			expect(message).toContain('[namespace] <SCL>')
			expect(message).toContain('[namespace] <Substation> under <SCL>')
		})

		it('a schema element nested in a foreign-namespace element but left in the wrong namespace', () => {
			const xml = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${XMLNS_VENDOR_NAMESPACE}>
					<Substation name="Substation1">
						<Private type="vendor-wrapper">
							<vendor:Wrapper>
								<eIEC61850-6-100:Function name="Function1" />
							</vendor:Wrapper>
						</Private>
					</Substation>
				</SCL>
			`
			const message = captureErrorMessage(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			)
			expect(message).toContain('[namespace] <eIEC61850-6-100:Function>')
		})

		it('a child the schema does not allow under its parent', () => {
			const xml = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<IED name="IED1">
						<Services>
							<TimeSyncProt>
								<P type="MAC-Address">01-0C-CD-01-00-04</P>
							</TimeSyncProt>
						</Services>
					</IED>
				</SCL>
			`
			const message = captureErrorMessage(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			)
			expect(message).toContain('[containment] <P> is not a valid child of <TimeSyncProt>')
		})

		it('an attribute the schema does not declare', () => {
			const xml = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="Substation1" templateUUID="not-a-schema-attribute" />
				</SCL>
			`
			const message = captureErrorMessage(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			)
			expect(message).toContain("[attribute] <Substation> has unknown attribute 'templateUUID'")
		})

		it('text that is not well-formed, naming where the parser stopped', () => {
			const xml = /* xml */ `<SCL ${ALL_XMLNS_NAMESPACES}><Substation name="Substation1"></SCL>`
			const message = captureErrorMessage(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			)
			expect(message).toMatch(/^snippet: malformed XML - \d+:\d+ \S/)
		})

		it('an XML declaration preceded by whitespace, saying how to fix it', () => {
			const xml = /* xml */ `
				<?xml version="1.0" encoding="UTF-8"?>
				<SCL ${ALL_XMLNS_NAMESPACES} />
			`
			const message = captureErrorMessage(() =>
				assertValidSclXml({ xml, label: 'snippet', requireComplete: false }),
			)
			expect(message).toContain('snippet: malformed XML')
			expect(message).toContain('must be the very first characters')
		})
	})
})
