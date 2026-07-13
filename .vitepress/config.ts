import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	vite: {
		plugins: [llmstxt()],
	},
	srcDir: 'doc',
	base: '/scl/',

	title: 'SCL Dialecte',
	description: 'IEC 61850, fully typed',
	head: [['link', { rel: 'icon', href: '/scl/logo.svg' }]],

	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		logo: '/logo.svg',

		search: {
			provider: 'local',
		},

		nav: [
			{ text: 'Home', link: '/' },
			{ text: 'Guide', link: '/guide/introduction/getting-started' },
			{
				text: 'v2019C1',
				items: [
					{ text: 'Overview', link: '/v2019C1/' },
					{ text: 'API', link: '/v2019C1/api/types' },
					{ text: 'IO', link: '/v2019C1/io/' },
					{ text: 'Extensions', link: '/v2019C1/extensions/' },
				],
			},
			{
				text: 'LLMs',
				items: [
					{ text: 'llms.txt', link: '/scl/llms.txt', target: '_blank' },
					{ text: 'llms-full.txt', link: '/scl/llms-full.txt', target: '_blank' },
				],
			},
		],

		sidebar: {
			'/guide/': [
				{
					text: 'Getting Started',
					items: [
						{ text: 'Introduction', link: '/guide/introduction/what-is-scl-dialecte' },
						{ text: 'Quick Start', link: '/guide/introduction/getting-started' },
					],
				},
			],
			'/v2019C1/': [
				{
					text: 'v2019C1',
					items: [{ text: 'Overview', link: '/v2019C1/' }],
				},
				{
					text: 'API',
					items: [
						{ text: 'Types', link: '/v2019C1/api/types' },
						{ text: 'Element Catalog', link: '/v2019C1/api/elements' },
						{ text: 'Test Helpers', link: '/v2019C1/api/test-helpers' },
					],
				},
				{
					text: 'IO',
					items: [
						{ text: 'Overview', link: '/v2019C1/io/' },
						{ text: 'Reference', link: '/v2019C1/io/io' },
						{ text: 'Hooks', link: '/v2019C1/io/hooks' },
					],
				},
				{
					text: 'Extensions',
					items: [
						{ text: 'Overview', link: '/v2019C1/extensions/' },
						{ text: 'History', link: '/v2019C1/extensions/history' },
						{ text: 'Data Model', link: '/v2019C1/extensions/data-model' },
						{ text: 'Reference', link: '/v2019C1/extensions/reference' },
						{ text: 'Identity', link: '/v2019C1/extensions/identity' },
						{
							text: 'Lifecycle',
							items: [
								{ text: 'Extract', link: '/v2019C1/extensions/extract' },
								{ text: 'Instantiate', link: '/v2019C1/extensions/instantiate' },
								{ text: 'Update', link: '/v2019C1/extensions/update' },
								{ text: 'Transplant', link: '/v2019C1/extensions/transplant' },
							],
						},
						{ text: 'Template', link: '/v2019C1/extensions/template' },
						{ text: 'Presentation', link: '/v2019C1/extensions/presentation' },
						{ text: 'Clean Up', link: '/v2019C1/extensions/clean-up' },
					],
				},
				{
					text: 'Core',
					items: [
						{
							text: 'Query / Transaction / Document',
							link: 'https://dialecte.github.io/core/api/',
						},
					],
				},
			],
		},

		socialLinks: [{ icon: 'github', link: 'https://github.com/dialecte/scl' }],
	},
})
