import { log, formatDateEU } from "./utils.js";
import { store } from "./globals.js";

// ===============================
// LOAD EVENTS
// ===============================
export async function loadEvents() {
    log("debug", "[EVENTS] Loading events...");

    try {
        const r = await fetch("/api/events");
        const data = await r.json();

        log("debug", `[EVENTS] Received ${data.length} events from API`);

        data.forEach((ev, i) => ev._id = i);

        store.EVENTS_DB.length = 0;
        store.EVENTS_DB.push(...data);

        log("debug", "[EVENTS] EVENTS_DB updated. New length:", store.EVENTS_DB.length);

        updateUnreadMessages(store.EVENTS_DB.length);

        setTimeout(() => {
            log("debug", "[EVENTS] Rendering events table...");
            renderEventsTable(store.EVENTS_DB);
        }, 0);

        log("info", "[EVENTS] loadEvents() completed successfully");

    } catch (err) {
        log("error", "[EVENTS] API /events error:", err);
    }
}


export function EventsNormalizer(e) {

    const fullTag = e.image || "<none>";

    let name = "<none>";
    let tag = "<none>";

    if (fullTag !== "<none>" && fullTag.includes(":")) {
        const parts = fullTag.split(":");
        name = parts[0];
        tag = parts[1];
    }

    const digestEntry = e.digest || null;

    return {
        raw: e,

        // normalized
        id: e._id,
        name,
        tag,
        fullTag,
        digest: digestEntry,
        status: e.status,
        created: e.created,
        receivedAt: e.received_at,
        provider: e.provider,
        platform: e.platform,
        hubLink: e.hub_link,

        container: {
            id: e.metadata?.ctn_id || null,
            name: e.metadata?.ctn_names || null,
            state: e.metadata?.ctn_state || null,
            status: e.metadata?.ctn_status || null,
            createdAt: e.metadata?.ctn_createdat || null,
            command: e.metadata?.ctn_command || null
        }
    };
}

export function renderEventsTable(data) {

    // Normalize first
    const eventsData = data.map(EventsNormalizer);

    // Sort by receivedAt (normalized field)
    eventsData.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

    $("#events").DataTable({
        data: eventsData,
        destroy: true,
        pageLength: 25,
        autoWidth: false,

        columns: [
            {
                data: "fullTag",
                width: "40%",
                render: (d, t, row) =>
                    `<input type="checkbox" class="ev-check mr-2" data-id="${row.id}">
                     <span>${d}</span>`
            },
            { data: "status", width: "20%" },
            { data: "created", render: d => formatDateEU(d), width: "20%" },
            { data: "receivedAt", render: d => formatDateEU(d), width: "20%" }
        ]
    });

    // SELECT ALL
    $("#ev-check-all").off("change").on("change", function () {
        $(".ev-check").prop("checked", this.checked);
    });
}

export function updateUnreadMessages(count) {
    const badge = document.getElementById("messages-count");

    const safeCount = Number(count) || 0;

    badge.textContent = safeCount;

    if (safeCount > 0) {
        badge.classList.remove("d-none");
    } else {
        badge.classList.add("d-none");
    }
}