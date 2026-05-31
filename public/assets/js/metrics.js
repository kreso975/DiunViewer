import { log, formatDateEU } from "./utils.js";
import { store } from "./globals.js";

// ======================================================
// DIUN METRICS PARSER (FULL COVERAGE)
// ======================================================

// Global parsed metrics object
export let DIUN_METRICS = {
    raw: "",            // full raw text
    build: {},          // diun_build_info
    watch: {},          // diun_watch_* metrics
    images: {},         // per-image metrics
    go: {},             // Go runtime metrics
    process: {},        // process_* metrics
    other: {}           // anything else
};

// ======================================================
// MAIN PARSER
// ======================================================

export function parseDiunMetrics(text) {
    DIUN_METRICS = {
        raw: text,
        build: {},
        watch: {},
        images: {},
        go: {},
        process: {},
        other: {}
    };

    const lines = text.split("\n");

    for (const line of lines) {
        if (!line || line.startsWith("#")) continue;

        const parts = line.trim().split(" ");
        if (parts.length < 2) continue;

        const metric = parts[0];
        const value = parseFloat(parts[parts.length - 1]);

        const labels = extractLabels(metric);
        const name = metric.split("{")[0];

        if (name === "diun_build_info") {
            DIUN_METRICS.build = labels;
            continue;
        }

        if (name.startsWith("diun_watch_")) {
            DIUN_METRICS.watch[name] = { labels, value };
            continue;
        }

        if (name.startsWith("diun_image_")) {
            const img = labels.image || "unknown";

            if (!DIUN_METRICS.images[img]) {
                DIUN_METRICS.images[img] = {};
            }

            DIUN_METRICS.images[img][name] = { labels, value };
            continue;
        }

        if (name.startsWith("go_")) {
            DIUN_METRICS.go[name] = { labels, value };
            continue;
        }

        if (name.startsWith("process_")) {
            DIUN_METRICS.process[name] = { labels, value };
            continue;
        }

        DIUN_METRICS.other[name] = { labels, value };
    }

    return DIUN_METRICS;
}

export async function loadDiunMetrics() {
    const text = await fetch(store.METRICS_URL).then(r => r.text());
    parseDiunMetrics(text);
}

// ======================================================
// HELPERS
// ======================================================

function extractLabels(metric) {
    const out = {};
    const match = metric.match(/\{(.+?)\}/);

    if (!match) return out;

    const labelString = match[1];
    const pairs = labelString.split(",");

    for (const p of pairs) {
        const [key, val] = p.split("=");
        out[key] = val.replace(/"/g, "");
    }

    return out;
}

export function injectDiunMetricsHTML() {
    const html = `
        <div class="row g-3">

            <!-- BUILD -->
            <div class="col-md-3">
                <div class="small-box text-bg-primary hover-hand">
                    <div class="inner">
                        <h3 id="metrics-build-title">Build</h3>
                        <div id="metrics-build-extra" class="small-box-extra"></div>
                    </div>
                    <i class="bi bi-gear-fill small-box-icon"></i>
                    <a class="small-box-footer">Build</a>
                </div>
            </div>

            <!-- WATCH -->
            <div class="col-md-3">
                <div class="small-box text-bg-success hover-hand">
                    <div class="inner">
                        <h3 id="metrics-watch-title">Watch</h3>
                        <div id="metrics-watch-extra" class="small-box-extra"></div>
                    </div>
                    <i class="bi bi-arrow-repeat small-box-icon"></i>
                    <a class="small-box-footer">Watch</a>
                </div>
            </div>

            <!-- IMAGES -->
            <div class="col-md-3">
                <div class="small-box text-bg-warning hover-hand">
                    <div class="inner" style="color:#444">
                        <h3 id="metrics-images-title">Images</h3>
                        <div id="metrics-images-extra" class="small-box-extra"></div>
                    </div>
                    <i class="bi bi-images small-box-icon"></i>
                    <a class="small-box-footer">Images</a>
                </div>
            </div>

            <!-- RUNTIME -->
            <div class="col-md-3">
                <div class="small-box text-bg-info hover-hand">
                    <div class="inner" style="color:#444">
                        <h3 id="metrics-runtime-title">Runtime</h3>
                        <div id="metrics-runtime-extra" class="small-box-extra"></div>
                    </div>
                    <i class="bi bi-cpu-fill small-box-icon"></i>
                    <a class="small-box-footer">Runtime</a>
                </div>
            </div>

        </div>
    `;

    document.getElementById("page-diun-metrics").innerHTML = html;
}

export function renderDiunMetricsCards() {

    const b = DIUN_METRICS.build;
    const w = DIUN_METRICS.watch;
    const images = DIUN_METRICS.images;
    const go = DIUN_METRICS.go;
    const proc = DIUN_METRICS.process;

    //
    // BUILD
    //
    document.getElementById("metrics-build-extra").innerHTML = `
        <b>Version:</b> ${b.version || "-"}<br>
        <b>Go:</b> ${go.go_info?.labels?.version || "-"}<br>
        <b>Uptime:</b> ${((Date.now()/1000 - proc.process_start_time_seconds?.value)/3600).toFixed(1)}h
    `;


    //
    // WATCH
    //
    const lastRun = w.diun_watch_last_run_timestamp_seconds?.value || 0;

    document.getElementById("metrics-watch-extra").innerHTML = `
        <b>Runs:</b> ${w.diun_watch_runs_total?.value || 0}<br>
        <b>Last run:</b> ${formatDateEU(lastRun)}<br>
        <b>Duration:</b> ${w.diun_watch_last_run_duration_seconds?.value?.toFixed(2)}s
    `;


    //
    // IMAGES
    //
    const imgCount = Object.keys(images).length;

    let updates = 0;
    let errors = 0;

    for (const img of Object.values(images)) {
        if (img.diun_image_update_available?.value === 1) updates++;
        if (img.diun_image_last_check_status?.error?.value === 1) errors++;
    }

    document.getElementById("metrics-images-extra").innerHTML = `
        <b>Total:</b> ${imgCount}<br>
        <b>Updates:</b> ${updates}<br>
        <b>Errors:</b> ${errors}
    `;


    //
    // RUNTIME
    //
    const memMb = ((go.go_memstats_alloc_bytes?.value || 0) / 1024 / 1024).toFixed(1);

    document.getElementById("metrics-runtime-extra").innerHTML = `
        <b>Memory:</b> ${memMb} MB<br>
        <b>Goroutines:</b> ${go.go_goroutines?.value || 0}<br>
        <b>CPU:</b> ${proc.process_cpu_seconds_total?.value || 0}s
    `;
}
