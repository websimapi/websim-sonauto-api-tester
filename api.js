import { API_BASE_URL, CORS_PROXIES } from 'config';

// --- Helper Functions ---

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
        ...CORS_PROXIES.map(proxy => `${proxy}${directUrl}`) // Construct proxy URLs
    ];

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        // Some proxies might require specifying the origin or other headers,
        // but start simple. 'x-requested-with' might help with some proxies.
        // 'X-Requested-With': 'XMLHttpRequest'
    };
    const options = {
        method: method,
        headers: headers,
        // 'mode': 'cors' is the default and required for reading the response.
        // 'no-cors' would hide the CORS error but make the response opaque and unusable.
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    let lastError = null;

    for (const url of urlsToTry) {
        console.log(`Attempting API call to: ${url}`);
        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                let errorData;
                const contentType = response.headers.get("content-type");
                try {
                    if (contentType && contentType.indexOf("application/json") !== -1) {
                        errorData = await response.json();
                    } else {
                        const textError = await response.text();
                        errorData = { message: textError || `Request failed with status: ${response.status}` };
                    }
                } catch (e) {
                    errorData = { message: `Failed to parse error response (Status: ${response.status})` };
                }
                const errorMessage = errorData.detail || errorData.message || 'Unknown API error';
                 // Store the error but continue to try next URL unless it's the last one
                lastError = new Error(`API Error (${response.status}) via ${url}: ${errorMessage}`);
                 console.warn(`Attempt failed: ${lastError.message}`);
                 if (url === urlsToTry[urlsToTry.length - 1]) {
                    throw lastError; // Throw if it's the last attempt
                 }
                 continue; // Try the next URL
            }

            // Handle successful response
            console.log(`Successfully connected via: ${url}`);
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("text/plain") !== -1) {
                return await response.text(); // Handle plain text for status
            }

            try {
                return await response.json(); // Default to JSON
            } catch (e) {
                console.error("Failed to parse JSON response", e);
                // Store the error but continue to try next URL unless it's the last one
                lastError = new Error(`Received non-JSON response when JSON was expected from ${url}.`);
                 console.warn(`Attempt failed: ${lastError.message}`);
                 if (url === urlsToTry[urlsToTry.length - 1]) {
                    throw lastError; // Throw if it's the last attempt
                 }
                 continue; // Try the next URL
            }

        } catch (error) {
             // Catch fetch errors (TypeError likely for CORS, network errors)
             console.warn(`Fetch error for ${url}:`, error);
             lastError = error; // Store the error
             if (url === urlsToTry[urlsToTry.length - 1]) {
                // If this was the last URL to try, throw the accumulated error
                throw new Error(`All API call attempts failed. Last error: ${lastError.message || 'Network error or CORS issue.'}`);
             }
             // Otherwise, loop continues to the next URL
        }
    }

    // Should not be reached if urlsToTry is not empty, but as a fallback:
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

    try {
        // CallSonautoApi now handles direct/proxy attempts
        const status = await callSonautoApi(statusEndpoint, 'GET', apiKey);
        console.log(`Task ${taskId} Status: ${status}`);

        let messageType = 'info';
        if (status === 'SUCCESS') messageType = 'SUCCESS';
        if (status === 'FAILURE') messageType = 'FAILURE';
        // Add more detailed status mapping if desired
         else if (status.includes('GENERATE') || status.includes('LOADING') || status.includes('DECOMPRESSING') || status.includes('SAVING')) messageType = 'progress'; // Custom type for progress
         else if (status.includes('TRANSCRIBE')) messageType = 'transcribe'; // Custom type for transcribe steps


        // Update UI with the status string received
        onUpdate(`Status: ${status}`, messageType); // Pass raw status for clarity

        if (status === 'SUCCESS' || status === 'FAILURE') {
            try {
                 onUpdate(`Fetching final result...`, 'info');
                 // fetchGenerationResult also uses callSonautoApi now
                const result = await fetchGenerationResult(taskId, apiKey);
                console.log('Generation Result:', result);

                // Double-check final status from the detailed result
                 if (result.status === 'FAILURE') {
                     const failureMsg = `Generation failed: ${result.error_message || 'No specific error message provided.'}`;
                     onUpdate(failureMsg, 'FAILURE');
                     onFailure(new Error(result.error_message || 'Generation failed.'));
                 } else if (result.status === 'SUCCESS' && result.song_paths && result.song_paths.length > 0) {
                     onUpdate(`Generation successful! Rendering result.`, 'SUCCESS');
                     onSuccess(result);
                 } else if (result.status === 'SUCCESS') {
                     const warnMsg = `Generation status is SUCCESS, but no song paths found. Check API response.`;
                     onUpdate(warnMsg, 'FAILURE'); // Treat as failure for UI
                     console.warn("Success status but no song paths:", result);
                     onFailure(new Error('Generation successful but no song paths returned.'));
                 } else {
                    // Should not happen if initial status was SUCCESS/FAILURE, but handle defensively
                     const unexpectedMsg = `Fetched result with unexpected status: ${result.status}.`;
                     onUpdate(unexpectedMsg, 'FAILURE');
                      onFailure(new Error(unexpectedMsg));
                 }

            } catch (fetchError) {
                console.error(`Error fetching final result for task ${taskId}:`, fetchError);
                onUpdate(`Error fetching final result: ${fetchError.message}`, 'FAILURE');
                onFailure(fetchError); // Report the fetching error
            } finally {
                 if(onFinally) onFinally(); // Ensure button is re-enabled etc.
            }
        } else {
            // Poll again after a delay
            setTimeout(() => pollGenerationStatus(taskId, apiKey, onUpdate, onSuccess, onFailure, onFinally), 5000); // Check every 5 seconds
        }
    } catch (error) {
        // This catches errors from callSonautoApi (after retries) during status polling
        console.error(`Error polling status for task ${taskId}:`, error);
         // Display a user-friendly message including the error detail
         const pollErrorMsg = `Error checking status: ${error.message || 'Polling failed.'}`;
        onUpdate(pollErrorMsg, 'FAILURE'); // Update status message with error
        onFailure(error); // Report the polling error to the main script logic
         if(onFinally) onFinally(); // Ensure button is re-enabled etc.
    }
}