import { redirect } from 'next/navigation';

// Overview was removed — the dashboard root now lands on AI Chat,
// which is the primary surface for new users.
export default function DashboardRoot() {
  redirect('/dashboard/ai-chat');
}
