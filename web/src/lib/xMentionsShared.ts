export type XMentionPayload = {
    id: string;
    text: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    verified: boolean;
    likes: number;
    retweets: number;
    replies: number;
    views: number;
    createdAt: string;
    media: { type: string; url: string }[];
    urls: string[];
    quotedTweet: {
        id: string;
        text: string;
        authorName: string;
        authorHandle: string;
    } | null;
};

export function canonicalizeDomainInput(input: string): string | null {
    const value = input.trim().toLowerCase();
    if (!value) return null;

    const withProtocol = value.includes('://') ? value : `https://${value}`;

    try {
        const url = new URL(withProtocol);
        let hostname = (url.hostname || '').trim().toLowerCase();
        if (hostname.startsWith('www.')) {
            hostname = hostname.slice(4);
        }

        if (!hostname || !hostname.includes('.')) {
            return null;
        }

        return hostname;
    } catch {
        return null;
    }
}
