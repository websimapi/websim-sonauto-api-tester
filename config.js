// Configuration for the Sonauto API Tester

export const API_BASE_URL = 'https://api.sonauto.ai/v1';

// List of CORS proxies to try if direct access fails.
// Add more proxies here if needed.
// The format determines how the target URL is appended:
// - Ends with '/': Target URL is appended directly (e.g., proxy/target)
// - Ends with '?': Target URL is appended directly (e.g., proxy?target)
// - Ends with 'url=': Target URL is URI encoded and appended (e.g., proxy?url=encodedTarget)
// - Ends with 'quest=': Target URL is URI encoded and appended (e.g., proxy?quest=encodedTarget)
export const CORS_PROXIES = [
    // Prioritize proxies potentially supporting POST:
    'https://thingproxy.freeboard.io/fetch/', // New attempt, path-based
    'https://api.cors.lol/?url=', // Failed POST with 405 before, but maybe works for GET? Keep for status checks.
    'https://proxy.cors.sh/', // Path-based style, often rate-limited or blocked for POST. Keep as last resort.
    // Proxies known to fail or be GET-only:
    // 'https://corsproxy.io/?', // Failed preflight for POST
    // 'https://api.codetabs.com/v1/proxy?quest=', // Only supports GET requests
    // 'https://everyorigin.jwvbremen.nl/get?url=', // Likely GET only
    // 'https://api.allorigins.win/get?url=', // Likely GET only
    // 'https://crossorigin.me/', // Stability issues mentioned
];

// Other potential configurations can be added here, e.g., default values, polling intervals etc.
export const POLLING_INTERVAL_MS = 5000; // 5 seconds