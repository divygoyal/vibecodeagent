import tourImages from '../home/tourImages.json';

export type ShotKey = 'site' | 'fixes' | 'traffic' | 'dashboards';

type Pair = { x1: string; x2: string };
type Form = { width: number; height: number; light: Pair; dark: Pair };
const IMAGES = tourImages as Record<ShotKey, { desktop: Form; mobile: Form }>;

/**
 * A real product crop from the home tour (demo data), light and dark, desktop and phone, as a plain <img> pair with a
 * 1x/2x srcset (same files and sizes as the home page). The first one on a page is eager, the rest lazy.
 */
function Img({ pair, form, alt, sizes, className, eager }: { pair: Pair; form: Form; alt: string; sizes: string; className: string; eager?: boolean }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized 1x/2x WebP pair; next/image would re-encode it softer
        <img
            src={pair.x1}
            srcSet={`${pair.x1} ${form.width}w, ${pair.x2} ${form.width * 2}w`}
            sizes={sizes}
            width={form.width}
            height={form.height}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding={eager ? 'sync' : 'async'}
            className={className}
        />
    );
}

export function ProductShot({ name, alt, eager = false, caption }: { name: ShotKey; alt: string; eager?: boolean; caption?: string }) {
    const { desktop, mobile } = IMAGES[name];
    const dSizes = `(min-width: 1064px) ${desktop.width}px, 92vw`;
    const mSizes = `(max-width: 432px) 92vw, ${mobile.width}px`;
    return (
        <figure className="min-w-0">
            <div className="hidden overflow-hidden rounded-panel border border-border-subtle bg-subtle shadow-[0_20px_48px_-28px_rgb(0_0_0/0.28)] md:block dark:shadow-none">
                <Img pair={desktop.light} form={desktop} alt={alt} sizes={dSizes} className="block h-auto w-full dark:hidden" eager={eager} />
                <Img pair={desktop.dark} form={desktop} alt={alt} sizes={dSizes} className="hidden h-auto w-full dark:block" eager={eager} />
            </div>
            <div className="mx-auto max-w-[400px] overflow-hidden rounded-card border border-border-subtle bg-subtle md:hidden">
                <Img pair={mobile.light} form={mobile} alt={alt} sizes={mSizes} className="block h-auto w-full dark:hidden" eager={eager} />
                <Img pair={mobile.dark} form={mobile} alt={alt} sizes={mSizes} className="hidden h-auto w-full dark:block" eager={eager} />
            </div>
            {caption ? <figcaption className="mt-3 text-center text-meta text-fg-muted">{caption}</figcaption> : null}
        </figure>
    );
}
