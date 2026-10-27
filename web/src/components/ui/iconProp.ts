import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** An icon prop: a component from client code, or an element (`<ArrowRight />`) from a Server Component. */
export type IconProp = LucideIcon | ReactElement;

const FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const MEMO_TYPE = Symbol.for('react.memo');

/**
 * True for a component (lucide icons are forwardRef objects), false for
 * something already rendered. An element passed by a Server Component can
 * arrive as a lazy node (RSC sends `"$L<id>"` when that row is not ready yet)
 * rather than an element, so "not an element" does not mean "a component":
 * rendering that lazy node as `<Icon />` fails with "Lazy element type must
 * resolve to a class or function" (QA-01).
 */
export function isIconComponent(icon: IconProp): icon is LucideIcon {
    if (typeof icon === 'function') return true;
    const kind = (icon as { $$typeof?: symbol } | null)?.$$typeof;
    return kind === FORWARD_REF_TYPE || kind === MEMO_TYPE;
}
