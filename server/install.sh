#!/usr/bin/env bash
# Installiert die Familien-App auf einem frischen Ubuntu-Server (24.04).
# Aufruf als root:
#   curl -fsSL https://raw.githubusercontent.com/ghhelmer/Notizbuch/main/server/install.sh | bash
# Optional mit eigener Internetadresse:  ... | DOMAIN=familie.example.de bash
set -euo pipefail

REPO="https://github.com/ghhelmer/Notizbuch.git"
APP=/opt/notizbuch
DATA=/var/lib/notizbuch
BACKUP=/var/backups/notizbuch

say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (z. B. mit 'sudo -i')."; exit 1; }

say "Pakete installieren (dauert 1–3 Minuten)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q nodejs git caddy ufw unattended-upgrades cifs-utils curl ca-certificates
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node.js ist zu alt ($NODE_MAJOR). Bitte Ubuntu 24.04 verwenden."; exit 1; }

say "Programm herunterladen"
id notizbuch >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin notizbuch
if [ -d "$APP/.git" ]; then git -C "$APP" pull -q; else git clone -q --depth 1 "$REPO" "$APP"; fi
mkdir -p "$DATA" "$BACKUP"
chown notizbuch:notizbuch "$DATA"; chmod 700 "$DATA" "$BACKUP"

say "Dienst einrichten"
cat > /etc/systemd/system/notizbuch.service <<UNIT
[Unit]
Description=Familien-Notizbuch
After=network-online.target remote-fs.target
Wants=network-online.target

[Service]
User=notizbuch
Group=notizbuch
Environment=PORT=8080
Environment=DATA_DIR=$DATA
Environment=APP_DIR=$APP
ExecStart=/usr/bin/node $APP/server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable -q --now notizbuch
systemctl restart notizbuch

say "Internetadresse und https einrichten"
if [ -z "${DOMAIN:-}" ]; then
  IP=$(curl -4 -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
  DOMAIN="$(echo "$IP" | tr . -).sslip.io"
fi
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8080
	header Strict-Transport-Security "max-age=31536000"
}
CADDY
systemctl enable -q caddy
systemctl restart caddy
echo "$DOMAIN" > /etc/notizbuch-adresse

say "Firewall einschalten (nur SSH, http, https)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

say "Automatische Sicherheitsupdates einschalten"
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

say "Tägliche Sicherung einrichten"
cat > /etc/cron.daily/notizbuch-sicherung <<'CRON'
#!/bin/sh
# Sichert alle Notizbücher und Benutzer täglich, behält 14 Tage.
DATA=$(systemctl show notizbuch -p Environment | tr ' ' '\n' | sed -n 's/^DATA_DIR=//p')
DEST=/var/backups/notizbuch
[ -d /mnt/storagebox/sicherung ] && mountpoint -q /mnt/storagebox && [ "$DATA" != "/mnt/storagebox/notizbuch" ] && DEST=/mnt/storagebox/sicherung
mkdir -p "$DEST"
tar czf "$DEST/notizbuch-$(date +%F).tar.gz" -C "$(dirname "$DATA")" "$(basename "$DATA")" 2>/dev/null
find "$DEST" -name 'notizbuch-*.tar.gz' -mtime +14 -delete
CRON
chmod 755 /etc/cron.daily/notizbuch-sicherung

say "Admin-Zugang anlegen"
cd "$APP/server"
if sudo -u notizbuch DATA_DIR="$DATA" node server.js liste | grep -q .; then
  echo "Es gibt schon Benutzer, überspringe."
else
  read -r -p "Benutzername für dich (z. B. gerhard): " ADMIN </dev/tty
  while :; do
    read -r -s -p "Passwort (mind. 6 Zeichen): " PW1 </dev/tty; echo
    read -r -s -p "Passwort wiederholen: " PW2 </dev/tty; echo
    [ "$PW1" = "$PW2" ] && [ ${#PW1} -ge 6 ] && break
    echo "Passwörter stimmen nicht überein oder sind zu kurz. Nochmal."
  done
  sudo -u notizbuch DATA_DIR="$DATA" node server.js admin-anlegen "$ADMIN" "$PW1"
fi

sleep 3
say "Fertig!"
echo
echo "  Deine App:   https://$DOMAIN"
echo
echo "  Beim ersten Aufruf kann es eine Minute dauern, bis das https-Zertifikat da ist."
echo "  Großen Speicher (Storage Box) einbinden:  bash $APP/server/storagebox.sh"
echo "  Auf neue Version aktualisieren:          bash $APP/server/update.sh"
