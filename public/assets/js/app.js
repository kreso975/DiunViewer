import { loadHealth, updateHealthBadge } from "./health.js";
import { DIUN_METRICS, parseDiunMetrics } from "./metrics.js";
import { loadImages, DockerImageNormalizer, renderImagesTable } from "./dockerImages.js";
import { loadDiunImages, DIUNImageNormalizer, renderDiunImagesTable } from "./diunImages.js";
import { loadEvents, EventsNormalizer, renderEventsTable } from "./events.js";
import { injectDiunMetricsHTML, loadDiunMetrics, renderDiunMetricsCards } from "./metrics.js";


// ===============================
// GLOBAL IMAGE CACHE
// ===============================
let IMAGES_DB = [];
let EVENTS_DB = [];
let DIUN_DB = [];
let DIUN_METRICS_ENABLED  = false;
let LOGLEVEL = 3; // default: info - LOGLEVEL: 0=none, 1=error, 2=warn, 3=info, 4=debug

// 👉 EXPORT GLOBALS SO OTHER MODULES CAN IMPORT THEM
export { DIUN_DB, IMAGES_DB, EVENTS_DB, DIUN_METRICS_ENABLED, LOGLEVEL };

export function log(level, ...args) {
    const levels = { error:1, warn:2, info:3, debug:4 };
    if (LOGLEVEL >= levels[level]) {
        console[level](...args);
    }
}

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    // Initialize all tooltips ONCE
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(el => new bootstrap.Tooltip(el));

    setupNav();

    //
    // HEALTH (FIRST LOAD)
    //
    const health = await loadHealth();
    DIUN_METRICS_ENABLED = (health.metrics !== "disabled");

    if (DIUN_METRICS_ENABLED) {
        document.querySelector(".diun-metrics-item").classList.remove("d-none");
    } else {
        document.querySelector(".diun-metrics-item").classList.add("d-none");
    }

    const services = Object.entries(health).map(([name, status]) => ({
        name,
        status
    }));
    updateHealthBadge(services);

    // EVENTS (must be before images)
    await loadEvents();
    updateUnreadMessages(EVENTS_DB.length);

    // DIUN IMAGES
    await loadDiunImages();

    // DOCKER IMAGES
    await loadImages();

    attachDeleteHandlers();

    // AUTO REFRESH LOOP
    const REFRESH_MINUTES = 5;
    setInterval(async () => {

        const health = await loadHealth();
        DIUN_METRICS_ENABLED = (health.metrics !== "disabled");

        const services = Object.entries(health).map(([name, status]) => ({
            name,
            status
        }));
        updateHealthBadge(services);

        await loadEvents();
        updateUnreadMessages(EVENTS_DB.length);

        await loadDiunImages();
        await loadImages();

    }, REFRESH_MINUTES * 60 * 1000);

    // MODAL FIX
    document.getElementById("imageModal").addEventListener("hide.bs.modal", () => {
        document.activeElement.blur();
    });

    // REFRESH IMAGES BUTTON
    document.getElementById("refresh-images").addEventListener("click", async () => {
        const btn = document.getElementById("refresh-images");

        btn.disabled = true;
        btn.classList.add("loading");

        await new Promise(r => setTimeout(r, 300));
        await loadImages();

        btn.disabled = false;
        btn.classList.remove("loading");
    });

    // REFRESH DIUN IMAGES BUTTON
    document.getElementById("refresh-diun-images").addEventListener("click", async () => {
        const btn = document.getElementById("refresh-diun-images");

        btn.disabled = true;
        btn.classList.add("loading");

        await new Promise(r => setTimeout(r, 300));
        await loadDiunImages();

        btn.disabled = false;
        btn.classList.remove("loading");
    });
});


function attachDeleteHandlers() {

    $("#ev-delete-selected").off("click").on("click", async function () {
        const selectedIds = [...document.querySelectorAll(".ev-check:checked")]
            .map(x => parseInt(x.dataset.id));

        if (selectedIds.length === 0) {
            showEventAlert("warning", "No events selected");
            return;
        }

        try {
            const r = await fetch("/api/events/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(selectedIds)
            });

            if (!r.ok) throw new Error("Server error");

            showEventAlert("success", "Selected events deleted");

            await loadEvents();
            updateUnreadMessages(EVENTS_DB.length);

        } catch (err) {
            console.error("DELETE EVENTS ERROR:", err);
            showEventAlert("danger", "Failed to delete events");
        }
    });

    $("#ev-delete-all").off("click").on("click", async function () {
        try {
            const r = await fetch("/api/events/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([])
            });

            if (!r.ok) throw new Error("Server error");

            showEventAlert("success", "All events deleted");

            await loadEvents();
            updateUnreadMessages(EVENTS_DB.length);

        } catch (err) {
            console.error("DELETE ALL ERROR:", err);
            showEventAlert("danger", "Failed to delete all events");
        }
    });
}


function setupNav() {
    const links = document.querySelectorAll(".nav-link[data-page]");
    links.forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            const page = link.getAttribute("data-page");

            links.forEach(l => l.classList.remove("active"));
            link.classList.add("active");

            document.getElementById("page-images").style.display = (page === "images") ? "" : "none";
            document.getElementById("page-events").style.display = (page === "events") ? "" : "none";
            document.getElementById("page-diun-images").style.display = (page === "page-diun-images") ? "" : "none";
            document.getElementById("page-diun-metrics").style.display = (page === "page-diun-metrics") ? "" : "none";

            // ===============================
            // DIUN METRICS PAGE HANDLER
            // ===============================
            if (page === "page-diun-metrics") {

                if (!DIUN_METRICS_ENABLED) {
                    console.warn("DIUN Metrics clicked but disabled");
                    return;
                }

                const container = document.getElementById("page-diun-metrics");

                if (!container.dataset.loaded) {
                    injectDiunMetricsHTML();
                    container.dataset.loaded = "1";
                }

                loadDiunMetrics().then(() => {
                    renderDiunMetricsCards();
                });
            }
        });
    });
}


// ===============================
// DATE FORMATTER
// ===============================
export function formatDateEU(d) {
    if (!d) return "-";

    let dt;

    // If it's an ISO string → parse directly
    if (typeof d === "string" && d.includes("T")) {
        dt = new Date(d);
    }
    // If it's a number → detect seconds vs ms
    else if (typeof d === "number") {
        const isMilliseconds = d > 10_000_000_000;
        dt = new Date(isMilliseconds ? d : d * 1000);
    }
    else {
        return "-";
    }

    if (isNaN(dt.getTime())) return "-";

    const day = dt.getDate().toString().padStart(2, "0");
    const month = (dt.getMonth() + 1).toString().padStart(2, "0");
    const year = dt.getFullYear();

    const hours = dt.getHours().toString().padStart(2, "0");
    const minutes = dt.getMinutes().toString().padStart(2, "0");
    const seconds = dt.getSeconds().toString().padStart(2, "0");

    return `${day}.${month}.${year}. ${hours}:${minutes}:${seconds}`;
}

function showEventAlert(type, message) {
    const id = "alert-" + Date.now();

    const html = `
        <div id="${id}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert">
                <span>&times;</span>
            </button>
        </div>
    `;

    $("#ev-alerts").html(html);

    // Auto-hide after 3 seconds
    setTimeout(() => {
        $("#" + id).alert("close");
    }, 3000);
}

function updateUnreadMessages(count) {
    const badge = document.getElementById("messages-count");

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove("d-none");
    } else {
        badge.classList.add("d-none");
    }
}