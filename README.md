# Notizbuch

Eigene Notizbuch-App als Ersatz für OneNote. Läuft im Browser auf iPad, PC und Handy und lässt sich wie eine App auf den Home-Bildschirm legen.

**Adresse:** https://ghhelmer.github.io/notizbuch/

## Was sie kann

- Notizbücher, Abschnitte (farbig), Seiten und Unterseiten
- Textkästen frei auf dem Blatt platzieren, Fett/Kursiv/Unterstrichen, Überschriften, Listen, Aufgaben zum Abhaken
- Stift (mit Druckstärke beim Apple Pencil), Textmarker, Radierer, Rückgängig
- Bilder einfügen, verschieben, Größe ändern
- Liniertes, kariertes oder leeres Papier
- Suche über alle Notizbücher
- Speichern auf dem Gerät (funktioniert offline)
- Mit Microsoft-Anmeldung: Notizbücher in OneDrive speichern, auf allen Geräten nutzen und mit anderen teilen

## So werden Daten in OneDrive abgelegt

```
OneDrive/Notizbuch/<Name des Notizbuchs>/
  notebook.json        Abschnitte und Seitenliste
  pages/<id>.json      eine Datei pro Seite
```

Geteilt wird der Ordner eines Notizbuchs über die normale OneDrive-Freigabe (in der App: Notizbuch-Menü ⋯ → „Teilen…“).
Andere öffnen ihn in der App über „+ Freigegebenes Notizbuch öffnen“.

Ändern zwei Personen gleichzeitig dieselbe Seite, übernimmt die App die Fassung, die zuerst in OneDrive war,
und legt die eigene als Kopie „(meine Fassung …)“ daneben. Es geht nichts verloren.

## Einmalig einrichten: Anmeldung mit Microsoft

Damit die Anmeldung funktioniert, braucht die App eine (kostenlose) Registrierung bei Microsoft:

1. Öffne https://portal.azure.com und melde dich mit deinem Microsoft-Konto an.
2. Suche oben nach **„App-Registrierungen“** und klicke auf **„Neue Registrierung“**.
3. Name: `Notizbuch`.
4. Unterstützte Kontotypen: **„Konten in einem beliebigen Organisationsverzeichnis … und persönliche Microsoft-Konten“**.
5. Umleitungs-URI: Plattform **„Single-Page-Anwendung (SPA)“**, Adresse `https://ghhelmer.github.io/notizbuch/`
6. Auf **„Registrieren“** klicken.
7. Die **„Anwendungs-ID (Client)“** kopieren und in `config.js` bei `clientId` eintragen.

Die Anwendungs-ID ist kein Geheimnis und darf im Code stehen.

## Technik

- Reines HTML/CSS/JavaScript, kein Build-Schritt
- `js/app.js` Oberfläche und lokale Daten (IndexedDB über `js/db.js`)
- `js/onedrive.js` Anmeldung (MSAL, in `vendor/`) und Abgleich mit OneDrive über Microsoft Graph
- `sw.js` und `manifest.webmanifest` machen die Seite installierbar und offline nutzbar

### Test des Abgleichs

Der Test simuliert OneDrive und zwei Personen, die dasselbe Notizbuch bearbeiten:

```
python3 -m http.server 8765 &
node tests/sync.test.js
```
