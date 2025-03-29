// Configuration for the Sonauto API Tester

export const API_BASE_URL = 'https://api.sonauto.ai/v1';

// List of CORS proxies to try if direct access fails.
// Add more proxies here if needed.
// Proxies should be prepended to the API_BASE_URL.
export const CORS_PROXIES = [
    'https://corsproxy.io/?', // Simple query param style
    'https://proxy.cors.sh/', // Path-based style
    // 'https://cors-anywhere.herokuapp.com/', // Often rate-limited or requires activation
];

// Other potential configurations can be added here, e.g., default values, polling intervals etc.