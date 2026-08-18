/**
 * Chat eval runner.
 *
 * Usage:
 *   npm run eval:chat                       # run all scenarios
 *   npm run eval:chat -- --id=money-pits    # run one scenario by id
 *   npm run eval:chat -- --list             # list scenarios without running
 *
 * Requires:
 *   GOOGLE_VERTEX_API_KEY or GEMINI_API_KEY # for the judge
 *   EVAL_CHAT_BASE_URL=http://localhost:3000  # default; override if dev server is elsewhere
 *   EVAL_CHAT_SESSION_COOKIE=<full cookie>   # a real NextAuth session cookie value. Sign in via
 *                                             browser, copy the `__Secure-next-auth.session-token`
 *                                             (or non-Secure variant in dev) cookie, and paste here.
 *
 * What it does:
 *   1. For each scenario, POSTs the userMessage to /api/ai-chat with the session cookie.
 *   2. Reads the SSE stream and concatenates all 'text' events into the assistant's answer.
 *   3. Passes (scenario, answer) to the Gemini-as-judge in judge.ts.
 *   4. Prints a pass/fail table and exits non-zero if any scenario fails.
 *
 * Limitations (acceptable for v1):
 *   - Runs against the live chat endpoint; doesn't stub tools (real GSC/GA4 data must be present
 *     for the session-cookie user). Tradeoff: full integration coverage but requires a real workspace.
 *   - No automated fixture injection. Scenarios that depend on a specific snapshot state (e.g., the
 *     audience-mismatch case requires USER_FACTS.industry to be set) need the user to prepare the
 *     test account ahead of time.
 *   - Run sequentially to avoid quota pressure; total runtime is ~5-10 minutes for 20 scenarios.
 */
import { selectScenarios, type EvalScenario } from './scenarios';
import { judgeAnswer, type JudgeResult } from './judge';

interface CliArgs {
    ids?: string[];
    list?: boolean;
    baseUrl: string;
    cookie: string;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = {
        baseUrl: process.env.EVAL_CHAT_BASE_URL || 'http://localhost:3000',
        cookie: process.env.EVAL_CHAT_SESSION_COOKIE || '',
    };
    for (const a of argv) {
        if (a === '--list') args.list = true;
        else if (a.startsWith('--id=')) args.ids = a.slice(5).split(',').map(s => s.trim()).filter(Boolean);
    }
    return args;
}

async function runOne(scenario: EvalScenario, args: CliArgs): Promise<{ answer: string; durationMs: number }> {
    const started = Date.now();
    const res = await fetch(`${args.baseUrl}/api/ai-chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': args.cookie,
        },
        body: JSON.stringify({
            message: scenario.userMessage,
            history: [],
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`chat endpoint ${res.status}: ${body.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('chat endpoint returned no body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const ev of events) {
            const trimmed = ev.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
                const data = JSON.parse(payload);
                if (data.type === 'text' && typeof data.content === 'string') {
                    answer += data.content;
                }
            } catch { /* ignore */ }
        }
    }
    return { answer, durationMs: Date.now() - started };
}

function printVerdictLine(label: string, verdict: 'pass' | 'fail' | 'uncertain'): string {
    const tag = verdict === 'pass' ? '[PASS]' : verdict === 'fail' ? '[FAIL]' : '[????]';
    return `  ${tag} ${label}`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const scenarios = selectScenarios(args.ids);

    if (args.list) {
        for (const s of scenarios) {
            console.log(`${s.id.padEnd(40)} — ${s.motivation.slice(0, 70)}`);
        }
        process.exit(0);
    }

    if (!args.cookie) {
        console.error('Missing EVAL_CHAT_SESSION_COOKIE env var.');
        console.error('Sign in to the dev server in your browser, copy the next-auth session cookie value,');
        console.error('and set it in .env.local as EVAL_CHAT_SESSION_COOKIE=name=value (full Cookie header form).');
        process.exit(1);
    }

    console.log(`Running ${scenarios.length} scenarios against ${args.baseUrl}`);
    console.log('=' .repeat(80));

    let passed = 0;
    let failed = 0;
    const failures: Array<{ scenario: EvalScenario; verdict: JudgeResult }> = [];

    for (const scenario of scenarios) {
        const label = scenario.id.padEnd(40);
        process.stdout.write(`${label} ... `);
        try {
            const { answer, durationMs } = await runOne(scenario, args);
            const verdict = await judgeAnswer(scenario, answer);
            if (verdict.pass) {
                console.log(`PASS  (${durationMs}ms)`);
                passed++;
            } else {
                console.log(`FAIL  (${durationMs}ms) — ${verdict.notes.slice(0, 70)}`);
                failed++;
                failures.push({ scenario, verdict });
            }
        } catch (err) {
            console.log(`ERROR — ${err instanceof Error ? err.message : String(err)}`);
            failed++;
        }
    }

    console.log('=' .repeat(80));
    console.log(`\nSUMMARY: ${passed} passed, ${failed} failed of ${scenarios.length} total\n`);

    if (failures.length > 0) {
        console.log('FAILURE DETAILS:');
        for (const { scenario, verdict } of failures) {
            console.log(`\n${scenario.id}`);
            for (const v of verdict.must) {
                if (v.verdict !== 'pass') console.log(printVerdictLine(`MUST: ${v.item.slice(0, 80)}`, v.verdict) + ` — ${v.reason.slice(0, 120)}`);
            }
            for (const v of verdict.must_not) {
                if (v.verdict !== 'pass') console.log(printVerdictLine(`MUST_NOT: ${v.item.slice(0, 80)}`, v.verdict) + ` — ${v.reason.slice(0, 120)}`);
            }
        }
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
