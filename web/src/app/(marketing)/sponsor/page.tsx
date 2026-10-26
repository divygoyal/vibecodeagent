import { permanentRedirect } from 'next/navigation';

/** The sponsor index moved to /leaderboard/advertise (DESIGN 4.4). */
export default function SponsorRedirect() {
    permanentRedirect('/leaderboard/advertise');
}
