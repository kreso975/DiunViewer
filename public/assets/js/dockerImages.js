import { log, formatDateEU } from "./utils.js";
import { store } from "./globals.js";

// ===============================
// LOAD IMAGES
// ===============================
export async function loadImages() {
    try {
        const r = await fetch("/api/images");
        const data = await r.json();

        store.IMAGES_DB.length = 0;       // keep reference intact
        store.IMAGES_DB.push(...data);    // update array in-place

        // Delay DataTables so IMAGES_DB is fully ready
        setTimeout(() => renderImagesTable(store.IMAGES_DB), 0);
    } catch (err) { 
        console.error("API /images error:", err);
    }
}

// ===============================
// NORMALIZER
// ===============================
export function DockerImageNormalizer(x) {

    const hasTags = x.RepoTags && x.RepoTags.length > 0;
    const hasDigests = x.RepoDigests && x.RepoDigests.length > 0;

    const fullTag = hasTags ? x.RepoTags[0] : "&lt;none&gt;";

    let name = "&lt;none&gt;";
    let tag = "&lt;none&gt;";

    if (hasTags) {
        const parts = fullTag.split(":");
        name = parts[0];
        tag = parts[1] || "&lt;none&gt;";
    } else if (hasDigests) {
        const digestEntry = x.RepoDigests[0];
        name = digestEntry.split("@")[0];
        tag = "&lt;none&gt;";
    }

    let digest = "";
    if (hasDigests) {
        const digestEntry = x.RepoDigests[0];
        digest = digestEntry.split("@")[1] || "";
    }

    return {
        docker: x,

        name,
        tag,
        fullTag,
        digest: x.Id,
        repoDigest: hasDigests ? x.RepoDigests[0] : null,
        created: x.Created,

        repoTags: x.RepoTags,
        repoDigests: x.RepoDigests
    };
}

// ===============================
// RENDER IMAGES TABLE
// ===============================
export function renderImagesTable(data) {

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
            // IMAGE DETAILS MODAL
            $("#images")
                .off("click", ".image-link")
                .on("click", ".image-link", function (e) {
                    e.preventDefault();

                    const fullTag = this.getAttribute("data-image");
                    const row = tableData.find(x => x.fullTag === fullTag);

                    if (row && row.docker) {
                        openImageModal(row.docker);   // ← THIS WAS NOT FIRING ANYMORE
                    }
                });

            // RELEASE TAGS MODAL
            $("#images")
                .off("click", ".release-tags-link")
                .on("click", ".release-tags-link", async function (e) {
                    e.preventDefault();

                    const imageName = this.getAttribute("data-image");
                    const html = await fetchReleaseNotesHTML(imageName);

                    document.getElementById("releaseTagsModalBody").innerHTML = html;

                    const modal = new bootstrap.Modal(
                        document.getElementById("releaseTagsModal")
                    );
                    modal.show();
                });
        }
    });
}


// ===============================
// IMAGE MODAL
// ===============================
export function openImageModal(image) {
    if (!image) return;

    // Extract tag
    const tagFull = Array.isArray(image.RepoTags) && image.RepoTags.length > 0
        ? image.RepoTags[0]               // "postgres:15"
        : "<none>";

    const [repoName, tag] = tagFull.includes(":")
        ? tagFull.split(":")
        : [tagFull, ""];

    // Extract digest
    const digest = Array.isArray(image.RepoDigests) && image.RepoDigests.length > 0
        ? image.RepoDigests[0]            // "postgres@sha256:..."
        : "";

    // Extract labels
    const labels = image.Labels || {};

    // OCI title + version
    const ociTitle = labels["org.opencontainers.image.title"] || "";
    const ociVersion = labels["org.opencontainers.image.version"] || "";

    // Name: use Title, fallback to repo name
    const name = ociTitle || repoName;

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
            <dt class="col-sm-3">Repo Name</dt>
            <dd class="col-sm-9">${repoName}</dd>

            <dt class="col-sm-3">Tag</dt>
            <dd class="col-sm-9">${tag}</dd>

            <dt class="col-sm-3">Version</dt>
            <dd class="col-sm-9">${ociVersion || "-"}</dd>

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
        name;

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

export function matchUpdates(dockerImageName) {

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
    store.DIUN_DB.forEach(d => {
        const diunBase = stripTag(normalizeImageName(d.name));
        log("debug", "   →", diunBase);
    });

    // find docker image object
    const docker = store.IMAGES_DB.find(img => {
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
    const diun = store.DIUN_DB.find(d => {
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
export function renderStatusBadge(imageName) {
    const result = matchUpdates(imageName);

    if (result === true) {
        return `
            <span class="badge text-bg-success badge-status">
                <i class="fas fa-check-circle me-1"></i>Up to date
            </span>`;
    }

    return `
        <a href="#" class="badge text-bg-danger badge-status release-tags-link"
           data-image="${imageName}">
            <i class="fas fa-exclamation-circle me-1"></i>Outdated
        </a>`;
}


// Remove :tag from image names
export function stripTag(name) {
    return name.split(":")[0];
}

// ===============================
// NORMALIZATION
// ===============================
export function normalizeImageName(name) {
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

async function fetchReleaseNotesHTML(imageName) {
    // 1. find docker image object
    const docker = store.IMAGES_DB.find(img =>
        (img.RepoTags?.[0] || "").includes(imageName)
    );

    if (!docker) return "<p>No image found.</p>";

    // 2. extract GitHub repo
    const source = docker.Labels["org.opencontainers.image.source"];
    if (!source) return "<p>No source label.</p>";

    let repo = normalizeRepo(source);
    if (!repo) return "<p>Invalid GitHub repo.</p>";


    // 3. get latest release metadata
    const latest = await fetch(`https://api.github.com/repos/${repo}/releases/latest`)
        .then(r => r.json());

    const tag = latest.tag_name;
    if (!tag) return "<p>No latest release found.</p>";

    // 4. fetch release notes for that tag
    const full = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`)
        .then(r => r.json());

    const notes = full.body || "No release notes.";

    return `
        <h5>${repo} — ${tag}</h5>
        <hr>
        <pre style="white-space: pre-wrap;">${notes}</pre>
    `;
}

function normalizeRepo(source) {
    if (!source) return null;

    // remove git+, .git, etc.
    source = source
        .replace("git+", "")
        .replace(".git", "")
        .replace("https://github.com/", "")
        .replace("http://github.com/", "")
        .replace("www.github.com/", "");

    // if it contains github.com/.../... keep only owner/repo
    const m = source.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (m) return `${m[1]}/${m[2]}`;

    // fallback: if format is owner/repo
    if (/^[^/]+\/[^/]+$/.test(source)) return source;

    return null;
}
