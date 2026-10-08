// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * @typedef {Object} ActorSyncDeps
 * @property {AnyRecord} mainloop imports.mainloop (timeout_add, source_remove)
 * @property {(message: string) => void} log global.log
 * @property {(win: CinnamonWindow, x: number, y: number, width: number, height: number, animate: boolean) => void} moveResize windowMoveResize (lib/tiling/windows.js)
 */
/**
 * @typedef {Object} ActorWatch
 * @property {CinnamonWindow} window
 * @property {CinnamonActor} actor the actor read before the placement
 * @property {number} offX actor.x - frame.x before the placement
 * @property {number} offY actor.y - frame.y before the placement
 * @property {number} offW actor.width - frame.width before the placement
 * @property {number} offH actor.height - frame.height before the placement
 */
export const ActorSync: {
    new (deps: ActorSyncDeps): {
        _mainloop: AnyRecord;
        _log: (message: string) => void;
        _moveResize: (win: CinnamonWindow, x: number, y: number, width: number, height: number, animate: boolean) => void;
        /** @type {Map<string, number>} surface key -> pending mainloop timer */
        _pending: Map<string, number>;
        _destroyed: boolean;
        /**
         * The actor state a placement is about to invalidate, or null when there is nothing
         * to compare later (no compositor actor yet). Read BEFORE the frame moves.
         * @param {CinnamonWindow | null} metaWindow
         * @returns {ActorWatch | null}
         */
        watch(metaWindow: CinnamonWindow | null): ActorWatch | null;
        /**
         * Arms the one verification of this surface. A newer placement on the same surface
         * replaces the watched state and re-arms; other surfaces keep theirs.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {ActorWatch[]} watched
         */
        arm(app: AppFacade, monitorIndex: number, wsIndex: number, watched: ActorWatch[]): void;
        /**
         * The one nudge per window whose actor did not follow. Reasons a window is left
         * alone: it has no actor (or lost the one it had), it is minimized, maximized or
         * fullscreen — none of them is in the tiling state the placement established, and a
         * nudge would fight whatever mode took over.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {ActorWatch[]} watched
         */
        _verify(app: AppFacade, monitorIndex: number, wsIndex: number, watched: ActorWatch[]): void;
        /**
         * @param {string} key
         */
        _cancel(key: string): void;
        destroy(): void;
    };
};
export type ActorSyncDeps = {
    /**
     * imports.mainloop (timeout_add, source_remove)
     */
    mainloop: AnyRecord;
    /**
     * global.log
     */
    log: (message: string) => void;
    /**
     * windowMoveResize (lib/tiling/windows.js)
     */
    moveResize: (win: CinnamonWindow, x: number, y: number, width: number, height: number, animate: boolean) => void;
};
export type ActorWatch = {
    window: CinnamonWindow;
    /**
     * the actor read before the placement
     */
    actor: CinnamonActor;
    /**
     * actor.x - frame.x before the placement
     */
    offX: number;
    /**
     * actor.y - frame.y before the placement
     */
    offY: number;
    /**
     * actor.width - frame.width before the placement
     */
    offW: number;
    /**
     * actor.height - frame.height before the placement
     */
    offH: number;
};
