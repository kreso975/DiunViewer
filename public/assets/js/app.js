// LOGLEVEL: 0=none, 1=error, 2=warn, 3=info, 4=debug
let LOGLEVEL = 3; // default: info

function log(level, ...args) {
    const levels = { error:1, warn:2, info:3, debug:4 };
    if (LOGLEVEL >= levels[level]) {
        console[level](...args);
    }
}


// ===============================
// GLOBAL IMAGE CACHE
// ===============================
let IMAGES_DB = [];
let EVENTS_DB = [];
let DIUN_DB = [];

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    setupNav();

    // MUST load events first
    await loadEvents();
    updateUnreadMessages(EVENTS_DB.length);

    // THEN load DIUN images
    await loadDiunImages();

    // THEN load images
    await loadImages();

    attachDeleteHandlers();

    const REFRESH_MINUTES = 5;
    setInterval(async () => {
        await loadEvents();
        updateUnreadMessages(EVENTS_DB.length);

        await loadDiunImages();
        await loadImages();
    }, REFRESH_MINUTES * 60 * 1000);

    document.getElementById("imageModal").addEventListener("hide.bs.modal", () => {
        document.activeElement.blur();
    });

    document.getElementById("refresh-images").addEventListener("click", async () => {
        const btn = document.getElementById("refresh-images");

        btn.disabled = true;
        btn.classList.add("loading");

        // artificial delay so spinner is visible
        await new Promise(r => setTimeout(r, 300));

        await loadImages();

        btn.disabled = false;
        btn.classList.remove("loading");
    });

    document.getElementById("refresh-diun-images").addEventListener("click", async () => {
        const btn = document.getElementById("refresh-diun-images");

        btn.disabled = true;
        btn.classList.add("loading");

        // artificial delay so spinner is visible
        await new Promise(r => setTimeout(r, 300));

        await loadDiunImages();

        btn.disabled = false;
        btn.classList.remove("loading");
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
            updateUnreadMessages(EVENTS_DB.length);
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
            updateUnreadMessages(EVENTS_DB.length);
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
            document.getElementById("page-diun-images").style.display = (page === "page-diun-images") ? "" : "none";
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

function DockerImageNormalizer(x) {

    const hasTags = x.RepoTags && x.RepoTags.length > 0;
    const hasDigests = x.RepoDigests && x.RepoDigests.length > 0;

    // 1) Determine fullTag
    const fullTag = hasTags ? x.RepoTags[0] : "&lt;none&gt;";

    // 2) Determine name + tag
    let name = "&lt;none&gt;";
    let tag = "&lt;none&gt;";

    if (hasTags) {
        // normal case: repo:tag
        const parts = fullTag.split(":");
        name = parts[0];
        tag = parts[1] || "&lt;none&gt;";
    } else if (hasDigests) {
        // fallback: extract name from digest
        // example: "homebridge/homebridge@sha256:416d1de..."
        const digestEntry = x.RepoDigests[0];
        name = digestEntry.split("@")[0];   // homebridge/homebridge
        tag = "&lt;none&gt;";
    }

    // 3) Extract digest hash
    let digest = "";
    if (hasDigests) {
        const digestEntry = x.RepoDigests[0];
        digest = digestEntry.split("@")[1] || "";
    }

    return {
        docker: x,

        name,          // normalized name
        tag,           // normalized tag
        fullTag,       // "<none>" or "repo:tag"
        digest: x.Id,  // docker image ID
        repoDigest: hasDigests ? x.RepoDigests[0] : null,
        created: x.Created,

        repoTags: x.RepoTags,
        repoDigests: x.RepoDigests
    };
}

// ===============================
// LOAD Diun IMAGES
// ===============================
async function loadDiunImages() {
    try {
        const r = await fetch("/api/diunImages");
        const data = await r.json();

        // FIX: normalize DIUN images
        DIUN_DB = data.images.map(DIUNImageNormalizer);
        renderDiunImagesTable();
        console.log("Loaded DIUN images:", DIUN_DB.length);
    } catch (err) { 
        console.error("API /diunImages error:", err);
    }
}

function DIUNImageNormalizer(x) {
    return {
        name: x.name,                     // "docker.io/homebridge/homebridge"
        tag: x.latest?.tag || "",
        digest: x.latest?.digest?.split(":")[1] || "",
        created: x.latest?.created || "",
        raw: x
    };
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

function EventsNormalizer(e) {

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


// ===============================
// RENDER IMAGES TABLE
// ===============================
function renderImagesTable(data) {

    const tableData = data.map(DockerImageNormalizer);

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
                    `<a href="#" class="image-link" data-image="${row.fullTag}">${d}</a>`
            },
            { data: "tag", render: d => `<code>${d}</code>` },
            { data: "digest", render: d => `<code>${d}</code>` },
            { data: "repoTags", render: (d, t, row) => renderStatusBadge(row.repoTags) },
            { data: "created", render: d => formatDateEU(d) }
        ],

        initComplete: () => {
            $("#images")
                .off("click", ".image-link")
                .on("click", ".image-link", function (e) {
                    e.preventDefault();

                    const fullTag = this.getAttribute("data-image");
                    const row = tableData.find(x => x.fullTag === fullTag);

                    if (row && row.docker) {
                        openImageModal(row.docker);
                    }
                });
        }
    });
}

function renderEventsTable(data) {

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

// ===============================
// RENDER DIUN IMAGES TABLE
// ===============================
function renderDiunImagesTable() {

    log("debug", "📄 renderDiunImagesTable() called");

    if (!Array.isArray(DIUN_DB)) {
        log("error", "❌ DIUN_DB is NOT an array:", DIUN_DB);
        return;
    }

    log("debug", `📦 DIUN_DB entries: ${DIUN_DB.length}`);

    if (DIUN_DB.length === 0) {
        log("warn", "⚠️ DIUN_DB is empty → table will render with no rows");
    } else {
        log("debug", "🔎 First DIUN entry:", DIUN_DB[0]);
    }

    const tableData = DIUN_DB;

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

function matchUpdates(dockerImageName) {

    log("debug", "🔍 matchUpdates");

    if (Array.isArray(dockerImageName)) {
        log("debug", "dockerImageName was array, using:", dockerImageName[0]);
        dockerImageName = dockerImageName[0] || "";
    }

    log("debug", "Input dockerImageName (raw):", dockerImageName);

    const base = stripTag(normalizeImageName(dockerImageName));
    log("debug", "🟦 Normalized base name:", base);

    // DEBUG: SHOW WHAT DIUN_DB ACTUALLY CONTAINS
    log("debug", "🔎 DIUN_DB entries (normalized):");
    DIUN_DB.forEach(d => {
        const diunBase = stripTag(normalizeImageName(d.name));
        log("debug", "   →", diunBase);
    });

    // find docker image object
    const docker = IMAGES_DB.find(img => {
        const tag = img.RepoTags?.[0] || "";
        return stripTag(normalizeImageName(tag)) === base;
    });

    log("debug", "🟦 Docker match:", docker ? docker.RepoTags : "❌ none");

    if (!docker) {
        log("info", "❌ No docker image found → return 0");
        console.groupEnd();
        return 0;
    }

    // find DIUN entry
    const diun = DIUN_DB.find(d => {
        const diunBase = stripTag(normalizeImageName(d.name));
        return diunBase === base;
    });

    log("debug", "🟩 DIUN match:", diun ? diun.name : "❌ no match");

    if (!diun) {
        log("debug", "❌ No DIUN entry found → return 0");
        console.groupEnd();
        return 0;
    }

    const localDigest = docker.RepoDigests?.[0]
        ?.split("@")[1]
        ?.replace("sha256:", "") || "";

    log("debug", "🟦 Local digest:", localDigest || "❌ none");

    const remoteDigest =
        diun.digest ||
        diun.latest?.digest?.replace("sha256:", "") ||
        "";

    log("debug", "🟩 Remote digest:", remoteDigest || "❌ none");

    if (!localDigest || !remoteDigest) {
        log("warn", "❌ Missing digest(s) → return 0");
        console.groupEnd();
        return 0;
    }

    log("debug", "🟥 COMPARE:", `"${localDigest}"`, "vs", `"${remoteDigest}"`);

    const match = localDigest === remoteDigest;

    log("debug", "➡️ RESULT:", match ? "✔ MATCH (true)" : "✘ DIFFERENT (0)");
    console.groupEnd();

    return match ? true : 0;
}

// ===============================
// STATUS BADGE
// ===============================
function renderStatusBadge(imageName) {

    const result = matchUpdates(imageName);

    if (result === true) {
        return `
            <span class="badge text-bg-success badge-status">
                <i class="fas fa-check-circle me-1"></i>Up to date
            </span>`;
    }

    return `
        <span class="badge text-bg-danger badge-status">
            <i class="fas fa-exclamation-circle me-1"></i>Outdated
        </span>`;
}


// ===============================
// NORMALIZATION
// ===============================
function normalizeImageName(name) {
    if (!name) return "";

    name = name.toLowerCase().trim();

    // REMOVE REGISTRY PREFIXES
    name = name.replace(/^docker\.io\//, "");
    name = name.replace(/^ghcr\.io\//, "");
    name = name.replace(/^quay\.io\//, "");

    // REMOVE DOCKER HUB OFFICIAL IMAGE PREFIX
    name = name.replace(/^library\//, "");

    // REMOVE DIGEST
    name = name.split("@")[0];

    return name;
}

// Remove :tag from image names
function stripTag(name) {
    return name.split(":")[0];
}

// ===============================
// DATE FORMATTER
// ===============================
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
            <a href="#" id="toggleLabels" class="text-primary">
                <i class="fas fa-tags me-1"></i> Show / Hide Labels
            </a>

            <div id="labelsBlock" style="display:none;">
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

function updateUnreadMessages(count) {
    const badge = document.getElementById("messages-count");

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove("d-none");
    } else {
        badge.classList.add("d-none");
    }
}

