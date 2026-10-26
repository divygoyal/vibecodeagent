/**
 * Next.js instrumentation hook. Runs once when the server starts.
 *
 * Demo data mode (local development only): with TC_DEMO_DATA=1 every Google
 * data request is answered by src/lib/demo instead of the network. See
 * scripts/dev/README.md. It refuses to run when NODE_ENV is 'production'.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    if (process.env.TC_DEMO_DATA !== '1') return;
    if (process.env.NODE_ENV === 'production') {
        console.warn('[demo-data] TC_DEMO_DATA=1 ignored: demo data is only allowed outside production.');
        return;
    }
    const { installDemoGoogleFetch } = await import('./lib/demo/fetchShim');
    installDemoGoogleFetch();
}
