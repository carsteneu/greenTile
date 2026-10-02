'use strict';
// XDG lookup contract for lib/ui/i18n.js: `_()` must bind the gettext
// domain to GLib.get_user_data_dir() + '/locale' (the XDG data dir — what
// install.sh mirrors via ${XDG_DATA_HOME:-$HOME/.local/share}), on every
// call, reading imports lazily so a swapped fake environment is honored.
// The domain falls back to the default translation when the custom domain
// has no entry.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

test('_() binds the domain to the XDG data dir on every call and honors the live environment', () => {
    const env = createCinnamonEnv();
    const bindCalls = [];
    let customHit = false;
    env.gettext = {
        bindtextdomain(domain, dir) {
            bindCalls.push([domain, dir]);
        },
        dgettext(_domain, str) {
            customHit = true;
            return str; // no custom entry: identical string -> fallback
        },
        gettext(str) {
            return 'default:' + str;
        },
    };
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    try {
        // fresh namespace per env: clear the importer's cache entry
        env.extensions['greenTile@carsteneu'].clearCache('ui');
        const { _ } = env.extensions['greenTile@carsteneu'].lib.ui.i18n;
        assert.equal(_('Grid'), 'default:Grid', 'custom miss falls back to the default domain');
        assert.deepEqual(bindCalls, [['greenTile@carsteneu', '/home/fake/.local/share/locale']],
            'bindtextdomain targets the XDG data dir (GLib.get_user_data_dir + /locale)');
        assert.equal(customHit, true);
        _('Tiles');
        assert.equal(bindCalls.length, 2, 'every call rebinds — a swapped environment takes effect immediately');
    }
    finally {
        delete globalThis.imports;
        delete globalThis.global;
    }
});
