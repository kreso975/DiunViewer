import { store } from "./globals.js";

export function log(level, ...args) {
    const levels = { error:1, warn:2, info:3, debug:4 };
    if (store.LOGLEVEL >= levels[level]) {
        console[level](...args);
    }
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