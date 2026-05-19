// ===============================
// GLOBAL IMAGE CACHE
// ===============================
let IMAGES_DB = [];
let EVENTS_DB = [];

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    setupNav();

    // MUST load events first
    await loadEvents();

    // THEN load images
    await loadImages();

    attachDeleteHandlers();

    const REFRESH_MINUTES = 5;
    setInterval(async () => {
        await loadEvents();
        await loadImages();
    }, REFRESH_MINUTES * 60 * 1000);

    document.getElementById("imageModal").addEventListener("hide.bs.modal", () => {
        document.activeElement.blur();
    });
});


function attachDeleteHandlers() {

    $("#ev-delete-selected").off("click").on("click", function () {
        const selectedIds = [...document.querySelectorAll(".ev-check:checked")]
            .map(x => parseInt(x.dataset.id));

        if (selectedIds.length === 0) {
            showEventAlert("warning", "No events selected");
            return;
        }

        fetch("/api/events/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selectedIds)
        })
        .then(r => {
            if (!r.ok) throw new Error("Server error");
            showEventAlert("success", "Selected events deleted");
            loadEvents();
        })
        .catch(err => {
            console.error("DELETE EVENTS ERROR:", err);
            showEventAlert("danger", "Failed to delete events");
        });
    });

    $("#ev-delete-all").off("click").on("click", function () {
        fetch("/api/events/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([])
        })
        .then(r => {
            if (!r.ok) throw new Error("Server error");
            showEventAlert("success", "All events deleted");
            loadEvents();
        })
        .catch(err => {
            console.error("DELETE ALL ERROR:", err);
            showEventAlert("danger", "Failed to delete all events");
        });
    });
}


// ===============================
// NAVIGATION
// ===============================
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
        });
    });
}

// ===============================
// LOAD IMAGES
// ===============================
async function loadImages() {
    try {
        const r = await fetch("/api/images");
        const data = await r.json();
        IMAGES_DB = data.images;
        renderImagesTable(data.images);
    } catch (err) {
        return console.error("API /images error:", err);
    }
}

// ===============================
// LOAD EVENTS
// ===============================
async function loadEvents() {
    try {
        const r = await fetch("/api/events");
        const data = await r.json();
        data.forEach((ev, i) => ev._id = i);
        EVENTS_DB = data;
        renderEventsTable(data);
    } catch (err) {
        return console.error("API /events error:", err);
    }
}

// ===============================
// RENDER IMAGES TABLE
// ===============================
function renderImagesTable(data) {

    // Map backend → frontend keys for table only
    const tableData = data.map(x => ({
        name: normalizeName(x.name),
        originalName: x.name,
        tag: x.latest.tag,
        digest: x.latest.digest,
        status: x.latest.digest || "",
        created: x.latest.created
    }));

    $("#images").DataTable({
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
                render: (d, t, row) =>
                    `<a href="#" class="image-link" data-image="${row.originalName}">${d}</a>`
            },
            { data: "tag", render: d => `<code>${d}</code>` },
            { data: "digest", render: d => `<code>${d}</code>` },
            { data: "status", render: (d, t, row) => renderStatusBadge(row.status) },
            { data: "created", render: d => formatDateEU(d) }
        ],
        initComplete: () => {
            $("#images").off("click", ".image-link").on("click", ".image-link", function (e) {
                e.preventDefault();

                const name = this.getAttribute("data-image");
                const full = IMAGES_DB.find(x => x.name === name);

                openImageModal(full);
            });
        }
    });
}

function normalizeName(name) {
    if (!name) return name;

    // Remove registry prefix (docker.io/, ghcr.io/, quay.io/, etc.)
    name = name.replace(/^[^/]+\//, "");

    // Remove :tag if present
    name = name.replace(/:.+$/, "");

    return name;
}

// ===============================
// RENDER EVENTS TABLE
// ===============================
function renderEventsTable(data) {
    data.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

    $("#events").DataTable({
        data,
        destroy: true,
        pageLength: 25,
        autoWidth: false,

        columns: [
            {
                data: "image",
                width: "40%",
                render: (d, t, row) =>
                    `<input type="checkbox" class="ev-check mr-2" data-id="${row._id}">
                    <span>${d}</span>`
            },
            { data: "status", width: "20%" },
            { data: "created", render: d => formatDateEU(d), width: "20%" },
            { data: "received_at", render: d => formatDateEU(d), width: "20%" }
        ]
    });

    // SELECT ALL
    $("#ev-check-all").off("change").on("change", function () {
        $(".ev-check").prop("checked", this.checked);
    });
}


function saveEventsToServer() {
    fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventStore)
    }).catch(err => console.error("SAVE EVENTS ERROR:", err));
}


// ===============================
// STATUS BADGE
// ===============================
function renderStatusBadge(digest) {

    const matches = EVENTS_DB
        .filter(ev => ev.digest === digest)
        .map(ev => ({
            eventDigest: ev.digest,
            eventId: ev._id,
            created: ev.created
        }));

    const hasEvent = matches.length > 0;

    console.groupEnd();

    if (hasEvent) {
        return `
            <span class="badge text-bg-danger badge-status">
                <i class="fas fa-exclamation-circle me-1"></i>Outdated
            </span>`;
    }

    return `
        <span class="badge text-bg-success badge-status">
            <i class="fas fa-check-circle me-1"></i>Up to date
        </span>`;
}



// ===============================
// DATE FORMATTER
// ===============================
function formatDate(str) {
    if (!str) return "-";
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleString();
}

function formatDateEU(d) {
    if (!d) return "-";
    const dt = new Date(d);

    const day = dt.getDate().toString().padStart(2, "0");
    const month = (dt.getMonth() + 1).toString().padStart(2, "0");
    const year = dt.getFullYear();

    const hours = dt.getHours().toString().padStart(2, "0");
    const minutes = dt.getMinutes().toString().padStart(2, "0");
    const seconds = dt.getSeconds().toString().padStart(2, "0");

    return `${day}.${month}.${year}. ${hours}:${minutes}:${seconds}`;
}


// ===============================
// IMAGE MODAL
// ===============================
function openImageModal(image) {
    if (!image) return;

    const latest = image.latest || {};

    document.getElementById("imageModalTitle").textContent = "Image details: " + normalizeName(image.name);

    // Build Labels block
    let labelsHTML = "-";

    if (latest.labels && typeof latest.labels === "object") {
        const items = Object.entries(latest.labels)
            .map(([key, val]) => `
                <dt class="col-sm-4">${key}</dt>
                <dd class="col-sm-8">${val}</dd>
            `)
            .join("");

        labelsHTML = `
            <a href="#" id="toggleLabels" class="text-primary" style="font-size:14px;">
                Show / Hide Labels
            </a>

            <div id="labelsBlock" style="display:none; margin-top:10px;">
                <dl class="row mb-0">
                    ${items}
                </dl>
            </div>
        `;
    }

    const body = `
        <dl class="row">
            <dt class="col-sm-3">Name</dt>
            <dd class="col-sm-9">${image.name || "-"}</dd>

            <dt class="col-sm-3">Tag</dt>
            <dd class="col-sm-9">${latest.tag || "-"}</dd>

            <dt class="col-sm-3">Platform</dt>
            <dd class="col-sm-9">${latest.platform || "-"}</dd>

            <dt class="col-sm-3">Digest</dt>
            <dd class="col-sm-9"><code>${latest.digest || "-"}</code></dd>

            <dt class="col-sm-3">Status</dt>
            <dd class="col-sm-9">${renderStatusBadge(latest.digest || "")}</dd>

            <dt class="col-sm-3">Created</dt>
            <dd class="col-sm-9">${formatDateEU(latest.created)}</dd>

            <dt class="col-sm-3">Labels</dt>
            <dd class="col-sm-9">${labelsHTML}</dd>
        </dl>
    `;

    document.getElementById("imageModalBody").innerHTML = body;

    const toggle = document.getElementById("toggleLabels");
    if (toggle) {
        toggle.addEventListener("click", e => {
            e.preventDefault();
            const block = document.getElementById("labelsBlock");
            block.style.display = block.style.display === "none" ? "block" : "none";
        });
    }

    const modal = new bootstrap.Modal(document.getElementById("imageModal"));
    modal.show();

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
