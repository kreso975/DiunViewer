class Store {
    IMAGES_DB = [];
    EVENTS_DB = [];
    DIUN_DB = [];
    DIUN_METRICS_ENABLED = false;
    LOGLEVEL = 3;
    METRICS_URL = "https://diun.home/metrics";
    
    enableMetrics() {
        this.DIUN_METRICS_ENABLED = true;
    }
}

export const store = new Store();
