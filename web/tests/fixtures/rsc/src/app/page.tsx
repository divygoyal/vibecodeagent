// Fixture for tests/check-rsc-props.test.mjs: each line tagged in a comment below must be reported.
import { ClientIcon, ClientList, ServerIcon } from '../components';

class Money {
    constructor(public cents: number) {}
}

export default function Page() {
    const fmt = (v: number) => String(v);
    function log() {}
    return (
        <main>
            <ClientList format={(v: number) => String(v)} /> {/* ERROR inline */}
            <ClientList format={fmt} /> {/* ERROR identifier */}
            <ClientList icon={ServerIcon} /> {/* ERROR component function */}
            <ClientList onPick={log.bind(null)} /> {/* ERROR bind */}
            <ClientList url={new URL('https://example.com')} /> {/* ERROR URL */}
            <ClientList price={new Money(5)} /> {/* ERROR class */}
            <ClientList rows={[{ key: 'a', render: () => 1 }]} /> {/* ERROR nested */}
            <ClientList icon={ClientIcon} />
            <ClientList icon={<ServerIcon />} />
            <ClientList rows={[{ key: 'a', label: 'A' }]} />
            <ClientList when={new Date(0)} />
            <button type="button" onClick={() => {}}>x</button> {/* ERROR host */}
        </main>
    );
}
