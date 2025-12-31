function logInfo(message) {
    console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
}

function logWarning(message) {
    console.warn(`[WARNING] ${new Date().toISOString()}: ${message}`);
}

function logError(message) {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
}

function logRunSummary(summary) {
    console.log(`[SUMMARY] ${new Date().toISOString()}: ${JSON.stringify(summary)}`);
}

export { logInfo, logWarning, logError, logRunSummary };