import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
	srcDir: 'doc',
	base: '/scl/',

	title: 'SCL Dialecte',
	description: 'IEC 61850, fully typed',
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		logo: '/logo.svg',

		search: {
			provider: 'local',
		},

		head: [['link', { rel: 'icon', href: '/logo.svg' }]],

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
					items: [{ text: 'Overview', link: '/api/v2019C1/extensions' }],
				},
			],
		},

		socialLinks: [{ icon: 'github', link: 'https://github.com/dialecte/scl' }],
	},
})
