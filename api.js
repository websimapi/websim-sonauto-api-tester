import { API_BASE_URL, CORS_PROXIES, POLLING_INTERVAL_MS } from 'config';

// --- Helper Functions ---

/**
 * Constructs the full URL to try, handling different proxy formats.
 * @param {string} proxy - The proxy base URL from CORS_PROXIES.
 * @param {string} targetUrl - The original target API URL.
 * @returns {string} The full URL including the proxy.
 */
function constructProxyUrl(proxy, targetUrl) {
    // Ensure proxy URL has a trailing slash if needed for path appending
    const proxyBase = proxy.endsWith('/') ? proxy : proxy; // Keep trailing slash if present

    if (proxyBase.endsWith('/')) {
        // Path-based proxy (e.g., https://proxy.cors.sh/, https://thingproxy.freeboard.io/fetch/)
        // Remove leading slash from targetUrl if present to avoid double slash
        const cleanTargetUrl = targetUrl.startsWith('/') ? targetUrl.substring(1) : targetUrl;
        return `${proxyBase}${cleanTargetUrl}`;
    } else if (proxy.includes('?url=')) {
         // Query param 'url' (e.g., https://api.cors.lol/?url=)
         // Ensure target URL is encoded
        return `${proxyBase}${encodeURIComponent(targetUrl)}`;
    } else if (proxy.includes('?quest=')) {
         // Query param 'quest' (e.g., https://api.codetabs.com/v1/proxy?quest=)
         return `${proxyBase}${encodeURIComponent(targetUrl)}`;
    } else if (proxy.endsWith('?')) {
         // Simple query param (e.g., https://corsproxy.io/?) - Less common now
        return `${proxyBase}${targetUrl}`;
    } else {
        console.warn(`Unknown or ambiguous proxy format: ${proxy}. Assuming simple prepend.`);
        // Fallback: append target URL, hoping for the best
        return `${proxy}${targetUrl}`;
    }
}


/**
 * General purpose fetch wrapper for Sonauto API, attempting direct access
 * and falling back to CORS proxies if necessary.
 * @param {string} endpoint - API endpoint path (e.g., '/generations')
 * @param {string} method - HTTP method ('GET', 'POST', etc.)
 * @param {string} apiKey - User's API key
 * @param {object|null} body - Request body for POST/PUT requests
 * @returns {Promise<any>} - Parsed JSON response or text for status endpoint
 * @throws {Error} - Throws on network errors or non-OK HTTP status after trying all options.
 */
async function callSonautoApi(endpoint, method, apiKey, body = null) {
    const directUrl = `${API_BASE_URL}${endpoint}`;
    const urlsToTry = [
        directUrl,
        ...CORS_PROXIES.map(proxy => constructProxyUrl(proxy, directUrl)) // Construct proxy URLs correctly
    ];

    const baseHeaders = {
        'Authorization': `Bearer ${apiKey}`,
        //'X-Requested-With': 'XMLHttpRequest' // Might help some proxies, but can also cause issues
    };

    // Thingproxy explicitly mentions it *strips* Authorization headers by default.
    // It might require custom headers to pass it through, but this is non-standard.
    // Let's try adding 'X-Authorization' as a potential workaround for ThingProxy,
    // though it's unlikely to work unless ThingProxy specifically supports it.
    // Standard 'Authorization' will still be sent.
    const potentialThingProxyHeader = {
        'X-Authorization': `Bearer ${apiKey}`
    };


    let lastError = null;

    for (const url of urlsToTry) {
         console.log(`Attempting API call: ${method} ${url}`);

        const options = {
            method: method,
            headers: { ...baseHeaders }, // Start with base headers for each attempt
            // 'mode': 'cors' is the default. Do NOT set 'no-cors' as we need the response content.
            // 'cache': 'no-cache', // Might help bypass stale proxy responses, uncomment if needed
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

         // Add potential proxy-specific headers ONLY for that proxy URL
         if (url.startsWith('https://thingproxy.freeboard.io/')) {
             // Add the custom header attempt for ThingProxy
             // options.headers['X-Authorization'] = potentialThingProxyHeader['X-Authorization'];
             // Note: ThingProxy docs say it *removes* Authorization. Sending it might be futile
             // unless they have an undocumented way to pass it. Let's try standard first.
             // If standard fails, we could try commenting out the standard 'Authorization' and
             // *only* sending 'X-Authorization' for ThingProxy, but that's a long shot.
             console.log("Attempting standard Authorization header with Thingproxy.");
         }
         // Remove potential proxy-specific headers if the current URL doesn't match
         // else {
         //    delete options.headers['X-Authorization']; // Clean up if it was added previously
         // }

        try {
            const response = await fetch(url, options);

            // Log response status regardless of success/failure for debugging
            console.log(`Response Status from ${url}: ${response.status} ${response.statusText}`);


            if (!response.ok) {
                let errorData;
                const contentType = response.headers.get("content-type");
                const responseText = await response.text(); // Read text first for better debugging

                try {
                     // Attempt to parse as JSON only if content type suggests it
                    if (contentType && contentType.includes("application/json") && responseText) {
                        errorData = JSON.parse(responseText);
                    } else {
                        // Otherwise use the text directly
                         errorData = { message: responseText || `Request failed with status: ${response.status}` };
                    }
                } catch (e) {
                     // If JSON parsing failed or content type was wrong, use the text we read
                     console.warn(`Failed to parse potential JSON error response from ${url}:`, e);
                     errorData = { message: `Failed to parse error response (Status: ${response.status}). Body: ${responseText}` };
                }
                // Try to extract a meaningful message
                 const errorMessage = errorData.detail || errorData.message || 'Unknown API error';
                 // Distinguish CORS errors from API errors
                 let errorPrefix = `API Error (${response.status})`;
                 if (response.status === 0 || response.type === 'opaque' || response.type === 'error') {
                     errorPrefix = `Network/CORS Error`; // Status might be 0 for CORS block
                 }
                 // Add specific message for Thingproxy if it fails Auth
                 if (url.startsWith('https://thingproxy.freeboard.io/') && response.status === 403) { // 403 Forbidden often indicates auth issues
                    lastError = new Error(`${errorPrefix} via ${url}: ${errorMessage}. (Note: Thingproxy might strip Authorization headers)`);
                 } else {
                    lastError = new Error(`${errorPrefix} via ${url}: ${errorMessage}`);
                 }
                 console.warn(`Attempt failed: ${lastError.message}`);

                 // Don't automatically continue if it's a 4xx error from the *API* (not the proxy)
                 // e.g., 401 Unauthorized (bad key), 400 Bad Request (bad payload)
                 // These errors won't be fixed by trying another proxy.
                 // Allow 401/403 to potentially retry via proxy IF the direct call failed CORS first
                 const isDirectApiCall = url === directUrl;
                 if (isDirectApiCall && response.status >= 400 && response.status < 500) {
                      // Only stop if it's a client error from the *actual* API
                     console.error(`Received ${response.status} from direct API call, stopping proxy retries.`);
                     throw lastError;
                 }


                 if (url === urlsToTry[urlsToTry.length - 1]) {
                    throw lastError; // Throw if it's the last attempt
                 }
                 continue; // Try the next URL
            }

            // --- Handle successful response ---
            console.log(`Successfully connected via: ${url}`);
            const contentType = response.headers.get("content-type");

            // Handle plain text specifically for the status endpoint
            if (endpoint.startsWith('/generations/status/') && contentType && contentType.includes("text/plain")) {
                 return await response.text();
            }
             // If status endpoint didn't return text/plain, but was successful (2xx)
            if (endpoint.startsWith('/generations/status/') && response.ok) {
                // read as text anyway for debugging, maybe proxy wrapped it?
                const statusText = await response.text();
                console.warn(`Status endpoint ${url} returned successful status (${response.status}) but content-type ${contentType}, not text/plain. Assuming text response: ${statusText}`);
                // Attempt to return the text, hoping it's the status string
                return statusText;
            }


            // For other endpoints, expect JSON
            try {
                // Check if response is empty before trying to parse JSON
                // Clone response to read text without consuming body for JSON parsing later
                const responseClone = response.clone();
                const responseText = await responseClone.text();
                if (!responseText) {
                     console.warn(`Received empty response body from ${url}. Returning null.`);
                     return null; // Or {} depending on expected structure
                }
                return await response.json();
            } catch (e) {
                console.error(`Failed to parse JSON response from ${url}:`, e);
                // Store the error but continue to try next URL unless it's the last one
                lastError = new Error(`Received non-JSON response when JSON was expected from ${url}. Body: ${responseText.substring(0, 100)}...`); // Include snippet of body
                 console.warn(`Attempt failed: ${lastError.message}`);
                 if (url === urlsToTry[urlsToTry.length - 1]) {
                    throw lastError; // Throw if it's the last attempt
                 }
                 continue; // Try the next URL
            }

        } catch (error) {
             // Catch fetch errors (TypeError likely for CORS, network errors)
             console.warn(`Fetch/Network error for ${url}:`, error);
             // Make error message more specific if possible
             let specificMessage = error.message || 'Network error or CORS issue.';
             if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
                 // This often indicates a CORS preflight failure or network blockage
                 specificMessage = `Failed to fetch (possible CORS preflight failure or network issue): ${error.message}`;
             }
             lastError = new Error(specificMessage); // Store the error
             if (url === urlsToTry[urlsToTry.length - 1]) {
                // If this was the last URL to try, throw the accumulated error
                throw new Error(`All API call attempts failed. Last error for ${url}: ${lastError.message}`);
             }
             // Otherwise, loop continues to the next URL
        }
    }

    // Should only be reached if urlsToTry is empty, which shouldn't happen.
    throw lastError || new Error("API call failed after trying all options.");
}

// --- Public API Functions ---

/**
 * Submits a generation request to the Sonauto API.
 * @param {string} apiKey
 * @param {object} payload - The request body payload.
 * @returns {Promise<object>} - The API response (expected to contain task_id).
 */
export async function submitGenerationRequest(apiKey, payload) {
    if (!apiKey) throw new Error('API Key is required.');
    // Add webhook_url if needed for future features, but not required for basic polling
    // payload.webhook_url = "YOUR_WEBHOOK_URL"; // Example
    console.log("Submitting generation with payload:", payload);
    return callSonautoApi('/generations', 'POST', apiKey, payload);
}

/**
 * Fetches the final generation result.
 * @param {string} taskId
 * @param {string} apiKey
 * @returns {Promise<object>} - The detailed generation result object.
 */
async function fetchGenerationResult(taskId, apiKey) {
    if (!apiKey) throw new Error('API Key is required.');
    console.log(`Fetching final result for task ${taskId}...`);
    return callSonautoApi(`/generations/${taskId}`, 'GET', apiKey);
}

/**
 * Polls the generation status endpoint.
 * @param {string} taskId
 * @param {string} apiKey
 * @param {function(string, string)} onUpdate - Callback for status updates (message, type).
 * @param {function(object)} onSuccess - Callback when status is SUCCESS, passes the final result.
 * @param {function(Error)} onFailure - Callback on polling error or FAILURE status.
 * @param {function()} onFinally - Callback executed when polling stops (success, failure, or error).
 */
export async function pollGenerationStatus(taskId, apiKey, onUpdate, onSuccess, onFailure, onFinally) {
    if (!apiKey) {
        onFailure(new Error('API Key is required to check status.'));
        if(onFinally) onFinally();
        return;
    }

    const statusEndpoint = `/generations/status/${taskId}`; // Endpoint only
    let timeoutId; // To store the setTimeout ID for potential cancellation
    let cancelled = false; // Flag to prevent further actions if cancelled

    const poll = async () => {
        if (cancelled) return; // Stop if cancelled

        try {
            // CallSonautoApi now handles direct/proxy attempts and returns text for status
            const status = await callSonautoApi(statusEndpoint, 'GET', apiKey);

             // Basic validation of the status string format
             if (typeof status !== 'string' || !status.trim()) {
                console.warn(`Received unexpected status type or empty string: ${JSON.stringify(status)}. Stopping polling.`);
                throw new Error(`Invalid status received: ${JSON.stringify(status)}`);
             }

            const currentStatus = status.trim().toUpperCase(); // Normalize status
            console.log(`Task ${taskId} Status: ${currentStatus}`);


            let messageType = 'info';
             // More robust status mapping
            switch(currentStatus) {
                case 'RECEIVED':
                case 'PROMPT':
                case 'TASK_SENT':
                    messageType = 'info';
                    break;
                case 'TRANSCRIBE_TASK_STARTED':
                case 'TRANSCRIBE_STAGE_1':
                case 'TRANSCRIBE_STAGE_2':
                case 'TRANSCRIBE_STAGE_3':
                case 'TRANSCRIBE_DONE':
                case 'GENERATE_TASK_STARTED':
                case 'LOADING_SOURCE':
                case 'BEGINNING_GENERATION':
                case 'GENERATING':
                case 'DECOMPRESSING':
                case 'SAVING':
                    messageType = 'progress';
                    break;
                case 'SUCCESS':
                    messageType = 'SUCCESS';
                    break;
                case 'FAILURE':
                    messageType = 'FAILURE';
                    break;
                default:
                    console.warn(`Unknown status received: ${currentStatus}. Treating as info.`);
                    messageType = 'info';
            }

            if (cancelled) return; // Check again after async call
            // Update UI with the status string received
            onUpdate(`Status: ${currentStatus}`, messageType);

            // Terminal states
            if (currentStatus === 'SUCCESS' || currentStatus === 'FAILURE') {
                try {
                     onUpdate(`Fetching final result...`, 'info');
                    const result = await fetchGenerationResult(taskId, apiKey);
                    if (cancelled) return; // Check again after async call

                     // Check if result fetch actually returned something meaningful
                     if (!result || typeof result !== 'object' || !result.id) {
                         console.error(`Failed to fetch valid final result object for task ${taskId}. Received:`, result);
                         throw new Error('Failed to retrieve valid final result details.');
                     }
                    console.log('Generation Result:', result);

                    // Use the status from the detailed result as the final source of truth
                     if (result.status === 'FAILURE') {
                         const failureMsg = `Generation failed: ${result.error_message || 'No specific error message provided.'}`;
                         onUpdate(failureMsg, 'FAILURE');
                         onFailure(new Error(result.error_message || 'Generation failed.'));
                     } else if (result.status === 'SUCCESS' && result.song_paths && result.song_paths.length > 0) {
                         onUpdate(`Generation successful! Rendering result.`, 'SUCCESS');
                         onSuccess(result);
                     } else if (result.status === 'SUCCESS') {
                         const warnMsg = `Generation status is SUCCESS, but no song paths found in the final result object.`;
                         onUpdate(warnMsg, 'FAILURE'); // Treat as failure for UI if no songs
                         console.warn("Success status but no song paths:", result);
                         onFailure(new Error('Generation successful but no song paths returned.'));
                     } else {
                        // Status mismatch between polling and final result object
                         const unexpectedMsg = `Polling ended with ${currentStatus}, but final result object has status ${result.status}. Error: ${result.error_message || 'None'}`;
                         onUpdate(unexpectedMsg, 'FAILURE');
                          onFailure(new Error(unexpectedMsg));
                     }

                } catch (fetchError) {
                     if (cancelled) return; // Don't report error if cancelled during fetch
                    console.error(`Error fetching final result for task ${taskId}:`, fetchError);
                    onUpdate(`Error fetching final result: ${fetchError.message}`, 'FAILURE');
                    onFailure(fetchError); // Report the fetching error
                } finally {
                     if(onFinally && !cancelled) onFinally(); // Ensure button is re-enabled etc.
                }
            } else {
                // Poll again after a delay
                 timeoutId = setTimeout(poll, POLLING_INTERVAL_MS);
            }
        } catch (error) {
            if (cancelled) return; // Don't report error if cancelled during poll
            // This catches errors from callSonautoApi during status polling or result fetching (if thrown above)
            console.error(`Error during polling/result fetch for task ${taskId}:`, error);
             const pollErrorMsg = `Polling failed: ${error.message || 'Unknown polling error.'}`;
            onUpdate(pollErrorMsg, 'FAILURE');
            onFailure(error);
             if(onFinally) onFinally();
        }
    };

    // Start the first poll
    poll();

     // Return a function to cancel the polling if needed externally
     return () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            cancelled = true; // Set the flag
            console.log(`Polling cancelled for task ${taskId}.`);
             // Potentially call onFinally here as well if cancellation should re-enable UI immediately
             // if (onFinally) onFinally();
        }
     };
}