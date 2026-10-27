'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CreditCard, LogOut, Monitor, Moon, MoreHorizontal, Sun, User } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { Avatar } from '@/components/ui/Avatar';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { signOutAndClear } from './signOut';
import { DEMO_EXIT_HREF, useDemoSession } from '@/components/demo/useDemoSession';

type SessionUser = { id?: string; name?: string | null; email?: string | null; image?: string | null };

/** Avatar, name, email and a menu with Account, Appearance (Light/Dark/System), Plan and Sign out. */
export function UserMenu({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
    const { data: session } = useSession();
    const user = session?.user as SessionUser | undefined;
    const [theme, setTheme] = useThemePreference();
    const router = useRouter();
    const { demo } = useDemoSession();
    if (!user) return null;
    const go = (href: string) => {
        onNavigate?.();
        router.push(href);
    };

    const menu = (
        <DropdownMenuContent align={collapsed ? 'start' : 'end'} side={collapsed ? 'right' : 'top'} className="w-60">
            <DropdownMenuLabel className="normal-case tracking-normal">
                <span className="block truncate text-body-sm font-medium text-fg">{user.name}</span>
                <span className="block truncate text-meta text-fg-muted">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={User} onSelect={() => go('/dashboard/settings')}>Account</DropdownMenuItem>
            <DropdownMenuSub>
                <DropdownMenuSubTrigger icon={theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun}>Appearance</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
                        <DropdownMenuRadioItem value="light" icon={Sun}>Light</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark" icon={Moon}>Dark</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="system" icon={Monitor}>System</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
            </DropdownMenuSub>
            {demo ? null : <DropdownMenuItem icon={CreditCard} onSelect={() => go('/dashboard/plan')}>Plan</DropdownMenuItem>}
            <DropdownMenuSeparator />
            {/* The demo has no account to sign out of: leave it (the visitor's own session stays as it was). */}
            {demo
                ? <DropdownMenuItem icon={LogOut} onSelect={() => { window.location.href = DEMO_EXIT_HREF; }}>Exit demo</DropdownMenuItem>
                : <DropdownMenuItem icon={LogOut} onSelect={() => signOutAndClear(user)}>Sign out</DropdownMenuItem>}
        </DropdownMenuContent>
    );

    if (collapsed) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Account menu for ${user.name ?? 'you'}`} className="mx-auto flex size-10 items-center justify-center rounded-control hover:bg-subtle">
                        <Avatar name={user.name} src={user.image} size={28} />
                    </button>
                </DropdownMenuTrigger>
                {menu}
            </DropdownMenu>
        );
    }

    return (
        <div className="flex items-center gap-2.5 rounded-control px-2 py-1.5">
            <Avatar name={user.name} src={user.image} size={28} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-fg">{user.name}</p>
                <p className="truncate text-meta text-fg-muted">{user.email}</p>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="Account menu"
                        className={cn('flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-subtle hover:text-fg pointer-coarse:size-11')}
                    >
                        <MoreHorizontal aria-hidden size={16} />
                    </button>
                </DropdownMenuTrigger>
                {menu}
            </DropdownMenu>
        </div>
    );
}
