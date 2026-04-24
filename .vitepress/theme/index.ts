import ElementCatalog from '../components/ElementCatalog.vue'

import { useData } from 'vitepress'
import { createMermaidRenderer } from 'vitepress-mermaid-renderer'
import DefaultTheme from 'vitepress/theme'
import { h, nextTick, watch } from 'vue'

import type { Theme } from 'vitepress'
import './custom.css'

export default {
	extends: DefaultTheme,
	Layout: () => {
		const { isDark } = useData()

		const initMermaid = () => {
			createMermaidRenderer({
				theme: isDark.value ? 'dark' : 'forest',
			})
		}

		nextTick(() => initMermaid())

		watch(
			() => isDark.value,
			() => initMermaid(),
		)

		return h(DefaultTheme.Layout)
	},
	enhanceApp({ app }) {
		app.component('ElementCatalog', ElementCatalog)
	},
} satisfies Theme
