import { log, formatDateEU } from "./app.js";

export async function loadHealth() {
    try {
        const r = await fetch("/api/health");
        return await r.json();
    } catch (err) {
        console.error("Healthcheck failed:", err);
        return { health: "unhealthy", metrics: "disabled" };
    }
}

export function updateHealthBadge(services) {
    const badge = document.getElementById("status-badge");
    const panel = document.getElementById("health-panel-content");

    let hasUnhealthy = false;
    let hasUnknown = false;

    for (const svc of services) {
        if (svc.status === "unhealthy") hasUnhealthy = true;
        if (svc.status === "unknown") hasUnknown = true;
    }

    let text = "Online";
    let color = "bg-success";

    if (hasUnhealthy) color = "bg-danger";
    else if (hasUnknown) color = "bg-warning";

    badge.className = "badge " + color;
    badge.textContent = text;

    let html = "";
    for (const svc of services) {
        const name = svc.name || "diun";
        const status = svc.status;

        let statusColor = "bg-secondary";
        if (status === "healthy") statusColor = "bg-success";
        else if (status === "unhealthy") statusColor = "bg-danger";
        else if (status === "unknown") statusColor = "bg-warning";

        html += `
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span>${name}</span>
                <span class="badge ${statusColor}">${status}</span>
            </div>
        `;
    }

    panel.innerHTML = html;
}
