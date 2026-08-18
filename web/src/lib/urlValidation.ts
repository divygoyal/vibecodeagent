/**
 * SSRF protection: block internal/private IPs and metadata endpoints.
 * Shared across all API routes that fetch user-provided URLs.
 */
export function isBlockedUrl(urlStr: string): boolean {
    try {
        const parsed = new URL(urlStr);
        const hostname = parsed.hostname.toLowerCase();

        // Block common internal hostnames
        if (['localhost', '0.0.0.0', 'admin-api', 'web', 'nginx', 'watchdog'].includes(hostname)) return true;

        // Block metadata endpoints (AWS, GCP, Azure)
        if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return true;

        // Block private IP ranges
        const parts = hostname.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p))) {
            if (parts[0] === 10) return true;                                          // 10.0.0.0/8
            if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;    // 172.16.0.0/12
            if (parts[0] === 192 && parts[1] === 168) return true;                     // 192.168.0.0/16
            if (parts[0] === 127) return true;                                          // 127.0.0.0/8
            if (parts[0] === 0) return true;                                            // 0.0.0.0/8
            if (parts[0] === 169 && parts[1] === 254) return true;                     // link-local
        }

        // Block IPv6 loopback
        if (hostname === '::1' || hostname === '[::1]') return true;

        // Block non-http(s) schemes
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;

        return false;
    } catch {
        return true;
    }
}
