// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * @typedef {Object} AppCinnamon
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {AnyRecord} cinnamonNs imports.gi.Cinnamon
 */
export const App: {
    new (session: SessionFacade, cinnamon: AppCinnamon): {
        session: SessionFacade;
        placement: any;
        excl: any;
        hotkeys: any;
        panel: any;
        monitors: any;
        /** @type {SplitFacade} */
        split: SplitFacade;
        /** @type {OrdersFacade} */
        orders: OrdersFacade;
        theme: any;
        /** @type {BorderFacade} */
        border: BorderFacade;
        focus: any;
        /** @type {DropFacade} */
        drop: DropFacade;
        auto: any;
        ops: Readonly<{
            focusWindow: any;
            focusMonitorIndex: any;
            collectWindows: any;
            layoutFor: any;
            layoutSet: any;
            retileMonitor: any;
            presetsRead: any;
            presetsWrite: any;
            gap: any;
            rulesPick: any;
            windowCount: any;
            rebuild: any;
        }>;
        /** @type {ConfigFacade} */
        config: ConfigFacade;
        destroy(): void;
    };
};
export type AppCinnamon = {
    /**
     * imports.ui.main
     */
    main: AnyRecord;
    /**
     * imports.gi.Gio
     */
    gio: AnyRecord;
    /**
     * imports.gi.Meta
     */
    meta: AnyRecord;
    /**
     * the Cinnamon global object
     */
    global: AnyRecord;
    /**
     * imports.gi.GObject
     */
    gobject: AnyRecord;
    /**
     * imports.gi.Cinnamon
     */
    cinnamonNs: AnyRecord;
};
