# Notizbuch auf dem eigenen Windows-PC

Mit dieser Anleitung läuft das Familien-Notizbuch auf deinem eigenen PC. Der PC übernimmt dann die Anmeldung
und speichert alle Notizen und Termine. Handy, iPad und andere PCs greifen über den Browser darauf zu.

**Du brauchst:** einen PC mit Windows 10 oder 11, der möglichst immer eingeschaltet ist, und etwa 20 Minuten Zeit.

**Wichtig:** Ist der PC aus oder im Standby, kommt niemand an das Notizbuch. Was auf Handy oder iPad gerade
offen ist, bleibt dort gespeichert und wird abgeglichen, sobald der PC wieder läuft.

---

## Schritt 1: Programm herunterladen

1. Öffne https://github.com/ghhelmer/Notizbuch
2. Klicke auf den grünen Knopf **„Code“** und dann auf **„Download ZIP“**.
3. Gehe in den Ordner **Downloads**, klicke mit der **rechten** Maustaste auf `Notizbuch-main.zip` und wähle **„Eigenschaften“**.
   Setze unten den Haken bei **„Zulassen“** und klicke auf **OK**. (Sonst fragt Windows später bei jeder Datei nach.)
4. Wieder rechte Maustaste auf die ZIP-Datei, **„Alle extrahieren…“**, als Ziel `C:\` eintippen, **„Extrahieren“**.
5. Benenne den neuen Ordner `C:\Notizbuch-main` in **`C:\Notizbuch`** um.

> Falls Windows trotzdem „Der Computer wurde durch Windows geschützt“ meldet: auf **„Weitere Informationen“**
> und dann auf **„Trotzdem ausführen“** klicken.

## Schritt 2: Erster Start

1. Öffne den Ordner **`C:\Notizbuch\windows`**.
2. Doppelklicke auf **`Notizbuch-starten`**.
3. Beim ersten Mal fehlt noch das kostenlose Programm **Node.js**. Drücke **J**, dann wird es automatisch installiert
   (Windows fragt eventuell nach Erlaubnis, bitte mit **Ja** bestätigen).
   Klappt das nicht, öffnet sich die Webseite von Node.js: dort den Windows-Installer laden, immer auf „Weiter“ klicken,
   danach `Notizbuch-starten` noch einmal doppelklicken.
4. Jetzt legst du **deinen eigenen Zugang** an: Benutzername (z. B. `gerhard`) und zweimal das Passwort.
   Beim Tippen des Passworts erscheint absichtlich nichts auf dem Bildschirm.
5. Fragt die **Windows-Firewall**, ob Node.js zugreifen darf: Haken bei **„Private Netzwerke“** und **„Zugriff zulassen“**.
6. Der Browser öffnet sich mit dem Notizbuch. Melde dich mit deinem neuen Zugang an.

Das schwarze Fenster muss offen bleiben, solange das Notizbuch laufen soll. In Schritt 4 wird das bequemer.

## Schritt 3: Familienmitglieder anlegen

1. Klicke im Notizbuch oben rechts auf **deinen Namen**. Es öffnet sich „Benutzer verwalten“.
2. Lege für jede Person einen Zugang an, z. B. `karin`, `johannes`, `anna`, jeweils mit einem Passwort,
   und wähle die passende Person aus (für die Farbe im Kalender).
3. Gib jedem seinen Benutzernamen und sein Passwort. Jeder kann sein Passwort später selbst ändern.

## Schritt 4: Autostart (Notizbuch läuft unsichtbar und startet mit dem PC)

1. Schließe das schwarze Notizbuch-Fenster.
2. Doppelklicke im Ordner `windows` auf **`Autostart-einrichten`** und bestätige die Frage von Windows mit **Ja**.
3. Tippe **1** und Enter.
4. Fragt das Programm, ob dein Netzwerk auf **„Privat“** umgestellt werden soll, und es ist dein eigenes WLAN zu Hause: **j**.
5. Am Ende stehen die Adressen, unter denen das Notizbuch erreichbar ist. Schreib dir die Zeile **„im Heimnetz (WLAN)“** auf,
   z. B. `http://192.168.178.25:8080`.

Ab jetzt läuft das Notizbuch im Hintergrund, auch nach einem Neustart und sogar, wenn sich niemand am PC anmeldet.
Ein Doppelklick auf `Notizbuch-starten` öffnet dann einfach den Browser.

**Damit der PC nicht einschläft:** Einstellungen → System → **Strom und Akku** (bzw. „Netzbetrieb und Energiesparen“)
→ „Gerät in den Standbymodus versetzen nach“ auf **„Nie“** stellen. Der Bildschirm darf ruhig ausgehen.

## Schritt 5: Zugriff im WLAN zu Hause

Auf Handy, iPad oder einem anderen PC, die im **selben WLAN** sind:

1. Browser öffnen (Safari, Chrome, Edge) und die Adresse aus Schritt 4 eintippen, z. B. `http://192.168.178.25:8080`.
2. Anmelden.
3. Als App auf den Startbildschirm legen: im iPad/iPhone auf **Teilen** → **„Zum Home-Bildschirm“**, bei Android im Menü ⋮ → **„Zum Startbildschirm hinzufügen“**.

**Tipp für die Fritzbox:** Damit sich die Adresse nie ändert: fritz.box öffnen → Heimnetz → Netzwerk → bei deinem PC auf den Stift
→ Haken bei **„Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“** → Übernehmen.

## Schritt 6: Zugriff von unterwegs mit Tailscale (empfohlen)

Im Mobilfunk oder bei Oma im WLAN funktioniert die Heimnetz-Adresse nicht. Dafür gibt es **Tailscale**: ein kostenloses Programm,
das deine Geräte sicher miteinander verbindet, ohne dass das Notizbuch offen im Internet steht.
Nur Geräte, die bei deinem Tailscale-Konto angemeldet sind, kommen hinein.

**Auf dem PC:**

1. Doppelklicke im Ordner `windows` auf **`Tailscale-einrichten`**.
2. Tailscale fehlt noch: **J** drücken, es wird installiert.
3. Im Browser bei Tailscale anmelden, am einfachsten mit deinem Google-, Microsoft- oder Apple-Konto.
4. Erscheint ein Link zum Freischalten von HTTPS: Link öffnen, auf **„Enable“** klicken und `Tailscale-einrichten` noch einmal starten.
5. Am Ende steht eine Adresse wie **`https://mein-pc.tail1234.ts.net`**. Das ist die Adresse für alle Geräte.

**Auf jedem Handy und iPad:**

1. App **„Tailscale“** aus dem App Store bzw. Play Store installieren.
2. Mit **demselben Konto** anmelden wie am PC und die VPN-Erlaubnis bestätigen.
3. Im Browser die `https://….ts.net`-Adresse öffnen, anmelden und auf den Home-Bildschirm legen.

Diese Adresse funktioniert zu Hause **und** unterwegs. Wer Tailscale hat, braucht die Heimnetz-Adresse aus Schritt 5 also nicht mehr.
Mit der https-Adresse funktioniert die App außerdem besser offline.

## Schritt 7: Sicherung

- Das Notizbuch macht **jeden Tag von selbst eine Sicherung** in den Ordner `C:\Users\<dein Name>\Notizbuch-Sicherungen`.
  Die letzten 30 Tage bleiben erhalten.
- Eine zusätzliche Sicherung sofort: Doppelklick auf **`Sicherung-jetzt`**.
- **Sicherer gegen Festplattenschaden oder Diebstahl:** Lass die Sicherungen in deinen OneDrive-Ordner oder auf ein
  USB-Laufwerk schreiben. Dazu die Datei `C:\Notizbuch\windows\einstellungen.cmd` mit dem Editor öffnen
  (rechte Maustaste → „Bearbeiten“ bzw. „Mit Editor öffnen“) und die Zeile mit `BACKUP_DIR` ändern, z. B.

  ```
  set "BACKUP_DIR=C:\Users\Gerhard\OneDrive\Notizbuch-Sicherungen"
  ```

  Speichern und den PC neu starten.
- Die eigentlichen Daten liegen in `C:\Users\<dein Name>\Notizbuch-Daten`.

**Zurückholen einer Sicherung:** Notizbuch beenden (`Autostart-einrichten` → **3**), den Ordner `Notizbuch-Daten` umbenennen
(z. B. in `Notizbuch-Daten-alt`), den gewünschten Sicherungsordner (z. B. `Notizbuch-2026-12-01`) dorthin kopieren und in
`Notizbuch-Daten` umbenennen. Danach den PC neu starten.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Passwort vergessen | Am PC **`Passwort-zuruecksetzen`** doppelklicken, Benutzernamen und neues Passwort eingeben. |
| Handy kommt im WLAN nicht ran | Läuft der PC? Ist das Handy im selben WLAN? `Autostart-einrichten` noch einmal mit **1** ausführen (stellt Firewall und Netzwerk richtig ein). |
| „Port 8080 ist schon belegt“ | Das Notizbuch läuft schon (z. B. über den Autostart). Einfach den Browser mit `http://localhost:8080` öffnen. |
| Neue Version holen | **`Aktualisieren`** doppelklicken. Notizen, Benutzer und Einstellungen bleiben erhalten. |
| Notizbuch läuft nicht mehr | In `C:\Users\<dein Name>\Notizbuch-Daten\server.log` stehen Hinweise. Die Datei kannst du Claude zeigen. |

## Die Dateien im Ordner `windows`

| Datei | Wozu |
|---|---|
| `Notizbuch-starten` | Startet das Notizbuch (beim ersten Mal mit Einrichtung) oder öffnet es im Browser |
| `Autostart-einrichten` | Unsichtbar im Hintergrund laufen lassen, mit dem PC starten, wieder entfernen oder beenden |
| `Tailscale-einrichten` | Sichere Adresse für unterwegs |
| `Sicherung-jetzt` | Sofort eine zusätzliche Sicherung erstellen |
| `Passwort-zuruecksetzen` | Vergessenes Passwort neu setzen |
| `Aktualisieren` | Neueste Version von GitHub holen |
| `einstellungen.cmd` | Ordner für Daten und Sicherung, Anschlussnummer (entsteht beim ersten Start) |

Die bisherige Variante mit Microsoft-Anmeldung und OneDrive unter https://ghhelmer.github.io/Notizbuch/ funktioniert weiterhin unverändert.
