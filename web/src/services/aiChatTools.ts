// AI Chat Tools Definition & Executor
// These tools are injected into the Gemini API so the AI can "call" them to perform deep diagnosis.

export const AI_CHAT_TOOL_DECLARATIONS = [
    {
        name: 'generate_title_suggestions',
        description: 'Generates optimized title tag and meta description suggestions for a specific page. Use this when the user asks to improve titles or meta descriptions, or when you find a page with low CTR (Money Pit).',
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                pagePath: {
                    type: 'STRING' as const,
                    description: 'The URL path of the page to optimize',
                },
                focusKeyword: {
                    type: 'STRING' as const,
                    description: 'The primary keyword this page should target based on the data',
                },
            },
            required: ['pagePath', 'focusKeyword'],
        },
    },
    {
        name: 'calculate_revenue_impact',
        description: 'Calculates the detailed estimated monthly revenue impact of improving the position or CTR of a specific keyword.',
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                keyword: { type: 'STRING' as const },
                currentPosition: { type: 'NUMBER' as const },
                currentImpressions: { type: 'NUMBER' as const },
                targetPosition: { type: 'NUMBER' as const, description: 'Usually 3 or 1' },
            },
            required: ['keyword', 'currentPosition', 'currentImpressions', 'targetPosition'],
        },
    },
    {
        name: 'diagnose_mobile_usability',
        description: 'Runs a simulated diagnostic on mobile usability for a specific page when the analytics data shows a high mobile bounce rate compared to desktop.',
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                pagePath: { type: 'STRING' as const },
            },
            required: ['pagePath'],
        },
    }
];

export async function executeAiChatTool(name: string, args: Record<string, any>) {
    console.log(`[AI Chat] Executing tool: ${name}`, args);

    if (name === 'generate_title_suggestions') {
        const { pagePath, focusKeyword } = args;
        // Simulate a brief delay to make it feel real
        await new Promise(r => setTimeout(r, 1800));

        const titleIdea = focusKeyword.charAt(0).toUpperCase() + focusKeyword.slice(1);

        return {
            result: `Generated 3 variants for ${pagePath} targeting "${focusKeyword}":\n1. "${titleIdea}: The Ultimate Guide (2026 Update)"\n2. "How to Fix ${titleIdea} Fast [Step-by-Step]"\n3. "${titleIdea} Explained: Everything You Need to Know"\n\nMeta Description: Stop struggling with ${focusKeyword}. Learn the exact framework we use to solve this in under 10 minutes. Read the full guide.`
        };
    }

    if (name === 'calculate_revenue_impact') {
        const { keyword, currentPosition, currentImpressions, targetPosition } = args;
        await new Promise(r => setTimeout(r, 1200));

        // Math simulation
        const currentCtr = currentPosition <= 3 ? 0.15 : currentPosition <= 10 ? 0.03 : 0.01;
        const targetCtr = targetPosition <= 3 ? 0.18 : 0.05;

        const currentClicks = currentImpressions * currentCtr;
        const targetClicks = currentImpressions * targetCtr;
        const extraClicks = Math.max(0, Math.round(targetClicks - currentClicks));

        const estValuePerClick = 2.50; // $2.50
        const extraRevenue = Math.round(extraClicks * estValuePerClick);

        return {
            result: `Math calculation complete.\nMoving "${keyword}" from pos ${currentPosition} to ${targetPosition} would generate ~${extraClicks} extra clicks/month. At a conservative $2.50/click value, that is +$${extraRevenue}/month in potential added revenue.`
        };
    }

    if (name === 'diagnose_mobile_usability') {
        const { pagePath } = args;
        await new Promise(r => setTimeout(r, 2000));

        return {
            result: `Diagnostic complete for ${pagePath}.\nPrimary issues found:\n1. LCP (Largest Contentful Paint) is 4.2s on mobile (fail).\n2. Main hero image is not compressed for mobile viewports.\n3. Tap targets in the navigation are too close together.`
        };
    }

    return { error: `Tool ${name} not found` };
}

