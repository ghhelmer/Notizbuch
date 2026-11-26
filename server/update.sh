#!/usr/bin/env bash
# Holt die neueste Version der App und startet den Dienst neu. Aufruf als root.
set -euo pipefail
git -C /opt/notizbuch pull -q
systemctl restart notizbuch
echo "Aktualisiert auf: $(git -C /opt/notizbuch log -1 --format='%h %s')"
