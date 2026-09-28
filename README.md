# greenTile

Fenster-Tiling für Cinnamon mit Spaltenregeln, Presets pro Arbeitsfläche, Auto-Modus und Einrasten nach dem Verschieben.

greenTile ist ein Fork von [gTile](https://github.com/shuairan/gTile) (gTile@shuairan v2.2.1, 5.4er-Codebasis) und steht wie das Original unter der **GPL v3** (siehe `LICENSE`). Das klassische gTile-Raster (`Super+G`) ist weiterhin enthalten.

- **UUID:** `greenTile@carsten_eu`
- **Getestet mit:** Cinnamon 6.6 (Linux Mint)

## Hotkeys

| Taste | Wirkung |
|---|---|
| `Super+Ctrl+3` | 3 gleich breite Spalten |
| `Super+Ctrl+6` | 6 gleich breite Spalten |
| `Super+Ctrl+A` | Auto-Modus ein/aus (beim Einschalten wird sofort gekachelt); auf Arbeitsflächen mit Preset: Preset erneut anwenden |
| `Super+Ctrl+P` | Preset-Panel der aktiven Arbeitsfläche öffnen/schließen |
| `Super+G` | klassisches gTile-Raster |

Alle Tasten lassen sich in den Einstellungen der Erweiterung ändern.

## Presets

Ein Preset ist eine Liste von Regeln nach Fensteranzahl: Jede Regel legt fest, wie viele Spalten es gibt und wie viele Fenster in jeder Spalte übereinander stehen. Ein Preset wird einer Arbeitsfläche zugewiesen und gilt dann dort.

Im Panel (`Super+Ctrl+P`):
- **Klick auf eine Zeile:** Preset dieser Arbeitsfläche zuweisen und sofort kacheln
- **✕ in der Zeile:** Zuweisung aufheben
- **🔧:** Editor (folgt)
- Das Panel lässt sich an der Kopfzeile verschieben und behält seine Position beim Wechsel der Arbeitsfläche.

Das Vorschaubild zeigt die Regel, die bei der aktuellen Fensteranzahl greifen würde.

Auf einer Arbeitsfläche mit Preset wird immer automatisch nachgekachelt, auch wenn der Auto-Modus aus ist.

## Auto-Modus

- Kommt ein Fenster auf der aktiven Arbeitsfläche dazu oder geht eines weg, wird nach 300 ms neu gekachelt (nur normale Fenster, keine Dialoge). Auch Minimieren und Wiederherstellen passen das Raster an.
- Ein von Hand verschobenes Fenster rastet beim Loslassen in den Rasterplatz am Ablageort ein, die Nachbarn rücken nach.
- Alle Bewegungen sind animiert (250 ms). Das Fenster bekommt die Endgröße sofort, nur das Bild gleitet, deshalb flackert der Text in Terminals nicht.
- Neue Fenster werden hinten angehängt.

Ohne Preset gilt das Auto-Raster (nur bei eingeschaltetem Auto-Modus), abhängig von der Monitorbreite:
- **ab 2100 px:** bis 6 Fenster in einer Reihe, darüber ausgeglichene Reihen (8 = 4×2, 12 = 6×2)
- **unter 2100 px:** bis 3 Fenster in einer Reihe, ab 4 Fenstern 3 Spalten mit Stapeln (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2)

Für alle Varianten gilt: Nur sichtbare Fenster der **aktiven** Arbeitsfläche werden gekachelt, nie Fenster von anderen Flächen. Minimierte Fenster bleiben draußen. Die Reihenfolge richtet sich nach der aktuellen Position auf dem Bildschirm, von Hand umsortierte Fenster behalten also ihren Platz.

## Installation und Deploy

```bash
D=~/.local/share/cinnamon/extensions/greenTile@carsten_eu
mkdir -p "$D"
node --check greenTile.js
cp extension.js greenTile.js metadata.json settings-schema.json stylesheet.css icon.png LICENSE "$D"/
cp -r icons "$D"/
dbus-send --session --print-reply --dest=org.Cinnamon /org/Cinnamon org.Cinnamon.Eval \
  string:"imports.ui.extensionSystem.disableExtension('greenTile@carsten_eu'); imports.ui.extensionSystem.enableExtension('greenTile@carsten_eu'); 'reloaded'"
```

Beim ersten Mal die Erweiterung in den Cinnamon-Einstellungen aktivieren. **gTile@shuairan muss dabei deaktiviert sein**, sonst belegen beide dieselben Tasten.

Prüfen: `imports.ui.extensionSystem.runningExtensions` (ein Array) muss `greenTile@carsten_eu` enthalten, und `~/.xsession-errors` darf keine `JS ERROR` mit `greenTile.js` zeigen.

## Umstieg von gTile

Einstellungen und Presets liegen pro UUID unter `~/.config/cinnamon/spices/`. Zum Übernehmen:

```bash
mkdir -p ~/.config/cinnamon/spices/greenTile@carsten_eu
cp ~/.config/cinnamon/spices/gTile@shuairan/gTile@shuairan.json \
   ~/.config/cinnamon/spices/greenTile@carsten_eu/greenTile@carsten_eu.json
gsettings set org.cinnamon enabled-extensions "['greenTile@carsten_eu']"
```

Zurück zu gTile: `gsettings set org.cinnamon enabled-extensions "['gTile@shuairan']"`. Ordner und Einstellungen von gTile bleiben dabei unberührt.

## Stolperfallen

- Muffin 6.6: `get_frame_rect()` verwenden, `get_outer_rect()` gibt es dort nicht.
- Hotkeys stehen in zwei Dateien: Standardwert im Schema und Nutzerwert in `~/.config/cinnamon/spices/greenTile@carsten_eu/greenTile@carsten_eu.json`. Der Nutzerwert gewinnt.
- `Super+N` und `Super+Shift+N` gehören der Fensterleiste, nicht belegen.
- `focusMetaWindow` aus dem gTile-Code veraltet beim Wechsel zwischen Fenstern derselben Anwendung. Deshalb nutzt das Tiling einen eigenen Collector.
- `grab-op-begin` und `grab-op-end` übergeben das Display doppelt: `(display, display, window, op)`.
- Panel ziehen: Es braucht `Main.pushModal(actor)` **und** `device.grab(actor)` zusammen, wie in Cinnamons `dnd.js`. Eines allein verliert Maus-Events, sobald der Zeiger das Panel verlässt.
- Diagnose: Zeilen `greenTile skipped …` in `~/.xsession-errors` nennen den Grund, warum ein Fenster nicht gekachelt wurde.
- Neu laden per DBus-Eval wie oben, ein Neustart von Cinnamon ist nie nötig.

## Lizenz

GPL v3, siehe `LICENSE`. Ursprünglicher Code: gTile von shuairan und Mitwirkenden.
