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
    constructor(
        public code: ToolErrorCode,
        message: string,
        public hint?: string,
        public retryAfterS?: number,
    ) {
        super(message);
        this.name = 'ToolError';
    }
}
