# <img src="public/assets/img/diun-logo.png" width="64" style="vertical-align: bottom;"> DIUN Viewer


DIUN Viewer is a lightweight web dashboard for [**DIUN (Docker Image Update Notifier)**](https://github.com/crazy-max/diun).  
It provides a simple UI to inspect images, view update events, and correlate image digests with DIUN webhook notifications.

---

## Features

- Web UI for DIUN images and events
- Status badge per image (up to date / outdated)
- Persistent event storage in a JSON file
- DIUN webhook ingestion
- Automatic cleanup of obsolete events based on current digests
- Auto‑refresh of data every few minutes
- No external database, no build step, no heavy frameworks

---

## Architecture

- **Backend:** Go HTTP server
  - Serves static frontend
  - Executes `diun image list --raw`
  - Receives DIUN webhook events
  - Stores events in `events.json`
  - Exposes a small REST API

- **Frontend:** Static HTML + JS
  - Bootstrap 5 + AdminLTE 4 layout
  - jQuery + DataTables for tables
  - FontAwesome + Bootstrap Icons for icons
  - Vanilla JS (`app.js`) for logic

High‑level flow:

1. DIUN sends webhook events to `/api/diun-webhook`
2. Go server appends events to `events.json`
3. Frontend calls `/api/events` and `/api/images`
4. Frontend correlates image digests with events and renders status badges

---

## Backend

### API Endpoints

- `GET /api/images`  
  Returns DIUN raw image list (output of `diun image list --raw`).

- `GET /api/events`  
  Returns stored events after cleaning out entries whose digest is no longer present in DIUN’s current image list.

- `POST /api/events/delete`  
  Deletes events:
  - Empty array `[]` → delete all events
  - Array of IDs `[1, 2, 3]` → delete only those events

- `POST /api/diun-webhook`  
  Receives DIUN webhook JSON and appends it to the event store.

### Configuration

The server reads a simple key/value config file diunViewer.cfg, for example:

```ini
PUBLIC_DIR=/tools/public
LISTEN_PORT=:80
EVENTS_FILE=/data/events.json
DIUN_BINARY=diun
LOG_LEVEL=debug
```

## Configuration Keys

- **PUBLIC_DIR** – directory containing static frontend files  
- **LISTEN_PORT** – port for the HTTP server (e.g. `:80`)  
- **EVENTS_FILE** – path to the JSON file used to persist events  
- **DIUN_BINARY** – path or name of the DIUN binary  
- **LOG_LEVEL** – `info` or `debug`  

---

## Frontend

### Technologies

- **Bootstrap 5** – layout and components  
- **AdminLTE 4** – sidebar and dashboard styling  
- **jQuery 3.6** – DOM helpers  
- **DataTables 1.13** – sortable/searchable tables  
- **FontAwesome 5** and **Bootstrap Icons** – icons  
- **Vanilla JavaScript** – application logic (`app.js`)  

---

## Pages

### Images

**Data source:** `GET /api/images`

**Columns:**
- Name (clickable, opens modal)  
- Tag  
- Digest  
- Status (badge)  
- Created  

**Status badge logic:**
- **Up to date** → no matching event for the digest  
- **Outdated** → at least one event exists with the same digest  

**Image modal includes:**
- Name, tag, platform, digest  
- Status badge  
- Created timestamp  
- Labels (collapsible list)  

---

### Events

**Data source:** `GET /api/events`

**Columns:**
- Image (with checkbox)  
- Status  
- Created  
- Received  

**Features:**
- “Select all” checkbox  
- “Delete selected” → `POST /api/events/delete` with selected IDs  
- “Delete all” → `POST /api/events/delete` with `[]`  
- Bootstrap alerts for success/error (auto‑dismissed)  

---

## Installation

### Build and run (Go)

```bash
go build -o diun-viewer
./diun-viewer
```

Ensure:

- The config file (e.g. `/tools/diunViewer.cfg`) exists and is valid  
- `PUBLIC_DIR` points to the directory containing `index.html`, `app.js`, CSS, etc.  
- `DIUN_BINARY` is reachable (in PATH or full path)  

## DIUN Webhook Configuration

```yaml
notif:
  webhook:
    endpoint: http://your-diun-viewer-host/api/diun-webhook
```

## Docker Example

```yaml
services:
  diun:
    image: crazymax/diun:latest
    container_name: diun
    restart: always

    networks:
      qnet-static-eth0-79e6cc:
        ipv4_address: 192.168.1.226

    mac_address: 02:42:37:48:85:29

    volumes:
      - /share/Container/Diun/data:/data
      - /var/run/docker.sock:/var/run/docker.sock
      - /share/Container/Diun/tools:/tools

    ports:
      - "80:80"

    dns:
      - 192.168.1.53
      - 8.8.8.8

    environment:
      - TZ=Europe/Zagreb
      - DIUN_PROVIDERS_DOCKER=true
      - DIUN_PROVIDERS_DOCKER_WATCHBYDEFAULT=true
      - DIUN_PROVIDERS_DOCKER_WATCHSTOPPED=true
      - DIUN_WATCH_SCHEDULE=0 */6 * * *
      - DIUN_NOTIF_WEBHOOK_ENDPOINT=http://192.168.1.226/api/diun-webhook
      - DIUN_NOTIF_WEBHOOK_METHOD=POST
      - DIUN_NOTIF_WEBHOOK_TIMEOUT=10s

    entrypoint: ["/tools/entrypoint.sh"]

networks:
  qnet-static-eth0-79e6cc:
    external: true
```

```
#!/bin/sh
set -e

```

# Force DNS immediately
```
echo "nameserver 192.168.1.53" > /etc/resolv.conf

echo "[GO] Starting Go webserver..."
/tools/diun-web 2>&1 &

echo "[DNS] Waiting 5 seconds for QNAP to finish overwriting resolv.conf..."
sleep 5
```

# Force DNS again AFTER QNAP overwrites it

```
echo "nameserver 192.168.1.53" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

echo "[DIUN] Starting DIUN..."
exec /usr/local/bin/diun serve
```

## Injecting DIUN Viewer Into the DIUN Docker Image

DIUN Viewer is not baked into the `crazymax/diun` image.  
Instead, it is injected at runtime using a bind-mounted `/tools` directory and a custom `entrypoint.sh`.

This approach allows the DIUN container to be updated freely while keeping:

- The DIUN Viewer binary
- The configuration file
- The event storage
- The custom entrypoint script

fully persistent and untouched.

### How It Works
  
1. A host directory is mounted into the container at `/tools`:  
  
   ```yaml
   - /share/Container/Diun/tools:/tools
```

This directory contains:

- **diun-web** — the Go DIUN Viewer server binary  
- **diunViewer.cfg** — configuration file  
- **entrypoint.sh** — custom startup script  

The container’s entrypoint is overridden:

```yaml
entrypoint: ["/tools/entrypoint.sh"]
```

The custom entrypoint:

- Forces DNS (required on QNAP)  
- Starts the DIUN Viewer webserver in the background  
- Waits for QNAP to overwrite DNS  
- Forces DNS again  
- Starts the official DIUN binary normally  

### entrypoint.sh

```sh
#!/bin/sh
set -e

# Force DNS immediately
echo "nameserver 192.168.1.53" > /etc/resolv.conf

echo "[GO] Starting Go webserver..."
/tools/diun-web 2>&1 &

echo "[DNS] Waiting 5 seconds for QNAP to finish overwriting resolv.conf..."
sleep 5

# Force DNS again AFTER QNAP overwrites it
echo "nameserver 192.168.1.53" > /etc/resolv.conf
echo "nameserver 1.1.1.1" >> /etc/resolv.conf
echo "nameserver 8.8.8.8" >> /etc/resolv.conf

echo "[DIUN] Starting DIUN..."
exec /usr/local/bin/diun serve

```

## Result

- The DIUN container runs normally.  
- DIUN Viewer runs alongside it inside the same container.  
- Updates to the DIUN image do not affect the Viewer.  
- All Viewer files remain persistent on the host.  
- No modification of the DIUN image is required.  

This method keeps the DIUN container stateless while allowing DIUN Viewer to coexist safely and survive upgrades.


## License

MIT License  
See LICENSE for details.
