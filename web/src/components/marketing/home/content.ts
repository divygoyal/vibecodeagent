const ANALYTICS_EMBED_URL =
    'https://trafficclaw.com/share/486f673c661417f6f38faf83add644ad?embed=true';

const ANALYTICS_DISPLAY_URL = 'trafficclaw.com/share/486f673c661417f6f38faf83add644ad';

export const MARKETING_SIGN_IN_URL = '/api/auth/signin/google?callbackUrl=%2Fdashboard';

export const HOMEPAGE_CONTENT = {
    hero: {
        title: 'Ditch your Google Analytics',
        primaryCta: 'Start free',
        secondaryCta: 'Open live dashboard',
    },
    analyticsEmbedUrl: ANALYTICS_EMBED_URL,
    analyticsDisplayUrl: ANALYTICS_DISPLAY_URL,
    reasonsIntro: {
        eyebrow: '5+1 reasons',
        title: 'Why TrafficClaw is the best Google Analytics alternative?',
        description: 'Here are 5+1 simple reasons that sum it up.',
        supportingCopy:
            'TrafficClaw turns analytics into something you can talk to, share, embed, and actually enjoy showing people.',
        checkpoints: [
            '01 AI traffic chat',
            '02 Realtime globe',
            '03 Shareable dashboard',
            '04 X mention embeds',
            '05 Reddit mention embeds',
            '+1 Switching proof',
        ],
    },
    aiChat: {
        number: '01',
        eyebrow: 'AI traffic chat',
        title: 'Talk to your traffic instead of hunting through reports.',
        description:
            'Ask why traffic dropped, what pages are growing, what changed this week, and what to ship next. TrafficClaw translates raw analytics into decisions in plain English.',
        videoSrc: '/home/ai-chat-demo.mp4',
        posterSrc: '/home/ai-chat-demo-poster.jpg',
        frameLabel: 'trafficclaw.com/dashboard/ai-chat',
        frameMeta: 'Reason 1',
        highlights: [
            'Ask plain-English questions about traffic, pages, winners, losses, and next steps.',
            'Get immediate explanations instead of clicking through tabs, filters, and date ranges.',
            'Turn analytics into actions your whole team can understand and ship against.',
        ],
    },
    globe: {
        number: '02',
        eyebrow: 'Realtime globe',
        title: 'Turn live traffic into a product demo people actually want to watch.',
        description:
            'Show active visitors moving across the world, share a premium live-demo link, and make your traffic feel alive instead of buried in a static dashboard.',
        videoSrc: '/home/globe-demo.mp4',
        frameLabel: 'trafficclaw.com/globe/live',
        frameMeta: 'Reason 2',
        demoHref:
            'https://trafficclaw.com/embed/513732772?token=a220a20c719ad0fb1c5f58e735eb7e48624aa8362005096514c4881155473a45',
        ctaLabel: 'View live demo',
        highlights: [
            'Cinematic realtime traffic visualisation that feels like a premium product surface.',
            'Perfect for public landing pages, client views, launches, and live revenue moments.',
            'A stronger live demo than another screenshot, export, or analytics paragraph.',
        ],
    },
    compactReasons: [
        {
            number: '03',
            kind: 'dashboard',
            eyebrow: 'Shareable dashboards',
            title: 'Send one clean live link instead of another export.',
            description:
                'Open a live dashboard for teammates, clients, or prospects without making them learn Google Analytics first.',
            previewLabel: 'Live share URL',
            previewValue: ANALYTICS_DISPLAY_URL,
            chips: ['Shareable link', 'Embeddable', 'Client-friendly'],
            href: ANALYTICS_EMBED_URL,
            ctaLabel: 'Open live dashboard',
        },
        {
            number: '04',
            kind: 'mention',
            eyebrow: 'X mention embeds',
            title: 'Turn social proof into a website section in minutes.',
            description:
                'Monitor fresh X mentions, curate the good ones, and publish them with a direct iframe URL that is ready for your site.',
            imageSrc: '/home/x-mentions.png',
            previewLabel: 'Direct iframe URL',
            previewValue: '<iframe src="https://trafficclaw.com/embed/x/mentions" />',
            chips: ['Live mention monitoring', 'Embeddable widget'],
        },
        {
            number: '05',
            kind: 'mention',
            eyebrow: 'Reddit mention embeds',
            title: 'Pull community discussion straight into your product story.',
            description:
                'Track fresh Reddit threads about your brand and expose them as a clean website-ready frame your team can drop in anywhere.',
            imageSrc: '/home/reddit-mentions.png',
            previewLabel: 'Embeddable thread feed',
            previewValue: '<iframe src="https://trafficclaw.com/embed/reddit/mentions" />',
            chips: ['Community signal', 'Direct frame URL'],
        },
    ],
    proof: {
        number: '+1',
        eyebrow: 'Switching proof',
        title: 'One extra reason: the product makes growth easier to see.',
        description:
            'Real products saw traffic move after switching, and more importantly, they could explain those changes without spending the day inside GA.',
    },
    proofCards: [
        {
            site: 'antigravity.codes',
            metric: '+110.8% sessions',
            imageSrc: '/home/proof-antigravity.png',
            caption:
                'Sessions climbed to 54k while active users crossed 39k. TrafficClaw makes those growth moves legible the moment they happen.',
        },
        {
            site: 'nailart.app',
            metric: '+124.2% active users',
            imageSrc: '/home/proof-nailart.png',
            caption:
                'Active users hit 17k while views moved to 56k. This is the kind of lift that deserves a clearer analytics layer.',
        },
    ],
    cta: {
        title: 'Ditch the tabs. Talk to your traffic instead.',
        description:
            'Start with one shareable dashboard, one AI chat that understands your traffic, and one product surface that makes your growth feel alive.',
    },
} as const;

export type HomepageCompactReason = (typeof HOMEPAGE_CONTENT.compactReasons)[number];
export type HomepageProofCard = (typeof HOMEPAGE_CONTENT.proofCards)[number];
