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
    // 'https://corsproxy.io/?', // Seems to fail preflight for POST often
    'https://api.cors.lol/?url=', // Seems more permissive for POST
    'https://proxy.cors.sh/', // Path-based style, might require API key for POST now or be rate-limited. Keep as fallback.
    // 'https://api.codetabs.com/v1/proxy?quest=', // Only supports GET requests
];

// Other potential configurations can be added here, e.g., default values, polling intervals etc.
export const POLLING_INTERVAL_MS = 5000; // 5 seconds