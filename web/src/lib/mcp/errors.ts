/** Model-friendly tool errors (MCP.md 7.1 "Error codes"). */
export type ToolErrorCode =
    | 'invalid_argument'
    | 'site_not_found'
    | 'site_not_in_grant'
    | 'ga4_not_connected'
    | 'gsc_not_connected'
    | 'google_reauth_required'
    | 'date_out_of_range'
    | 'quota_exhausted'
    | 'rate_limited'
    | 'upstream_error'
    | 'timeout'
    | 'demo_unsupported'
    | 'queries_excluded';

export class ToolError extends Error {
    code: ToolErrorCode;
    hint?: string;
    retryAfterS?: number;

    constructor(code: ToolErrorCode, message: string, hint?: string, retryAfterS?: number) {
        super(message);
        this.name = 'ToolError';
        this.code = code;
        this.hint = hint;
        this.retryAfterS = retryAfterS;
    }
}
