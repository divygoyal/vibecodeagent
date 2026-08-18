type XMarkProps = {
    className?: string;
};

export function XMark({ className = '' }: XMarkProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="currentColor"
        >
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.637 7.584H.477l8.6-9.826L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.291 19.49h2.04L6.486 3.25H4.297L17.61 20.643Z" />
        </svg>
    );
}

type XMentionsLockupProps = {
    className?: string;
    iconClassName?: string;
    textClassName?: string;
};

export function XMentionsLockup({
    className = '',
    iconClassName = 'h-4 w-4',
    textClassName = 'text-[11px] font-semibold uppercase tracking-[0.22em]',
}: XMentionsLockupProps) {
    return (
        <div className={`inline-flex items-center gap-3 text-white ${className}`.trim()}>
            <XMark className={iconClassName} />
            <span className={textClassName}>Mentions</span>
        </div>
    );
}

export default XMentionsLockup;
