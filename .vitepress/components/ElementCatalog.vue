<script setup lang="ts">
import catalogData from '../data/elements-catalog.json'

import { ref, computed, watch, onMounted, nextTick } from 'vue'

interface AttrDetail {
	required: boolean
	default: string | null
	facets: Record<string, unknown> | null
}

interface ElementEntry {
	ns: string
	parents: string[]
	children: string[]
	requiredAttrs: string[]
	optionalAttrs: string[]
	documentation: string | null
	attributes: Record<string, AttrDetail>
}

interface GroupEntry {
	title: string
	description: string
	elements: string[]
}

const elements = catalogData.elements as Record<string, ElementEntry>
const groups = catalogData.groups as GroupEntry[]
const totalElements = catalogData.totalElements as number

const search = ref('')
const selectedDomain = ref<string | null>(null)
const showSuggestions = ref(false)
const selectedSuggestionIndex = ref(-1)

const allDomains = groups.map((g) => g.title)
const allElementNames = Object.keys(elements).sort()

const suggestions = computed(() => {
	const q = search.value.toLowerCase().trim()
	if (!q || q.length < 1) return []
	return allElementNames.filter((el) => el.toLowerCase().includes(q)).slice(0, 12)
})

function selectSuggestion(name: string) {
	search.value = name
	showSuggestions.value = false
	selectedSuggestionIndex.value = -1
}

function onInputKeydown(e: KeyboardEvent) {
	if (!showSuggestions.value || suggestions.value.length === 0) return
	if (e.key === 'ArrowDown') {
		e.preventDefault()
		selectedSuggestionIndex.value = Math.min(
			selectedSuggestionIndex.value + 1,
			suggestions.value.length - 1,
		)
	} else if (e.key === 'ArrowUp') {
		e.preventDefault()
		selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, 0)
	} else if (e.key === 'Enter' && selectedSuggestionIndex.value >= 0) {
		e.preventDefault()
		selectSuggestion(suggestions.value[selectedSuggestionIndex.value])
	} else if (e.key === 'Escape') {
		showSuggestions.value = false
	}
}

watch(search, () => {
	showSuggestions.value = search.value.length > 0
	selectedSuggestionIndex.value = -1
	if (search.value && matchCount.value === 1) {
		const el = filteredGroups.value[0]?.elements[0]
		if (el) {
			nextTick(() => {
				document.getElementById(`el-${el}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
			})
		}
	}
})

const filteredGroups = computed(() => {
	const q = search.value.toLowerCase().trim()
	let filtered = selectedDomain.value
		? groups.filter((g) => g.title === selectedDomain.value)
		: groups

	if (q) {
		filtered = filtered
			.map((g) => ({
				...g,
				elements: g.elements.filter((el) => el.toLowerCase().includes(q)),
			}))
			.filter((g) => g.elements.length > 0)
	}
	return filtered
})

const matchCount = computed(() =>
	filteredGroups.value.reduce((sum, g) => sum + g.elements.length, 0),
)

const filteredAttributeElements = computed(() => {
	const q = search.value.toLowerCase().trim()
	const domainSet = selectedDomain.value
		? new Set(groups.filter((g) => g.title === selectedDomain.value).flatMap((g) => g.elements))
		: null

	return Object.keys(elements)
		.filter((el) => {
			if (Object.keys(elements[el].attributes).length === 0) return false
			if (domainSet && !domainSet.has(el)) return false
			if (q && !el.toLowerCase().includes(q)) return false
			return true
		})
		.sort()
})

function formatFacets(facets: Record<string, unknown> | null): string {
	if (!facets) return ''
	return Object.entries(facets)
		.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
		.join(', ')
}

function onInputBlur() {
	setTimeout(() => {
		showSuggestions.value = false
	}, 150)
}

function clearFilters() {
	search.value = ''
	selectedDomain.value = null
	showSuggestions.value = false
}

// Handle hash navigation: if URL has #ElementName, filter to it
onMounted(() => {
	const hash = window.location.hash.slice(1)
	if (hash && elements[hash]) {
		search.value = hash
	}
})
</script>

<template>
	<div class="element-catalog">
		<h2 id="element-catalog">Element catalog</h2>

		<div class="filter-bar">
			<div class="filter-input-wrap">
				<div class="autocomplete-wrap">
					<input
						v-model="search"
						type="text"
						placeholder="Filter elements by name..."
						class="filter-input"
						autocomplete="off"
						@keydown="onInputKeydown"
						@focus="showSuggestions = search.length > 0"
						@blur="onInputBlur"
					/>
					<ul v-if="showSuggestions && suggestions.length > 0" class="suggestions">
						<li
							v-for="(s, i) in suggestions"
							:key="s"
							:class="['suggestion', { active: i === selectedSuggestionIndex }]"
							@mousedown.prevent="selectSuggestion(s)"
						>
							<code>{{ s }}</code>
						</li>
					</ul>
				</div>
				<span class="filter-count">{{ matchCount }} / {{ totalElements }}</span>
				<button v-if="search || selectedDomain" class="clear-btn" @click="clearFilters">
					Clear
				</button>
			</div>
			<div class="domain-chips">
				<button
					v-for="domain in allDomains"
					:key="domain"
					:class="['chip', { active: selectedDomain === domain }]"
					@click="selectedDomain = selectedDomain === domain ? null : domain"
				>
					{{ domain }}
				</button>
			</div>
		</div>

		<h3 id="element-reference">Element reference</h3>

		<div v-if="filteredGroups.length === 0" class="no-results">
			No elements match <strong>{{ search }}</strong>
		</div>

		<template v-for="group in filteredGroups" :key="group.title">
			<h3 :id="'group-' + group.title.toLowerCase()">{{ group.title }}</h3>
			<p>{{ group.description }}</p>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Element</th>
							<th>NS</th>
							<th>Parents</th>
							<th>Children</th>
							<th>Required attrs</th>
							<th>Optional attrs</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="el in group.elements" :key="el" :id="'el-' + el">
							<td>
								<code>{{ el }}</code>
							</td>
							<td>
								<code>{{ elements[el].ns }}</code>
							</td>
							<td>
								<span v-for="(p, i) in elements[el].parents" :key="p"
									><code>{{ p }}</code
									><span v-if="i < elements[el].parents.length - 1">, </span></span
								><span v-if="elements[el].parents.length === 0">-</span>
							</td>
							<td>
								<span v-for="(c, i) in elements[el].children" :key="c"
									><code>{{ c }}</code
									><span v-if="i < elements[el].children.length - 1">, </span></span
								><span v-if="elements[el].children.length === 0">-</span>
							</td>
							<td>
								<span v-for="(a, i) in elements[el].requiredAttrs" :key="a"
									><code>{{ a }}</code
									><span v-if="i < elements[el].requiredAttrs.length - 1">, </span></span
								><span v-if="elements[el].requiredAttrs.length === 0">-</span>
							</td>
							<td>
								<span v-for="(a, i) in elements[el].optionalAttrs" :key="a"
									><code>{{ a }}</code
									><span v-if="i < elements[el].optionalAttrs.length - 1">, </span></span
								><span v-if="elements[el].optionalAttrs.length === 0">-</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</template>

		<h3 id="attribute-details">Attribute details</h3>
		<p>
			Expand any element below to see full attribute definitions with types, defaults, and
			constraints.
		</p>

		<div v-if="filteredAttributeElements.length === 0" class="no-results">
			No elements match the current filter.
		</div>

		<details v-for="el in filteredAttributeElements" :key="el" :id="'attr-' + el">
			<summary>
				<code>{{ el }}</code> ({{ Object.keys(elements[el].attributes).length }} attributes)
			</summary>
			<p v-if="elements[el].documentation" class="el-doc">{{ elements[el].documentation }}</p>
			<table>
				<thead>
					<tr>
						<th>Attribute</th>
						<th>Required</th>
						<th>Default</th>
						<th>Facets</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(detail, attrName) in elements[el].attributes" :key="attrName">
						<td>
							<code>{{ attrName }}</code>
						</td>
						<td>{{ detail.required ? 'yes' : '' }}</td>
						<td>
							<code v-if="detail.default !== null">{{ detail.default }}</code>
						</td>
						<td class="facets">{{ formatFacets(detail.facets) }}</td>
					</tr>
				</tbody>
			</table>
		</details>
	</div>
</template>

<style scoped>
.element-catalog {
	margin-top: 32px;
}

.filter-bar {
	position: sticky;
	top: var(--vp-nav-height, 64px);
	z-index: 10;
	background: var(--vp-c-bg);
	padding: 12px 0 8px;
}

.filter-input-wrap {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}

.autocomplete-wrap {
	position: relative;
	flex: 1;
}

.filter-input {
	width: 100%;
	padding: 8px 12px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-1);
	font-size: 14px;
	outline: none;
	transition: border-color 0.2s;
}

.filter-input:focus {
	border-color: var(--vp-c-brand-1);
}

.filter-input::placeholder {
	color: var(--vp-c-text-3);
}

.filter-count {
	font-size: 13px;
	color: var(--vp-c-text-2);
	white-space: nowrap;
}

.clear-btn {
	padding: 4px 10px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 6px;
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-2);
	font-size: 12px;
	cursor: pointer;
}

.clear-btn:hover {
	background: var(--vp-c-bg-elv);
}

.domain-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.chip {
	padding: 4px 12px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 16px;
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-2);
	font-size: 12px;
	cursor: pointer;
	transition: all 0.15s;
}

.chip:hover {
	border-color: var(--vp-c-brand-1);
	color: var(--vp-c-text-1);
}

.chip.active {
	background: var(--vp-c-brand-soft);
	border-color: var(--vp-c-brand-1);
	color: var(--vp-c-brand-1);
}

.no-results {
	padding: 24px;
	text-align: center;
	color: var(--vp-c-text-3);
}

.table-wrap {
	overflow-x: auto;
}

.el-doc {
	color: var(--vp-c-text-2);
	font-style: italic;
	margin-top: 8px;
}

.suggestions {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	margin: 4px 0 0;
	padding: 4px 0;
	list-style: none;
	background: var(--vp-c-bg-elv);
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	max-height: 280px;
	overflow-y: auto;
	z-index: 20;
}

.suggestion {
	padding: 6px 12px;
	cursor: pointer;
	font-size: 13px;
}

.suggestion:hover,
.suggestion.active {
	background: var(--vp-c-bg-soft);
}

.suggestion code {
	font-size: 13px;
}

.facets {
	font-size: 12px;
	color: var(--vp-c-text-2);
}
</style>
