#!/bin/sh
set -e

# Force DNS immediately
echo "nameserver 192.168.1.53" > /etc/resolv.conf

echo "[GO] Starting Go webserver..."
/tools/diunViewer 2>&1 &

echo "[DNS] Waiting 5 seconds for QNAP to finish overwriting resolv.conf..."
sleep 5

# Force DNS again AFTER QNAP overwrites it
echo "nameserver 192.168.1.53" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

echo "[DIUN] Starting DIUN..."
exec /usr/local/bin/diun serve
