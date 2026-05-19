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
        IMAGES_DB = data;
        renderImagesTable(IMAGES_DB);
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
    const tableData = data.map(x => {

    // LOG ONLY when RepoTags is empty
        if (!Array.isArray(x.RepoTags) || x.RepoTags.length === 0) {
            console.warn("EMPTY RepoTags detected:", {
                id: x.Id,
                repoTags: x.RepoTags,
                repoDigests: x.RepoDigests
            });
        }

        // 1) Determine tag or fallback to RepoDigest
        let tag;

        if (Array.isArray(x.RepoTags) && x.RepoTags.length > 0) {
            tag = x.RepoTags[0];
        } else if (Array.isArray(x.RepoDigests) && x.RepoDigests.length > 0) {
            const digestEntry = x.RepoDigests[0];
            tag = digestEntry.split("@")[0];
        } else {
            tag = "<none>";
        }

        // 2) Extract digest from RepoDigests
        let digest = "";
        if (Array.isArray(x.RepoDigests) && x.RepoDigests.length > 0) {
            digest = x.RepoDigests[0].split("@")[1] || "";
        }

        // 3) Status: RepoTags or "<none>"
        const checkTags = (
            Array.isArray(x.RepoTags) && x.RepoTags.length > 0
        )
            ? tag.split(":")[1]
            : "&lt;none&gt;";


        return {
            docker: x,
            name: tag.split(":")[0],
            originalName: tag,
            tag: checkTags,
            digest: x.Id,
            status: x.RepoTags,
            created: x.Created
        };
    });
        

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
                const row = tableData.find(x => x.originalName === name);
                
                if (row && row.docker) {
                    openImageModal(row.docker);
                }
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
function renderStatusBadge(imageName) {

    //console.group("STATUS CHECK");
    //console.log("Docker raw imageName:", imageName);

    // FIX: handle array input
    if (Array.isArray(imageName)) {
        //console.log("Image name was array, using first element:", imageName[0]);
        imageName = imageName[0];
    }

    //console.log("Docker imageName (string):", imageName);

    const cleanDockerName = normalizeImageName(imageName);
    //console.log("Normalized Docker name:", cleanDockerName);

    const matches = EVENTS_DB
        .filter(ev => {
            const eventName = normalizeImageName(ev.image.split("@")[0]);
            //console.log("Comparing with DIUN event image:", eventName);
            return eventName === cleanDockerName;
        })
        .map(ev => ({
            eventDigest: ev.digest,
            eventId: ev._id,
            created: ev.created
        }));

    //console.log("Matches found:", matches.length, matches);
    //console.groupEnd();

    const hasEvent = matches.length > 0;

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
// NORMALIZATION
// ===============================
function normalizeImageName(name) {
    if (!name || typeof name !== "string") {
        console.warn("normalizeImageName: invalid input:", name);
        return "";
    }

    return name
        .replace(/^docker\.io\//, "")
        .replace(/^index\.docker\.io\//, "")
        .replace(/^registry-1\.docker\.io\//, "");
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


// ===============================
// IMAGE MODAL
// ===============================
function openImageModal(image) {
    if (!image) return;

    // Extract tag
    const tagFull = Array.isArray(image.RepoTags) && image.RepoTags.length > 0
        ? image.RepoTags[0]               // "postgres:15"
        : "<none>";

    const [name, tag] = tagFull.includes(":")
        ? tagFull.split(":")
        : [tagFull, ""];

    // Extract digest
    const digest = Array.isArray(image.RepoDigests) && image.RepoDigests.length > 0
        ? image.RepoDigests[0]            // "postgres@sha256:..."
        : "";

    // Extract labels
    const labels = image.Labels || {};

    // Build labels HTML
    let labelsHTML = "-";
    if (labels && typeof labels === "object" && Object.keys(labels).length > 0) {
        const items = Object.entries(labels)
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

    // Build modal body
    const body = `
        <dl class="row">
            <dt class="col-sm-3">Name</dt>
            <dd class="col-sm-9">${name}</dd>

            <dt class="col-sm-3">Tag</dt>
            <dd class="col-sm-9">${tag}</dd>

            <dt class="col-sm-3">Digest</dt>
            <dd class="col-sm-9"><code>${digest || "-"}</code></dd>

            <dt class="col-sm-3">Image ID</dt>
            <dd class="col-sm-9"><code>${image.Id}</code></dd>

            <dt class="col-sm-3">Status</dt>
            <dd class="col-sm-9">${renderStatusBadge(image.RepoTags)}</dd>

            <dt class="col-sm-3">Created</dt>
            <dd class="col-sm-9">${formatDateEU(image.Created)}</dd>

            <dt class="col-sm-3">Size</dt>
            <dd class="col-sm-9">${(image.Size / 1024 / 1024).toFixed(1)} MB</dd>

            <dt class="col-sm-3">Labels</dt>
            <dd class="col-sm-9">${labelsHTML}</dd>
        </dl>
    `;

    document.getElementById("imageModalTitle").textContent =
        "Image details: " + name;

    document.getElementById("imageModalBody").innerHTML = body;

    // Toggle labels
    const toggle = document.getElementById("toggleLabels");
    if (toggle) {
        toggle.addEventListener("click", e => {
            e.preventDefault();
            const block = document.getElementById("labelsBlock");
            block.style.display = block.style.display === "none" ? "block" : "none";
        });
    }

    new bootstrap.Modal(document.getElementById("imageModal")).show();
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
