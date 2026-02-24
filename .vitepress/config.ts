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
					text: 'Core',
					items: [{ text: 'See on dialecte', link: 'https://dialecte.github.io/core/api' }],
				},
				{
					text: 'Extensions',
					items: [
						{ text: 'Overview', link: '/api/v2019C1/extensions' },
						{ text: 'DataTypeTemplates', link: '/api/v2019C1/extensions/data-type-templates' },
						{ text: 'Function', link: '/api/v2019C1/extensions/function' },
						{ text: 'History', link: '/api/v2019C1/extensions/history' },
						{ text: 'SCL', link: '/api/v2019C1/extensions/scl' },
						{ text: 'SubFunction', link: '/api/v2019C1/extensions/sub-function' },
					],
				},
			],
		},

		socialLinks: [{ icon: 'github', link: 'https://github.com/dialecte/scl' }],
	},
})
