#!/usr/bin/env bash
# Bindet eine Hetzner Storage Box als großen Speicher ein und verschiebt die Daten dorthin.
# Vorher in der Hetzner-Verwaltung bei der Storage Box „SMB-Unterstützung“ einschalten.
# Aufruf als root:  bash /opt/notizbuch/server/storagebox.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen."; exit 1; }
MNT=/mnt/storagebox
NEW=$MNT/notizbuch

read -r -p "Benutzername der Storage Box (z. B. u123456): " SBUSER </dev/tty
read -r -s -p "Passwort der Storage Box: " SBPASS </dev/tty; echo
HOST="$SBUSER.your-storagebox.de"

umask 077
printf 'username=%s\npassword=%s\n' "$SBUSER" "$SBPASS" > /root/.storagebox-zugang
UIDN=$(id -u notizbuch); GIDN=$(id -g notizbuch)
mkdir -p "$MNT"
sed -i "\#[[:space:]]$MNT[[:space:]]#d" /etc/fstab
echo "//$HOST/backup $MNT cifs credentials=/root/.storagebox-zugang,uid=$UIDN,gid=$GIDN,file_mode=0600,dir_mode=0700,iocharset=utf8,seal,vers=3.0,_netdev,nofail 0 0" >> /etc/fstab
systemctl daemon-reload
mount "$MNT" || { echo "Einbinden fehlgeschlagen. Stimmen Benutzername/Passwort, und ist SMB eingeschaltet?"; exit 1; }
echo "Storage Box eingebunden: $(df -h "$MNT" | awk 'NR==2{print $2" gesamt, "$4" frei"}')"

OLD=$(systemctl show notizbuch -p Environment | tr ' ' '\n' | sed -n 's/^DATA_DIR=//p')
if [ "$OLD" != "$NEW" ]; then
  echo "Daten werden kopiert …"
  systemctl stop notizbuch
  mkdir -p "$NEW"
  cp -a "$OLD"/. "$NEW"/
  sed -i "s#^Environment=DATA_DIR=.*#Environment=DATA_DIR=$NEW#; s#^ReadWritePaths=.*#ReadWritePaths=$NEW#" /etc/systemd/system/notizbuch.service
  grep -q '^RequiresMountsFor=' /etc/systemd/system/notizbuch.service || sed -i "s#^\[Unit\]#[Unit]\nRequiresMountsFor=$MNT#" /etc/systemd/system/notizbuch.service
  systemctl daemon-reload
  systemctl start notizbuch
  echo "Die alten Daten bleiben zur Sicherheit unter $OLD liegen."
fi
echo "Fertig. Die App speichert jetzt auf der Storage Box ($NEW)."
echo "Tipp: In der Hetzner-Verwaltung bei der Storage Box automatische Snapshots einschalten (z. B. täglich)."
