import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
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
			{ text: 'Api', items: [{ text: 'v2019C1', link: '/api/v2019C1' }] },
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
			'/api/v2019C1/': [
				{
					text: 'v2019C1',
					items: [
						{ text: 'Overview', link: '/api/v2019C1/' },
						{ text: 'Types', link: '/api/v2019C1/types' },
						{ text: 'Test Helpers', link: '/api/v2019C1/test-helpers' },
					],
				},
				{
					text: 'Extensions',
					items: [
						{ text: 'Overview', link: '/api/v2019C1/extensions/' },
						{ text: 'History', link: '/api/v2019C1/extensions/history' },
						{ text: 'Data Model', link: '/api/v2019C1/extensions/data-model' },
						{ text: 'Template', link: '/api/v2019C1/extensions/template' },
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
