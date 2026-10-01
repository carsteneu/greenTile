/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App theme and accent runtime: resolves the panel theme from the panelTheme
 * setting, the x-apps portal color scheme and the Cinnamon theme name, and reso-
 * lves theme-probed vs. custom accent/state colors, writing the generated
 * stylesheet — one sheet carrying the accent AND state rules — into the user
 * cache dir and loading/unloading it on the current St.Theme — the same
 * mechanism Cinnamon uses for extension stylesheets, so hover/focus
 * pseudo-classes keep working and an open panel restyles at once. Owned by the
 * App: theme_init re-created the portal/cinnamon Gio.Settings after every
 * shutdown anyway, so the whole state rides the App recreation. The generation
 * sequence is NOT here — it must outlive an App recreation and stays on the
 * session (nextAccentGen, seeded with the clock). Re-load hooks into
 * 'theme-set' because every Cinnamon theme switch replaces the whole St.Theme
 * object. init() gets the Config itself, not the app: it runs inside the
 * Config constructor, where the app's config property is not assigned yet.
 * All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const {
    tile_accent_default, tile_accent_parse, tile_accent_is_own,
    tile_accent_from_probed, tile_accent_probe_first, tile_accent_tones, tile_accent_css,
} = require('./lib/model/accent');
const { tile_state_default, tile_state_mode, tile_state_tones, tile_state_css } = require('./lib/model/state');
const { tile_theme_resolve, TILE_THEME_CAIRO } = require('./lib/model/theme');

// deps: st (imports.gi.St), gio (imports.gi.Gio), main (imports.ui.main), global
// (the global object), glib (imports.gi.GLib), nextAccentGen (() => 'gk-acc<n>',
// the session's generation sequence), panelOpen (() => tile_panel.actor, null
// while no panel is open), panelRebuild ((app) => tile_panel_rebuild(app)) —
// the panel stays module-level in greenTile.js until its own loop, so the two
// panel hooks come in as deps.
class Theme {
    constructor(deps) {
        this._deps = deps;
        this._st = deps.st;
        this._gio = deps.gio;
        this._main = deps.main;
        this._global = deps.global;
        this._glib = deps.glib;
        this._theme = 'dark';
        this._config = null;
        this._portal = null;
        this._portalSig = 0;
        this._cinnamon = null;
        this._cinnamonSig = 0;
        this._rgb = tile_accent_default;
        this._stateRgb = null;
        this._css = '';
        this._path = null;
        this._themeObj = null;
        this._themeSig = 0;
        this._gen = '';
    }

    get theme() {
        return this._theme;
    }

    get rgb() {
        return this._rgb;
    }

    get stateRgb() {
        return this._stateRgb;
    }

    get gen() {
        return this._gen;
    }

    // Cairo colors for the current theme (thumbnails, painter's dashed outline
    // — everything the stylesheet does not cover).
    cairo(key) {
        return TILE_THEME_CAIRO[this._theme][key];
    }

    panelClass() {
        return (this._theme === 'light' ? 'gk-panel gk-light' : 'gk-panel') + (this._gen ? ' ' + this._gen : '');
    }

    init(config) {
        if (this._portal === null) {
            const source = this._gio.SettingsSchemaSource.get_default();
            if (source && source.lookup('org.x.apps.portal', true)) {
                // gjs: the object form must go through the constructor, Settings.new takes the schema id string only
                this._portal = new this._gio.Settings({ schema_id: 'org.x.apps.portal' });
                this._portalSig = this._portal.connect('changed::color-scheme', () => this.changed());
            }
            if (source && source.lookup('org.cinnamon.theme', true)) {
                this._cinnamon = new this._gio.Settings({ schema_id: 'org.cinnamon.theme' });
                this._cinnamonSig = this._cinnamon.connect('changed::name', () => this.changed());
            }
        }
        if (this._themeSig === 0) {
            // Cinnamon theme switch: loadTheme replaced the St.Theme object — the accent
            // sheet is re-applied and the theme accent re-probed on top of the new theme
            // (synchronously, inside changed()).
            this._themeSig = this._main.themeManager.connect('theme-set', () => this.changed());
        }
        this._config = config;
        this.changed();
    }

    changed() {
        const config = this._config;
        if (!config)
            return;
        this._theme = tile_theme_resolve(
            config.settings.getValue('panelTheme'),
            this._portal ? this._portal.get_string('color-scheme') : null,
            this._cinnamon ? this._cinnamon.get_string('name') : null
        );
        try {
            this._apply(config);
        }
        catch (e) {
            // a failing accent (unusable probe, unwritable file) keeps the old look
            this._global.logError('greenTile: accent color: ' + e);
        }
        // An open panel or editor rebuilds itself: restyling in place would leave the
        // Cairo thumbnails and the painter in the old colors.
        if (this._deps.panelOpen())
            this._deps.panelRebuild(config.app);
    }

    destroy() {
        if (this._portal && this._portalSig) {
            try {
                this._portal.disconnect(this._portalSig);
            }
            catch (e) {
                // signal was already gone
            }
            this._portal = null;
            this._portalSig = 0;
        }
        if (this._cinnamon && this._cinnamonSig) {
            try {
                this._cinnamon.disconnect(this._cinnamonSig);
            }
            catch (e) {
                // signal was already gone
            }
            this._cinnamon = null;
            this._cinnamonSig = 0;
        }
        if (this._themeSig) {
            try {
                this._main.themeManager.disconnect(this._themeSig);
            }
            catch (e) {
                // signal was already gone
            }
            this._themeSig = 0;
        }
        // the panel is closed here; the accent sheet comes off the theme with it
        this._unload();
        this._config = null;
    }

    _probe(className, pseudoClass) {
        let probe = null;
        try {
            probe = new this._st.BoxLayout({ style_class: className, opacity: 0 });
            probe.add_style_pseudo_class(pseudoClass);
            this._main.uiGroup.add_child(probe);
            const c = probe.get_theme_node().get_background_color();
            return tile_accent_from_probed(c.red, c.green, c.blue, c.alpha);
        }
        catch (e) {
            return null;
        }
        finally {
            if (probe)
                probe.destroy();
        }
    }

    _load(theme, path) {
        try {
            theme.load_stylesheet(path);
            this._themeObj = theme;
            this._gen = this._deps.nextAccentGen();
        }
        catch (e) {
            this._global.logError('greenTile: accent stylesheet: ' + e);
        }
    }

    _unload() {
        if (!this._themeObj)
            return;
        try {
            this._themeObj.unload_stylesheet(this._path);
        }
        catch (e) {
            // the old theme object is already gone after a Cinnamon theme switch
        }
        this._themeObj = null;
    }

    _accentPath() {
        if (!this._path)
            this._path = this._glib.build_filenamev([this._glib.get_user_cache_dir(), 'greenTile@carsteneu', 'panel-accent.css']);
        return this._path;
    }

    _apply(config) {
        const own = tile_accent_is_own(config.settings.getValue('accentMode'));
        const stateMode = tile_state_mode(config.settings.getValue('stateMode'));
        // the probe chain serves both "Follow theme" modes — accent, state color
        // or both (first theme node with a usable accent wins, see accent-model)
        const probe = (!own || stateMode === 'theme') ? tile_accent_probe_first((className, pseudoClass) => this._probe(className, pseudoClass)) : null;
        const rgb = own ? tile_accent_parse(config.settings.getValue('accentColor')) : probe;
        const stateRgb = stateMode === 'own'
            ? tile_accent_parse(config.settings.getValue('stateColor'))
            : (stateMode === 'theme' ? probe : null);
        const base = rgb || tile_accent_default;
        const stateBase = stateRgb || tile_state_default;
        // one sheet, one load: accent and state rules ride on the same generated file,
        // so ANY color change goes through the css comparison below and bumps the
        // root class again (a state-only change must reload too)
        const css = tile_accent_css(tile_accent_tones(base)) + '\n' + tile_state_css(tile_state_tones(stateBase));
        const path = this._accentPath();
        if (css !== this._css) {
            this._glib.mkdir_with_parents(this._glib.path_get_dirname(path), 0o700);
            this._glib.file_set_contents(path, css);
            this._css = css;
            this._unload();
        }
        // set only after a successful persist: a failed write keeps painter and CSS
        // in the SAME (old) color instead of two different ones
        this._rgb = base;
        this._stateRgb = stateBase;
        const theme = this._st.ThemeContext.get_for_stage(this._global.stage).get_theme();
        if (this._themeObj && this._themeObj !== theme)
            this._unload();
        if (!this._themeObj)
            this._load(theme, path);
        // the focus border is the same color live: a state/theme switch repaints it here
        config.app.border.restyle();
    }
}

module.exports = { Theme };
