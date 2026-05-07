const ANALYTICS_EMBED_URL =
    'https://trafficclaw.com/share/7f0a375631663e7fd964ab6ff940c16a?embed=true';

export const MARKETING_SIGN_IN_URL = '/api/auth/signin/google?callbackUrl=%2Fdashboard';

export const HOMEPAGE_CONTENT = {
    hero: {
        title: 'Ditch your Google Analytics',
        primaryCta: 'Start with Google',
        secondaryCta: 'Open live dashboard',
    },
    analyticsEmbedUrl: ANALYTICS_EMBED_URL,
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
        title: 'Just ask. Your traffic data will answer.',
        description:
            "Stop hunting through reports and dashboards. Ask plain-English questions and instantly know what's happening with your traffic — and what to do about it.",
        videoSrc: '/home/ai-chat-final.mp4',
        posterSrc: '/home/ai-chat-demo-poster.jpg',
        frameLabel: 'trafficclaw.com/dashboard/ai-chat',
        frameMeta: 'Reason 1',
        highlights: [
            {
                title: 'Ask anything',
                text: 'Traffic, pages, sources, sessions — in plain English.',
            },
            {
                title: 'Instant answers',
                text: 'No dashboards, exports, or SQL needed.',
            },
            {
                title: 'Clear next steps',
                text: 'Know what happened and what to fix.',
            },
        ],
    },
    globe: {
        number: '02',
        eyebrow: 'Realtime globe',
        title: 'Live interactive globe',
        description:
            'A rotating 3D globe that maps every active visitor in real time. Embed it on your landing page, share it with clients, or run it live on a big screen during your launch.',
        videoSrc: '/home/globe-demo.mp4',
        videoClassName: 'scale-[1.25]',
        frameLabel: 'trafficclaw.com/globe/live',
        frameMeta: 'Reason 2',
        demoHref:
            'https://trafficclaw.com/embed/513732772?token=a220a20c719ad0fb1c5f58e735eb7e48624aa8362005096514c4881155473a45',
        ctaLabel: 'View live demo',
        highlights: [
            {
                title: 'Cinematic quality',
                text: 'Looks premium, works out of the box.',
            },
            {
                title: 'Embeddable anywhere',
                text: 'Landing pages, decks, client portals.',
            },
            {
                title: 'Live, not static',
                text: 'Visitors appear the moment they land.',
            },
        ],
    },
    compactReasons: [
        {
            number: '03',
            kind: 'mention',
            icon: 'x',
            eyebrow: 'X mention embeds',
            title: 'Boost conversions with live, real-time X mentions',
            description:
                'Instantly turn your best X mentions into convincing social proof.',
            imageSrc: '/home/twittor2new.png',
            previewLabel: 'AUTO-UPDATING FEED',
            previewValue: 'SHOWING 4 OF 3',
            chips: ['No-code embed'],
            buttonLabel: 'See your X mentions',
            buttonTheme: 'green',
            href: '/x',
        },
        {
            number: '04',
            kind: 'mention',
            icon: 'reddit',
            eyebrow: 'Reddit mention embeds',
            title: 'Track all your real-time Reddit mentions',
            description:
                'Show real customer conversations and turn community buzz into trust signals.',
            imageSrc: '/home/redditpost2new.png',
            previewLabel: 'CURATED, LIVE BUZZ',
            previewValue: '22D AGO',
            chips: ['No-code embed'],
            buttonLabel: 'See your Reddit mentions',
            buttonTheme: 'orange',
            href: '/reddit',
        },
        {
            number: '05',
            kind: 'seo',
            eyebrow: 'Autonomous AI Agent',
            title: 'Meet your dedicated SEO Bot.',
            description:
                'Imagine having an SEO expert constantly analyzing your site. Our AI bot runs auto keyword research, builds smart internal links, and detects content decay before traffic drops.',
            previewLabel: 'SEO Bot Active',
            previewValue: 'ANALYZING SITE HEALTH...',
            chips: ['Keyword discovery', 'Link building', 'Decay alerts'],
            href: '/features/seo-bot',
            ctaLabel: 'Activate SEO Bot',
            features: [
                {
                    label: 'AI Blog Writer',
                    description: 'Generate SEO-optimized blog posts with headings, meta tags, and schema markup.',
                    actionText: 'Click to use',
                    actionColor: 'text-[#8EE68E]',
                    iconColor: 'text-[#8EE68E]',
                    iconBg: 'bg-[#8EE68E]/10 border-[#8EE68E]/20',
                    iconType: 'pen'
                },
                {
                    label: 'Auto Keyword Research',
                    description: 'AI finds untapped keyword opportunities by analyzing competitors and search trends.',
                    actionText: 'Click to use',
                    actionColor: 'text-[#FFD700]',
                    iconColor: 'text-[#FFD700]',
                    iconBg: 'bg-[#FFD700]/10 border-[#FFD700]/20',
                    iconType: 'brain'
                },
                {
                    label: 'AI Smart Linking',
                    description: 'Discover and suggest internal links between your pages to build topical authority.',
                    actionText: 'Click to use',
                    actionColor: 'text-[#14C4E1]',
                    iconColor: 'text-[#14C4E1]',
                    iconBg: 'bg-[#14C4E1]/10 border-[#14C4E1]/20',
                    iconType: 'link'
                },
                {
                    label: 'Content Decay Detector',
                    description: 'Monitors your top-performing pages and alerts when traffic declines to refresh content.',
                    actionText: '2 pages decaying',
                    actionColor: 'text-[#FF6B6B]',
                    iconColor: 'text-[#FF6B6B]',
                    iconBg: 'bg-[#FF6B6B]/10 border-[#FF6B6B]/20',
                    iconType: 'activity'
                },
                {
                    label: 'Cannibalization Scanner',
                    description: 'Detects when multiple pages compete for the same keywords, splitting ranking power.',
                    actionText: 'Get Analysis',
                    actionColor: 'text-[#8EE68E]',
                    iconColor: 'text-[#FFBD2E]',
                    iconBg: 'bg-[#FFBD2E]/10 border-[#FFBD2E]/20',
                    iconType: 'layers'
                },
                {
                    label: 'Core Web Vitals',
                    description: 'Check LCP, FID, CLS for any page to ensure search engines love your technical performance.',
                    actionText: 'Open Audit Tool',
                    actionColor: 'text-[#14C4E1]',
                    iconColor: 'text-[#14C4E1]',
                    iconBg: 'bg-[#14C4E1]/10 border-[#14C4E1]/20',
                    iconType: 'cpu'
                }
            ]
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
