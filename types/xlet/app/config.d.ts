// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const Config: {
    new (app: AppFacade): {
        app: AppFacade;
        _destroyed: boolean;
        settings: any;
        _importStarterPresets(): void;
        /**
         * Makes an external write of the layouts setting invalidate the App's
         * deferred split writes (see Split.invalidate).
         *
         * Covered by this surface: an external value-changing write whose reload
         * reaches us before the 500 ms flush — the ordinary settings-dialog reset or
         * import. settings.js emits changed::<key> only for a key whose RELOADED value
         * differs (`_checkSettings`), and own writes never emit it (`_setValue` only
         * stores and saves), so an own layoutSet/preset/drop/unrelated write leaves a
         * pending resize valid.
         *
         * NOT covered (bounded BLOCKED, reproduced by
         * tests/app/settings-external-write.blocked-evidence.js):
         * (1) a value-IDENTICAL external write (a backup import that restores the value
         *     already in memory) is invisible here by construction — there is no value
         *     diff to report; (2) the settings dialog rewrites the whole FILE before its
         *     asynchronous notification (JsonSettingsWidgets.save_settings ->
         *     notify_callback -> remoteUpdate), so a flush landing in that gap still
         *     merges the pending splits over the external value and the later reload
         *     then sees no difference to correct it. Closing either case needs an
         *     authorship signal this surface does not have; the options and their
         *     contract conflicts are recorded on the BLOCKED report.
         */
        _initSettingsObserver(): void;
        registerHotkeys(): void;
        unregisterHotkeys(): void;
        destroy(): void;
    };
};
