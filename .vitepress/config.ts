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
			{
				text: 'v2019C1',
				items: [
					{ text: 'Overview', link: '/v2019C1/' },
					{ text: 'API', link: '/v2019C1/api/types' },
					{ text: 'IO', link: '/v2019C1/io/' },
					{ text: 'Extensions', link: '/v2019C1/extensions/' },
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
						{ text: 'Template', link: '/v2019C1/extensions/template' },
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
