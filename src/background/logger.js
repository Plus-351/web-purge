// Toggle verbose info logs for debugging. Keep warnings/errors active in production.
const DEBUG = false;

function logInfo(message) {
    if (!DEBUG) return;
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
}

function logWarning(message) {
    console.warn(`[WARNING] ${new Date().toISOString()}: ${message}`);
}

function logError(message) {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
}

function logRunSummary(summary) {
    if (!DEBUG) return;
    console.log(`[SUMMARY] ${new Date().toISOString()}: ${JSON.stringify(summary)}`);
}

export { logInfo, logWarning, logError, logRunSummary };