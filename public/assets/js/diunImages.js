import { log, formatDateEU } from "./utils.js";
import { store } from "./globals.js";

// ===============================
// LOAD Diun IMAGES
// ===============================
export async function loadDiunImages() {
    try {
        const r = await fetch("/api/diunImages");
        const data = await r.json();

        // FIX: normalize DIUN images
        store.DIUN_DB.length = 0;       // keep reference intact
        store.DIUN_DB.push(...data.images.map(DIUNImageNormalizer));

        setTimeout(() => renderDiunImagesTable(store.DIUN_DB), 0);

        console.log("Loaded DIUN images:", store.DIUN_DB.length);
    } catch (err) { 
        console.error("API /diunImages error:", err);
    }
}

export function DIUNImageNormalizer(x) {
    return {
        name: x.name,                     // "docker.io/homebridge/homebridge"
        tag: x.latest?.tag || "",
        digest: x.latest?.digest?.split(":")[1] || "",
        created: x.latest?.created || "",
        raw: x
    };
}

// ===============================
// RENDER DIUN IMAGES TABLE
// ===============================
export function renderDiunImagesTable(data) {

    log("debug", "📄 renderDiunImagesTable() called");

    if (!Array.isArray(data)) {
        log("error", "❌ data is NOT an array:", data);
        return;
    }

    log("debug", `📦 DIUN_DB entries: ${store.DIUN_DB.length}`);

    if (store.DIUN_DB.length === 0) {
        log("warn", "⚠️ DIUN_DB is empty → table will render with no rows");
    } else {
        log("debug", "🔎 First DIUN entry:", store.DIUN_DB[0]);
    }

    const tableData = store.DIUN_DB;

    // Check if table element exists
    if ($("#diun-images").length === 0) {
        log("error", "❌ #diun-images table NOT found in DOM");
        return;
    }

    log("debug", "🛠 Initializing DataTable for DIUN images…");

    $("#diun-images").DataTable({
        data: tableData,
        destroy: true,
        responsive: true,
        autoWidth: false,
        pageLength: 25,

        columnDefs: [
            { targets: [1, 3], className: "text-center" }
        ],

        columns: [
            {
                data: "name",
                render: (d, t, row) => {
                    log("debug", "Render name:", d);
                    return `<span class="diun-image-name">${d}</span>`;
                }
            },
            { 
                data: "tag",
                render: d => {
                    log("debug", "Render tag:", d);
                    return `<code>${d}</code>`;
                }
            },
            { 
                data: "digest",
                render: d => {
                    log("debug", "Render digest:", d);
                    return `<code>${d}</code>`;
                }
            },
            { 
                data: "created",
                render: d => {
                    log("debug", "Render created:", d);
                    return formatDateEU(d);
                }
            }
        ],

        initComplete: () => {
            log("debug", "✅ DIUN images table rendered successfully");
        }
    });
}
