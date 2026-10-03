// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const Config: {
    new (app: AppFacade): {
        app: AppFacade;
        settings: any;
        /**
         * Makes an authoritative external write of the layouts setting invalidate the
         * App's deferred split writes (see Split.invalidate).
         *
         * Two surfaces, because neither alone is sufficient: the framework reports a
         * RELOADED setting only when its value differs (changed::layouts, emitted by
         * _checkSettings), and the settings dialog rewrites the whole file BEFORE its
         * asynchronous notification — so an import that restores the value already in
         * memory, and a flush landing inside the write/notify gap, are invisible to it.
         * The settings FILE has no such blind spot: the dialog rewrites it in both
         * cases, and a Gio.FileMonitor sees the write.
         *
         * Authorship: only a signal from a writer other than this App may invalidate.
         * Every own write this extension makes goes through setValue or setOptions —
         * both rewrite the settings file (settings.js _saveToFile) — and both cancel
         * the monitor for the synchronous write and rebuild it afterwards (the
         * settings dialog's own pause/resume technique, made strict by cancelling:
         * disconnecting alone would still deliver the own write's queued event on the
         * next main-loop turn). The bound properties are read-only in greenTile
         * (nothing assigns them), so those two are the complete set of own writers.
         * A destructive side effect is impossible in the other direction too: the
         * monitor holds no state that a failed own write could poison.
         *
         * Cost of the file surface: every event invalidates, and the observer cannot
         * tell WHICH key the writer touched (the event carries no key, and a dialog
         * write rewrites the whole file on any widget change). A pending resize is
         * therefore also dropped when the dialog writes an unrelated setting — the
         * safe direction, since under-invalidating corrupts the external value.
         */
        _initSettingsObserver(): void;
        _settingsMonitor: any;
        _settingsMonitorPath: any;
        _settingsObserverFailed: boolean | undefined;
        _settingsObserverStopped: boolean | undefined;
        /**
         * Runs an own settings write with the file monitor cancelled, so the write is
         * never mistaken for an external one.
         * @param {() => any} write
         * @returns {any}
         */
        _settingsOwnWrite(write: () => any): any;
        /** Cancels the file monitor: nothing observed until _resumeSettingsMonitor. */
        _pauseSettingsMonitor(): void;
        /** (Re)arms the file monitor on the settings file. */
        _resumeSettingsMonitor(): void;
        registerHotkeys(): void;
        unregisterHotkeys(): void;
        destroy(): void;
    };
};
