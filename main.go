package main

import (
	"bufio"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

var logLevel = "INFO"
var cfg map[string]string
var eventsFile string
var diunBinary string

type RawEvent map[string]interface{}

var (
	eventStore []RawEvent
)

func main() {
	cfg = loadConfigFile("/tools/diunViewer.cfg")

	// LOG LEVEL
	if lvl, ok := cfg["LOG_LEVEL"]; ok {
		logLevel = strings.ToUpper(lvl)
	} else {
		logLevel = "INFO"
	}
	logInfo("LOG_LEVEL set to %s", logLevel)

	// REQUIRED CONFIG VALUES
	publicDir := require(cfg, "PUBLIC_DIR")
	listenPort := require(cfg, "LISTEN_PORT")
	eventsFile = require(cfg, "EVENTS_FILE")
	diunBinary = require(cfg, "DIUN_BINARY")

	logDebug("PUBLIC_DIR=%s", publicDir)
	logDebug("LISTEN_PORT=%s", listenPort)
	logDebug("EVENTS_FILE=%s", eventsFile)
	logDebug("DIUN_BINARY=%s", diunBinary)

	loadEventsFromFile()

	http.HandleFunc("/api/images", handleImages)
	http.HandleFunc("/api/events", handleEvents)
	http.HandleFunc("/api/diunImages", handleDiunImages)
	http.HandleFunc("/api/events/delete", handleDeleteEvents)
	http.HandleFunc("/api/diun-webhook", handleDiunWebhook)

	fs := http.FileServer(http.Dir(publicDir))
	http.Handle("/", fs)

	logInfo("DIUN Webserver running on %s", listenPort)
	log.Fatal(http.ListenAndServe(":"+listenPort, nil))
}

func logInfo(format string, v ...interface{}) {
	if logLevel == "INFO" || logLevel == "DEBUG" {
		log.Printf("[INFO] "+format, v...)
	}
}

func logDebug(format string, v ...interface{}) {
	if logLevel == "DEBUG" {
		log.Printf("[DEBUG] "+format, v...)
	}
}

func logWarn(format string, v ...interface{}) {
	log.Printf("[WARN] "+format, v...)
}

func loadConfigFile(path string) map[string]string {
	cfg := make(map[string]string)

	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Fatalf("CONFIG ERROR: %s does not exist", path)
	}

	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("CONFIG ERROR: cannot open %s: %v", path, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		cfg[key] = val
	}

	return cfg
}

func require(cfg map[string]string, key string) string {
	v, ok := cfg[key]
	if !ok || v == "" {
		logWarn("CONFIG: missing required key %s", key)
		return ""
	}
	return v
}

// ----------------------------
// LOAD EVENTS FROM FILE
// ----------------------------
func loadEventsFromFile() {
	f, err := os.Open(eventsFile)
	if err != nil {
		logWarn("EVENTS FILE NOT FOUND (%s), starting with empty store", eventsFile)
		return
	}
	defer f.Close()

	if err := json.NewDecoder(f).Decode(&eventStore); err != nil {
		logWarn("EVENT FILE DECODE ERROR: %v", err)
		return
	}

	// Assign IDs
	for i := range eventStore {
		eventStore[i]["_id"] = i
	}

	logInfo("Loaded %d events from %s", len(eventStore), eventsFile)
	logDebug("EventStore content: %+v", eventStore)
}

// ----------------------------
// SAVE EVENTS TO FILE
// ----------------------------
func saveEventsToFile() {
	f, err := os.Create(eventsFile)
	if err != nil {
		logWarn("EVENT FILE WRITE ERROR (%s): %v", eventsFile, err)
		return
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")

	if err := enc.Encode(eventStore); err != nil {
		logWarn("EVENT FILE ENCODE ERROR (%s): %v", eventsFile, err)
		return
	}

	logInfo("Saved %d events to %s", len(eventStore), eventsFile)
	logDebug("EventStore saved content: %+v", eventStore)
}

// ----------------------------
// IMAGES (DOCKER IMAGE LIST)
// ----------------------------
func handleImages(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	logInfo("handleImages: %s %s", r.Method, r.URL.Path)

	cli, err := client.NewClientWithOpts(
		client.WithHost("unix:///var/run/docker.sock"),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		logWarn("Docker client init failed: %v", err)
		http.Error(w, err.Error(), 500)
		return
	}
	logDebug("Docker client initialized")

	images, err := cli.ImageList(
		context.Background(),
		image.ListOptions{},
	)
	if err != nil {
		logWarn("ImageList error: %v", err)
		http.Error(w, err.Error(), 500)
		return
	}

	logInfo("handleImages: returning %d images", len(images))
	logDebug("First image: %+v", func() interface{} {
		if len(images) > 0 {
			return images[0]
		}
		return "no images"
	}())

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(images); err != nil {
		logWarn("JSON encode error: %v", err)
	}

	logInfo("handleImages completed in %s", time.Since(start))
}

// ----------------------------
// IMAGES (DIUN RAW JSON)
// ----------------------------
func handleDiunImages(w http.ResponseWriter, r *http.Request) {
	logDebug("handleImages: executing %s image list --raw", diunBinary)

	cmd := exec.Command(diunBinary, "image", "list", "--raw")
	out, err := cmd.Output()

	if err != nil {
		logWarn("ERROR RUNNING DIUN (%s): %v", diunBinary, err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	logInfo("DIUN image list executed successfully (%d bytes)", len(out))
	logDebug("DIUN RAW OUTPUT: %s", string(out))

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}

// ----------------------------
// RETURN RAW EVENTS
// ----------------------------
func handleEvents(w http.ResponseWriter, r *http.Request) {
	logDebug("handleEvents: fetching current DIUN digests")

	w.Header().Set("Content-Type", "application/json")

	// Get current valid digests from DIUN
	validDigests := getCurrentImageDigests()
	if len(validDigests) == 0 {
		logWarn("handleEvents: DIUN returned zero digests, skipping cleanup")
	} else {
		logDebug("handleEvents: valid digests: %+v", validDigests)
	}

	logInfo("EVENTSTORE BEFORE CLEANUP: %d events", len(eventStore))
	for _, ev := range eventStore {
		logInfo("EVENTSTORE ITEM: id=%v digest=%v", ev["_id"], ev["digest"])
	}

	// Filter out obsolete events
	cleaned := make([]RawEvent, 0, len(eventStore))
	removed := 0

	for _, ev := range eventStore {
		digest, _ := ev["digest"].(string)
		logInfo("EVENT CHECK: id=%v digest=%s", ev["_id"], digest)
		if validDigests[digest] {
			logInfo("EVENT KEEP: id=%v digest=%s", ev["_id"], digest)
			cleaned = append(cleaned, ev)
		} else {
			logWarn("EVENT REJECT: id=%v digest=%s (not in validDigests)", ev["_id"], digest)
			removed++
		}
	}

	logInfo("EVENTSTORE AFTER CLEANUP: %d events", len(cleaned))
	for _, ev := range cleaned {
		logInfo("CLEANED ITEM: id=%v digest=%v", ev["_id"], ev["digest"])
	}

	// Cleanup happened → save file
	if removed > 0 {
		logInfo("handleEvents: cleanup removed %d obsolete events", removed)
		eventStore = cleaned
		saveEventsToFile()
	} else {
		logDebug("handleEvents: no obsolete events removed")
	}

	logInfo("EVENTSTORE RETURNING: %d events", len(eventStore))

	// Return cleaned events
	if err := json.NewEncoder(w).Encode(eventStore); err != nil {
		logWarn("handleEvents: failed to encode JSON response: %v", err)
	} else {
		logDebug("handleEvents: returned %d events", len(eventStore))
	}
}

// ----------------------------
// DELETE EVENTS
// ----------------------------
func handleDeleteEvents(w http.ResponseWriter, r *http.Request) {
	var ids []int

	// Decode request body
	if err := json.NewDecoder(r.Body).Decode(&ids); err != nil {
		logWarn("handleDeleteEvents: decode error: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	logInfo("handleDeleteEvents: delete request for IDs: %v", ids)
	logDebug("handleDeleteEvents: current eventStore size: %d", len(eventStore))

	// Case: delete ALL events
	if len(ids) == 0 {
		if len(eventStore) == 0 {
			logWarn("handleDeleteEvents: delete-all requested but no events exist")
			w.WriteHeader(http.StatusNotFound)
			return
		}

		eventStore = []RawEvent{}
		saveEventsToFile()

		logInfo("handleDeleteEvents: ALL events deleted")
		w.WriteHeader(http.StatusOK)
		return
	}

	// Case: delete specific IDs
	deleted := 0
	newEvents := make([]RawEvent, 0, len(eventStore))

	for _, ev := range eventStore {
		raw := ev["_id"]
		var id int

		switch v := raw.(type) {
		case float64:
			id = int(v)
		case int:
			id = v
		default:
			logWarn("handleDeleteEvents: event with invalid _id type: %T", raw)
			continue
		}

		if contains(ids, id) {
			deleted++
			continue
		}

		newEvents = append(newEvents, ev)
	}

	if deleted == 0 {
		logWarn("handleDeleteEvents: no events matched IDs %v", ids)
		w.WriteHeader(http.StatusNotFound)
		return
	}

	eventStore = newEvents
	saveEventsToFile()

	logInfo("handleDeleteEvents: deleted %d events", deleted)
	logDebug("handleDeleteEvents: new eventStore size: %d", len(eventStore))

	w.WriteHeader(http.StatusOK)
}

func contains(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// ----------------------------
// DIUN WEBHOOK RECEIVER
// ----------------------------
func handleDiunWebhook(w http.ResponseWriter, r *http.Request) {
	var raw RawEvent

	// Decode webhook JSON
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		logWarn("handleDiunWebhook: decode error: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Add metadata
	raw["received_at"] = time.Now().Format(time.RFC3339)
	raw["_id"] = len(eventStore)

	// Debug log full raw event
	if rawBytes, err := json.Marshal(raw); err == nil {
		logDebug("handleDiunWebhook: received raw event: %s", string(rawBytes))
	} else {
		logWarn("handleDiunWebhook: failed to marshal raw event for debug: %v", err)
	}

	// Append to store
	eventStore = append(eventStore, raw)
	saveEventsToFile()

	logInfo("handleDiunWebhook: event stored, new total: %d", len(eventStore))

	w.WriteHeader(http.StatusOK)
}

func getCurrentImageDigests() map[string]bool {
	logDebug("getCurrentImageDigests: executing %s image list --raw", diunBinary)

	cmd := exec.Command(diunBinary, "image", "list", "--raw")
	out, err := cmd.Output()
	if err != nil {
		logWarn("getCurrentImageDigests: DIUN execution error: %v", err)
		return map[string]bool{}
	}

	logDebug("getCurrentImageDigests: raw DIUN output (%d bytes)", len(out))

	var raw struct {
		Images []struct {
			Latest struct {
				Digest string `json:"digest"`
			} `json:"latest"`
		} `json:"images"`
	}

	if err := json.Unmarshal(out, &raw); err != nil {
		logWarn("getCurrentImageDigests: JSON decode error: %v", err)
		return map[string]bool{}
	}

	digests := make(map[string]bool)
	for _, img := range raw.Images {
		if img.Latest.Digest != "" {
			digests[img.Latest.Digest] = true
		}
	}

	if len(digests) == 0 {
		logWarn("getCurrentImageDigests: DIUN returned zero digests")
	} else {
		logInfo("getCurrentImageDigests: loaded %d digests", len(digests))
		logDebug("getCurrentImageDigests: digests: %+v", digests)
	}

	return digests
}
