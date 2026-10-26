/**
 * styles/legacy.css forces min 44px on every button, [role=switch] and similar
 * below 640px, which deforms Radix switches, radios and checkboxes. Undo it
 * for those controls inside Connect AI screens until the legacy rule is scoped.
 */
export const RADIX_TOUCH_FIX = '[&_[role=switch]]:min-h-0! [&_[role=switch]]:min-w-0! [&_[role=radio]]:min-h-0! [&_[role=radio]]:min-w-0! [&_[role=checkbox]]:min-h-0! [&_[role=checkbox]]:min-w-0!';
