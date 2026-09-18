export type SchemaNamespace = { uri: string }

/** The slice of a generated element definition the fixture validator reads. */
export type SchemaElementDefinition = {
	namespace?: SchemaNamespace
	attributes?: {
		sequence?: readonly string[]
		details?: Record<string, { required?: boolean } | undefined>
	}
	children?: {
		sequence?: readonly string[]
		any?: boolean
		details?: Record<string, { namespace?: SchemaNamespace } | undefined>
	}
}

export type AssertValidSclXmlOptions = { requireComplete?: boolean }

export type DescribeInvalidSclXmlParams = {
	xml: string
	label: string
	requireComplete: boolean
}

export type CollectElementViolationsParams = {
	element: Element
	parentLocalName: string | undefined
	requireComplete: boolean
}

export type CollectAttributeViolationsParams = {
	element: Element
	definition: SchemaElementDefinition
	requireComplete: boolean
}

export type AssertValidSclTestCasesParams = {
	testCases: Record<string, { sourceXml: string; targetXml?: string }>
}
