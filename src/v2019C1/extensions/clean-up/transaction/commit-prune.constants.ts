import { CHILDREN } from '@/v2019C1/definition/constants.generated'

/** The attributes that name an element for a person, read where its tag has them. */
export const IDENTITY_ATTRIBUTES = ['name', 'uuid', 'type'] as const

/** The tags of a data type a commit removes as unused: the children of a `DataTypeTemplates`, from the definition. */
export const DATA_TYPE_TAGS: ReadonlySet<string> = new Set(CHILDREN.DataTypeTemplates)
