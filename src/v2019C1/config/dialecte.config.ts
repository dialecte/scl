import {
	DEFINITION,
	ELEMENT_NAMES,
	ATTRIBUTES,
	CHILDREN,
	PARENTS,
	DESCENDANTS,
	ANCESTORS,
} from '../definition'
//import { EXTENSIONS } from '../extensions'
import { HOOKS } from '../hooks'

import type { IOConfig, AnyDialecteConfig, DatabaseConfig, AnyDefinition } from '@dialecte/core'

// SCL-specific IO configuration
export const SCL_IO_CONFIG = {
	supportedFileExtensions: ['.fsd', '.asd', '.ssd', '.scd', '.isd', '.xml'],
} as const satisfies IOConfig

// SCL database configuration
export const SCL_DATABASE_CONFIG = {
	tables: {
		xmlElements: {
			name: 'sclElements',
			schema:
				'id, tagName, [id+tagName], parent.id, parent.tagName, *children.id, *children.tagName',
		},
		additionalTables: {
			attachedFiles: {
				schema: 'id, filename, file',
			},
		},
	},
} as const satisfies DatabaseConfig

export const SCL_NAMESPACES = {
	default: { uri: 'http://www.iec.ch/61850/2003/SCL', prefix: '' },
	v2019C1: {
		uri: 'http://www.iec.ch/61850/2019/SCL/6-100',
		prefix: 'eIEC61850-6-100',
	},
} as const

export const SCL_DIALECTE_CONFIG = {
	rootElementName: 'SCL' as const,
	singletonElements: [
		'SCL',
		'Header',
		'Substation',
		'Communication',
		'IEDs',
		'DataTypeTemplates',
	] as const,
	elements: ELEMENT_NAMES,
	namespaces: SCL_NAMESPACES,
	attributes: ATTRIBUTES,
	children: CHILDREN,
	parents: PARENTS,
	descendants: DESCENDANTS,
	ancestors: ANCESTORS,
	database: SCL_DATABASE_CONFIG,
	io: SCL_IO_CONFIG,
	definition: DEFINITION as AnyDefinition,
	hooks: HOOKS,
	extensions: {},
} as const satisfies AnyDialecteConfig
