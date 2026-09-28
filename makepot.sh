#!/bin/bash
# Regenerate the translation template po/greenTile@carsteneu.pot, give it a
# proper header and merge it into every po/*.po file.
#
# Needs gettext (xgettext, msgmerge) and Cinnamon's cinnamon-xlet-makepot,
# which imports the Python modules polib and pytz. If they are not installed
# system-wide, point MAKEPOT_PYTHON at an interpreter that has them, e.g.
#   python3 -m venv /tmp/potenv && /tmp/potenv/bin/pip install polib pytz
#   MAKEPOT_PYTHON=/tmp/potenv/bin/python ./makepot.sh
set -euo pipefail
cd "$(dirname "$0")"

UUID=greenTile@carsteneu
POT="po/$UUID.pot"
PYTHON="${MAKEPOT_PYTHON:-python3}"
VERSION=$(python3 -c "import json; print(json.load(open('metadata.json'))['version'])")

"$PYTHON" "$(command -v cinnamon-xlet-makepot)" -o "$POT" .

# cinnamon-xlet-makepot writes xgettext's placeholder header; replace it.
# The translator fields (PO-Revision-Date, Last-Translator, Language-Team)
# stay as template placeholders on purpose: msginit fills them per language.
POT="$POT" UUID="$UUID" VERSION="$VERSION" python3 - <<'PYEOF'
import os
pot, uuid, version = os.environ['POT'], os.environ['UUID'], os.environ['VERSION']
text = open(pot, encoding='utf-8').read()
replacements = [
    ("# SOME DESCRIPTIVE TITLE.\n",
     "# Translation template for greenTile (%s).\n" % uuid),
    ("# Copyright (C) YEAR THE PACKAGE'S COPYRIGHT HOLDER\n",
     "# Copyright (C) vibou, shuairan and the gTile contributors\n"
     "# Copyright (C) 2026 carsten_eu\n"),
    ("# This file is distributed under the same license as the PACKAGE package.\n",
     "# This file is distributed under the same license as the greenTile package (GPL-3.0-only).\n"),
    ("# FIRST AUTHOR <EMAIL@ADDRESS>, YEAR.\n", ""),
    ('"Project-Id-Version: PACKAGE VERSION\\n"',
     '"Project-Id-Version: greenTile %s\\n"' % version),
    ('"Report-Msgid-Bugs-To: \\n"',
     '"Report-Msgid-Bugs-To: https://github.com/carsteneu\\n"'),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit('makepot.sh: expected header line not found: %r' % old)
    text = text.replace(old, new, 1)
open(pot, 'w', encoding='utf-8').write(text)
PYEOF

for po in po/*.po; do
    msgmerge --quiet --update --backup=none --previous "$po" "$POT"
done

for po in po/*.po; do
    printf '%-10s ' "$(basename "$po")"
    msgfmt --check --statistics -o /dev/null "$po"
done
