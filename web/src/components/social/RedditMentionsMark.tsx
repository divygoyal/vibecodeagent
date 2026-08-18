type RedditMarkProps = {
    className?: string;
};

export function RedditMark({ className = '' }: RedditMarkProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="currentColor"
        >
            <path d="M14.43 15.72c.13-.13.3-.2.47-.2.18 0 .35.07.47.2.13.12.2.3.2.47 0 .18-.07.35-.2.47-.25.26-.69.26-.94 0a.66.66 0 0 1 0-.94Zm-5.8 0c.13-.13.3-.2.47-.2.18 0 .35.07.47.2.26.26.26.68 0 .94-.24.26-.69.26-.94 0a.66.66 0 0 1 0-.94Zm8.8-9.3c-.88 0-1.67.37-2.24.95-1-.48-2.13-.76-3.29-.76-1.15 0-2.27.27-3.26.75a3.17 3.17 0 0 0-2.26-.94A3.2 3.2 0 0 0 3.2 9.6c0 .9.38 1.72 1 2.29-.03.23-.05.46-.05.7 0 3.17 3.38 5.75 7.55 5.75 4.16 0 7.55-2.58 7.55-5.75 0-.23-.02-.46-.05-.69a3.17 3.17 0 0 0 1-2.3 3.2 3.2 0 0 0-3.17-3.18Zm-5.73-1.2 1-4.72 3.28.69a2.2 2.2 0 0 0 2.1 1.56A2.2 2.2 0 0 0 20.28.55a2.2 2.2 0 0 0-2.2 2.2c0 .17.02.34.06.5l-3.8-.8a.67.67 0 0 0-.8.52l-1.07 5.08c-.26-.02-.52-.04-.78-.04-.26 0-.52.01-.78.04Zm7.38 7.05c0 2.43-2.8 4.41-6.25 4.41-3.44 0-6.24-1.98-6.24-4.4 0-2.43 2.8-4.41 6.24-4.41 3.45 0 6.25 1.98 6.25 4.4Zm-3.55 1.6c.1.1.16.23.16.37a.5.5 0 0 1-.16.37c-.7.67-1.97 1.1-3.4 1.1s-2.7-.43-3.4-1.1a.5.5 0 0 1 .7-.72c.5.48 1.48.82 2.7.82 1.22 0 2.2-.34 2.7-.82a.5.5 0 0 1 .7 0Z" />
        </svg>
    );
}

type RedditMentionsLockupProps = {
    className?: string;
    iconClassName?: string;
    textClassName?: string;
};

export function RedditMentionsLockup({
    className = '',
    iconClassName = 'h-5 w-5 text-orange-400',
    textClassName = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-white',
}: RedditMentionsLockupProps) {
    return (
        <div className={`inline-flex items-center gap-3 ${className}`.trim()}>
            <RedditMark className={iconClassName} />
            <span className={textClassName}>Mentions</span>
        </div>
    );
}

export default RedditMentionsLockup;
