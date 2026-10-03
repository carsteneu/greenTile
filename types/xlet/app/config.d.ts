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
         * Every own write goes through setValue, which cancels the monitor for the
         * synchronous write and rebuilds it afterwards (the settings dialog's own
         * pause/resume technique, made strict by cancelling — disconnecting alone
         * would still deliver the own write's queued event on the next main-loop turn).
         * A destructive side effect is impossible in the other direction too: the
         * monitor holds no state that a failed own write could poison.
         */
        _initSettingsObserver(): void;
        _settingsMonitor: any;
        _settingsMonitorPath: any;
        _settingsObserverFailed: boolean | undefined;
        _settingsObserverStopped: boolean | undefined;
        /** Cancels the file monitor: nothing observed until _resumeSettingsMonitor. */
        _pauseSettingsMonitor(): void;
        /** (Re)arms the file monitor on the settings file. */
        _resumeSettingsMonitor(): void;
        registerHotkeys(): void;
        unregisterHotkeys(): void;
        destroy(): void;
    };
};
