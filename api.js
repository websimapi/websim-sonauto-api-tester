import { API_BASE_URL } from 'config';

// --- Helper Functions ---

/**
 * General purpose fetch wrapper for Sonauto API
 * @param {string} endpoint - API endpoint path (e.g., '/generations')
 * @param {string} method - HTTP method ('GET', 'POST', etc.)
 * @param {string} apiKey - User's API key
 * @param {object|null} body - Request body for POST/PUT requests
 * @returns {Promise<any>} - Parsed JSON response or text for status endpoint
 * @throws {Error} - Throws on network errors or non-OK HTTP status
 */
async function callSonautoApi(endpoint, method, apiKey, body = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
    };
    const options = {
        method: method,
        headers: headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        let errorData;
        const contentType = response.headers.get("content-type");
        try {
            if (contentType && contentType.indexOf("application/json") !== -1) {
                errorData = await response.json();
            } else {
                 // Handle non-JSON error responses (like plain text or HTML)
                 const textError = await response.text();
                 errorData = { message: textError || `Request failed with status: ${response.status}` };
            }
        } catch (e) {
             // Handle cases where parsing the error response fails
             errorData = { message: `Failed to parse error response (Status: ${response.status})` };
        }
         // Use 'detail' if available (common in FastAPI errors), otherwise 'message'
        const errorMessage = errorData.detail || errorData.message || 'Unknown API error';
        throw new Error(`API Error (${response.status}): ${errorMessage}`);
    }

    // Handle plain text response for status endpoint
    const contentType = response.headers.get("content-type");
     if (contentType && contentType.indexOf("text/plain") !== -1) {
         return await response.text();
     }

    // Default to JSON parsing for other endpoints
    try {
         return await response.json();
     } catch (e) {
         // Handle cases where response is expected to be JSON but isn't
         console.error("Failed to parse JSON response", e);
         throw new Error("Received non-JSON response when JSON was expected.");
     }
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

    const statusUrl = `/generations/status/${taskId}`;

    try {
        const status = await callSonautoApi(statusUrl, 'GET', apiKey);
        console.log(`Task ${taskId} Status: ${status}`);

        let messageType = 'info';
        if (status === 'SUCCESS') messageType = 'SUCCESS';
        if (status === 'FAILURE') messageType = 'FAILURE';

        // Only update if status changes or is final? For now, update every time.
        onUpdate(`Status: ${status}`, messageType);

        if (status === 'SUCCESS' || status === 'FAILURE') {
            try {
                 onUpdate(`Fetching final result...`, 'info');
                const result = await fetchGenerationResult(taskId, apiKey);
                console.log('Generation Result:', result);

                // Double-check final status from the detailed result
                 if (result.status === 'FAILURE') {
                     onUpdate(`Generation failed: ${result.error_message || 'No specific error message provided.'}`, 'FAILURE');
                     onFailure(new Error(result.error_message || 'Generation failed.'));
                 } else if (result.status === 'SUCCESS' && result.song_paths && result.song_paths.length > 0) {
                     onUpdate(`Generation successful! Rendering result.`, 'SUCCESS');
                     onSuccess(result);
                 } else if (result.status === 'SUCCESS') {
                     onUpdate(`Generation status is SUCCESS, but no song paths found. Check API response.`, 'FAILURE'); // Treat as failure for UI
                     console.warn("Success status but no song paths:", result);
                     onFailure(new Error('Generation successful but no song paths returned.'));
                 } else {
                    // Should not happen if initial status was SUCCESS/FAILURE, but handle defensively
                     onUpdate(`Fetched result with unexpected status: ${result.status}.`, 'FAILURE');
                      onFailure(new Error(`Fetched result with unexpected status: ${result.status}.`));
                 }

            } catch (fetchError) {
                console.error(`Error fetching final result for task ${taskId}:`, fetchError);
                onFailure(fetchError); // Report the fetching error
            } finally {
                 if(onFinally) onFinally(); // Ensure button is re-enabled etc.
            }
        } else {
            // Poll again after a delay
            setTimeout(() => pollGenerationStatus(taskId, apiKey, onUpdate, onSuccess, onFailure, onFinally), 5000); // Check every 5 seconds
        }
    } catch (error) {
        console.error(`Error polling status for task ${taskId}:`, error);
        onFailure(error); // Report the polling error
         if(onFinally) onFinally(); // Ensure button is re-enabled etc.
    }
}
