/**
 * One dashboard save at a time (round 7 audit #12). The editor autosaves 800 ms after the last change; when a PUT took
 * longer than that, the next one started with the revision the first had not returned yet, the server answered 412
 * and the editor showed "Changed elsewhere" with no other editor open. Here a save that is asked for while one is
 * running waits for it, then sends the newest doc with the revision that save returned. No React: tested in
 * tests/editorAutosave.test.mjs.
 */

export interface AutosaveState<Doc> {
    id: string | null;
    doc: Doc | null;
    rev: number;
    /** The doc the server has (skip a save when nothing changed since). */
    savedDoc: Doc | null;
}

export interface AutosaveDeps<Doc> {
    /** The editor's current state, read at the moment each PUT starts. */
    get: () => AutosaveState<Doc>;
    /** PUT with If-Match: rev. Resolves to the new revision; rejects with an error that has `status` (412 = conflict). */
    put: (id: string, doc: Doc, rev: number) => Promise<number>;
    /** The server's current revision (Overwrite after a real conflict). */
    latestRev: (id: string) => Promise<number>;
    setSaving: () => void;
    markSaved: (rev: number, doc: Doc) => void;
    conflict: () => void;
    failed: (e: unknown) => void;
}

/** `save(force?)`: resolves when this save and any that queued behind it are done. */
export function createAutosave<Doc>(deps: AutosaveDeps<Doc>): (force?: boolean) => Promise<void> {
    let running: Promise<void> | null = null;
    let again = false;
    let forceNext = false;

    const run = async () => {
        do {
            again = false;
            const force = forceNext;
            forceNext = false;
            const st = deps.get();
            if (!st.doc || !st.id) return;
            const doc = st.doc;
            // Nothing new since the last save (a queued save after the one that already sent this doc).
            if (!force && doc === st.savedDoc) continue;
            let rev = st.rev;
            try {
                if (force) rev = await deps.latestRev(st.id);
                deps.setSaving();
                const next = await deps.put(st.id, doc, rev);
                deps.markSaved(next, doc);
            } catch (e) {
                // A queued save would only repeat the failure (or overwrite the other editor): stop here.
                again = false;
                if ((e as { status?: number } | null)?.status === 412) deps.conflict();
                else deps.failed(e);
                return;
            }
        } while (again);
    };

    return (force?: boolean) => {
        if (force) forceNext = true;
        if (running) {
            again = true;
            return running;
        }
        running = run().finally(() => { running = null; });
        return running;
    };
}
