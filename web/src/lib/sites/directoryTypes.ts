/** Wire types of GET /api/sites/directory (the server half is lib/sites/directoryServer.ts). Safe to import from client code. */

export interface DirectoryError {
    /** A short code from lib/googleErrors (google_reauth, google_timeout, ...). */
    code: string;
    message: string;
}

export interface DirectorySite {
    siteUrl: string;
    permissionLevel?: string;
}

export interface DirectoryProperty {
    property: string;
    displayName: string;
    parent?: string;
    /** Web stream host the portfolio stored for this property ('acme.com'), when known: ranks link suggestions. */
    host?: string;
}

export interface DirectoryPayload {
    source: 'live' | 'store';
    /** False when the account has no Google tokens at all (GitHub-only sign-in). */
    connected: boolean;
    sites: DirectorySite[];
    properties: DirectoryProperty[];
    /** GA4 property -> GSC site URL (or null for GA4-only), as the portfolio stored it. */
    pairs: Record<string, string | null>;
    /** Set for a list Google could not return; the other list is still there. */
    errors: { sites?: DirectoryError; properties?: DirectoryError };
}
