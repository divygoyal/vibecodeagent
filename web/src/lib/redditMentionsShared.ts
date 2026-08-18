export interface RedditMentionPayload {
    id: string;
    postId: string;
    title: string;
    text: string;
    author: string;
    subreddit: string;
    score: number;
    commentCount: number;
    createdAt: string;
    permalink: string;
    outboundUrl: string;
    externalUrl: string | null;
}
