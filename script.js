import { API_BASE_URL } from 'config';

const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyButton = document.getElementById('saveApiKey');
const keyStatusElement = document.getElementById('keyStatus');
const generateForm = document.getElementById('generateForm');
const generateButton = document.getElementById('generateButton');
const statusMessages = document.getElementById('statusMessages');
const resultsContainer = document.getElementById('resultsContainer');
const outputFormatSelect = document.getElementById('outputFormat');
const outputBitRateSelect = document.getElementById('outputBitRate');

let apiKey = localStorage.getItem('sonautoApiKey');

function updateKeyStatus() {
    if (apiKey) {
        keyStatusElement.textContent = 'API Key Saved.';
        keyStatusElement.classList.add('saved');
        apiKeyInput.placeholder = 'API Key Saved (leave blank to keep)';
        apiKeyInput.value = ''; // Clear the input after saving for security
    } else {
        keyStatusElement.textContent = 'No API key saved.';
        keyStatusElement.classList.remove('saved');
        apiKeyInput.placeholder = 'Enter your Sonauto API key';
    }
}

saveApiKeyButton.addEventListener('click', () => {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
        apiKey = newApiKey;
        localStorage.setItem('sonautoApiKey', apiKey);
        console.log('API Key saved.');
        updateKeyStatus();
    } else if (!apiKey) {
        alert('Please enter an API key.');
    } else {
         // If input is empty but a key is already saved, do nothing (user might just be clicking)
        console.log('No new API key entered, keeping existing one.');
        updateKeyStatus(); // Ensure status reflects the saved key
    }
});

// Function to add status messages
function addStatusMessage(message, type = 'info', taskId = null) {
    let existingMsg = null;
    if (taskId) {
        existingMsg = statusMessages.querySelector(`[data-task-id="${taskId}"]`);
    }

    const fullMessage = taskId ? `Task ${taskId}: ${message}` : message;
    let cssClass = 'status-update';
    // Map specific status types to CSS classes
    if (type === 'SUCCESS') {
        cssClass += ' SUCCESS';
    } else if (type === 'FAILURE') {
        cssClass += ' FAILURE';
    } else {
        cssClass += ' info'; // Default or other intermediate statuses
    }


    if (existingMsg) {
        // Update existing status message for this task
        existingMsg.textContent = fullMessage;
        existingMsg.className = cssClass; // Update class for styling
    } else {
         // Add new status message
        const p = document.createElement('p');
        p.textContent = fullMessage;
        p.className = cssClass;
        if (taskId) {
            p.dataset.taskId = taskId;
        }
        // Remove placeholder if it exists and we're adding the first real message
        const placeholder = statusMessages.querySelector('p:not(.status-update)');
         if (placeholder && placeholder.textContent.includes('Submit a generation request')) {
            statusMessages.innerHTML = ''; // Clear placeholder only once
        }
        statusMessages.appendChild(p);
    }
}

// Function to handle API errors
function handleApiError(error, taskId = null) {
    console.error('API Error:', error);
    const message = `Error: ${error.message || 'An unknown error occurred.'}`;
    addStatusMessage(message, 'FAILURE', taskId);
    // Don't re-enable the button here if it's a polling error, only on initial submit failure
    // generateButton.disabled = false;
}

// Function to check generation status
async function checkStatus(taskId) {
    if (!apiKey) {
        addStatusMessage('Error: API Key is required to check status.', 'FAILURE');
        return; // Cannot continue without API key
    }

    // Don't spam "Checking status..." messages, update the existing task message
    // addStatusMessage(`Checking status...`, 'info', taskId);

    const statusUrl = `${API_BASE_URL}/generations/status/${taskId}`;
    const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await fetch(statusUrl, { headers });

        // Handle potential non-OK responses during polling (e.g., 404 if task expires)
        if (!response.ok) {
             if (response.status === 404) {
                 throw new Error(`Task ID ${taskId} not found or expired.`);
             }
            const errorText = await response.text(); // Get text for non-JSON errors
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const status = await response.text(); // Status endpoint returns plain text
        console.log(`Task ${taskId} Status: ${status}`);

        // Determine message type for styling
        let messageType = 'info';
        if (status === 'SUCCESS') messageType = 'SUCCESS';
        if (status === 'FAILURE') messageType = 'FAILURE';

        addStatusMessage(`Status: ${status}`, messageType, taskId);

        if (status === 'SUCCESS' || status === 'FAILURE') {
            // Fetch full generation details as it's finished
            fetchGenerationResult(taskId, status === 'FAILURE');
        } else {
            // Poll again after a delay
            setTimeout(() => checkStatus(taskId), 5000); // Check every 5 seconds
        }
    } catch (error) {
        // Handle errors during polling specifically for this task
        handleApiError(error, taskId);
        // Stop polling on error for this task
         generateButton.disabled = false; // Re-enable button if polling fails definitively
    }
}


// Function to fetch the final result
async function fetchGenerationResult(taskId, isFailure = false) {
     if (!apiKey) {
        addStatusMessage('Error: API Key is required to fetch results.', 'FAILURE', taskId);
        generateButton.disabled = false; // Re-enable button
        return;
    }

    addStatusMessage(`Fetching final result...`, 'info', taskId);

    const resultUrl = `${API_BASE_URL}/generations/${taskId}`;
     const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await fetch(resultUrl, { headers });
         if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `Failed to parse error response (Status: ${response.status})` }));
            throw new Error(`HTTP error fetching result! status: ${response.status}, message: ${errorData.detail || errorData.message || 'Unknown error'}`);
        }

        const result = await response.json();
        console.log('Generation Result:', result);

        // Update final status message based on detailed result
        if (result.status === 'FAILURE') {
             addStatusMessage(`Generation failed: ${result.error_message || 'No specific error message provided.'}`, 'FAILURE', taskId);
        } else if (result.status === 'SUCCESS' && result.song_paths && result.song_paths.length > 0) {
            addStatusMessage(`Generation successful! Rendering result.`, 'SUCCESS', taskId);
            renderResult(result);
        } else if (result.status === 'SUCCESS') {
            addStatusMessage(`Generation status is SUCCESS, but no song paths found. Check API response.`, 'FAILURE', taskId); // Treat as failure for UI
             console.warn("Success status but no song paths:", result);
        } else {
            // Should have been caught by isFailure earlier, but handle unexpected intermediate statuses
             addStatusMessage(`Fetched result with unexpected status: ${result.status}. Full response logged.`, 'info', taskId);
        }
        generateButton.disabled = false; // Re-enable button after final result/failure

    } catch (error) {
        handleApiError(error, taskId); // Log the error for the specific task
        generateButton.disabled = false; // Re-enable button on fetch error
    }
}


// Function to render the result
function renderResult(result) {
    const placeholder = resultsContainer.querySelector('p:not(.result-item)');
     if (placeholder && placeholder.textContent.includes('Generated songs will appear here')) {
        resultsContainer.innerHTML = ''; // Clear placeholder
    }

    const resultDiv = document.createElement('div');
    resultDiv.classList.add('result-item');

    let content = `<h3>Task ID: ${result.id}</h3>`;
    content += `<p><strong>Status:</strong> <span class="status-${result.status}">${result.status}</span></p>`;
    if (result.prompt !== null && result.prompt !== undefined) content += `<p><strong>Prompt:</strong> ${result.prompt || '<i>(empty)</i>'}</p>`;
    if (result.tags && result.tags.length > 0) content += `<p><strong>Tags:</strong> ${result.tags.join(', ')}</p>`;
    if (result.lyrics) content += `<p><strong>Lyrics:</strong><br>${result.lyrics.replace(/\n/g, '<br>')}</p>`; // Preserve line breaks
    if (result.seed !== null) content += `<p><strong>Seed:</strong> ${result.seed}</p>`;
    if (result.prompt_strength !== null) content += `<p><strong>Prompt Strength:</strong> ${result.prompt_strength}</p>`;
    if (result.instrumental) content += `<p><strong>Instrumental:</strong> Yes</p>`;
    if (result.output_format) content += `<p><strong>Format:</strong> ${result.output_format}${result.output_bit_rate ? ` (${result.output_bit_rate} kbps)` : ''}</p>`;


    if (result.song_paths && result.song_paths.length > 0) {
        result.song_paths.forEach((path, index) => {
            // Basic filename extraction (might need refinement)
            let filename = `sonauto_${result.id}_${index}.${result.output_format || 'ogg'}`;
            try {
                 // Attempt to get filename from URL path
                const urlParts = new URL(path).pathname.split('/');
                const potentialFilename = urlParts[urlParts.length - 1];
                 // Basic check if it looks like a filename with extension
                if (potentialFilename && potentialFilename.includes('.')) {
                    filename = potentialFilename;
                }
            } catch (e) {
                console.warn("Could not parse URL to extract filename:", path);
            }

            content += `
                <p><strong>Song ${index + 1}:</strong></p>
                <audio controls src="${path}">
                    Your browser does not support the audio element.
                </audio>
                <p><a href="${path}" target="_blank" download="${filename}">Download Song ${index + 1}</a></p>
            `;
        });
    } else if (result.status !== 'FAILURE') {
        content += `<p>No song paths found, but status is ${result.status}.</p>`;
    }

    if (result.status === 'FAILURE' && result.error_message) {
         content += `<p class="error-message"><strong>Error:</strong> ${result.error_message}</p>`;
    }


    resultDiv.innerHTML = content;
    // Prepend new results to the top
    resultsContainer.prepend(resultDiv);
}

// Handle form submission
generateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!apiKey) {
        alert('Please save your API key first.');
        return;
    }

    generateButton.disabled = true;
    // Clear previous status messages for new request *or* keep old ones? Let's keep old ones for now.
    // statusMessages.innerHTML = '<p>Sending generation request...</p>';
     addStatusMessage('Sending generation request...', 'info');


    const promptVal = document.getElementById('prompt').value.trim();
    const tagsVal = document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const lyricsVal = document.getElementById('lyrics').value.trim() || null; // Treat empty textarea as null
    const instrumentalVal = document.getElementById('instrumental').checked;
    const seedVal = document.getElementById('seed').value ? parseInt(document.getElementById('seed').value, 10) : null;
    const promptStrengthVal = document.getElementById('promptStrength').value ? parseFloat(document.getElementById('promptStrength').value) : null; // Default handled by API (2.3)
    const numSongsVal = document.getElementById('numSongs').value ? parseInt(document.getElementById('numSongs').value, 10) : 1; // Default to 1
    const outputFormatVal = outputFormatSelect.value;
    const outputBitRateVal = (outputFormatVal === 'mp3' || outputFormatVal === 'm4a') && outputBitRateSelect.value
                             ? parseInt(outputBitRateSelect.value, 10)
                             : null;


    const payload = {
        prompt: promptVal, // Send even if empty string, API handles it
        tags: tagsVal.length > 0 ? tagsVal : null,
        lyrics: lyricsVal,
        instrumental: instrumentalVal,
        seed: seedVal,
        prompt_strength: promptStrengthVal,
        num_songs: numSongsVal,
        output_format: outputFormatVal,
        output_bit_rate: outputBitRateVal
    };

    // Clean payload: Remove null values, except for prompt which can be explicitly ""
    Object.keys(payload).forEach(key => {
        if (payload[key] === null) {
           delete payload[key];
        }
    });

     // Validation based on API rules
    const hasPrompt = payload.hasOwnProperty('prompt'); // Check if key exists, even if ""
    const hasTags = payload.tags && payload.tags.length > 0;
    const hasLyrics = payload.lyrics && payload.lyrics.length > 0;

    if (!hasPrompt && !hasTags && !hasLyrics) {
         alert('Please provide at least one of: Prompt, Tags, or Lyrics.');
         addStatusMessage('Generation failed: Missing required input (Prompt, Tags, or Lyrics).', 'FAILURE');
         generateButton.disabled = false;
         return;
    }
    if (payload.instrumental && hasLyrics) {
        alert('Cannot provide lyrics for an instrumental song.');
        addStatusMessage('Generation failed: Cannot provide lyrics for an instrumental song.', 'FAILURE');
        generateButton.disabled = false;
        return;
    }
     // Rule: "For instrumental songs ... only the tags or prompt can be set"
    if (payload.instrumental && !(hasPrompt || hasTags)) {
         alert('For instrumental songs, please provide a Prompt or Tags.');
         addStatusMessage('Generation failed: Instrumental song requires Prompt or Tags.', 'FAILURE');
         generateButton.disabled = false;
         return;
     }
     // Rule: "Providing only lyrics or tags (without a prompt) is not supported. However, you can pass an empty string as the prompt"
     // This implies if lyrics or tags are provided, prompt MUST be present (even if "").
     // The payload cleaning ensures prompt:"" is sent if user leaves it blank.
     // Let's double check if ONLY lyrics or ONLY tags is sent.
     if ((hasLyrics || hasTags) && !hasPrompt) {
        // This case should technically not happen if the user leaves prompt blank,
        // because payload.prompt will be "". But if JS somehow sets it to null/undefined...
         console.warn("Attempting to send only Lyrics or Tags without a prompt key. Adding empty prompt.");
         payload.prompt = ""; // Ensure prompt key exists if lyrics/tags are sent
     }


    console.log('Sending payload:', JSON.stringify(payload, null, 2)); // Log payload for debugging


    const generationUrl = `${API_BASE_URL}/generations`;
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    try {
        const response = await fetch(generationUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             // Try to parse JSON error first, fallback to text
             let errorData;
             try {
                 errorData = await response.json();
             } catch (e) {
                 errorData = { message: await response.text() || 'Failed to parse error response.' };
             }
             throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.detail || errorData.message || 'Unknown API error'}`);
        }

        const data = await response.json();
        if (data.task_id) {
            addStatusMessage(`Request successful! Task ID: ${data.task_id}. Starting status check.`, 'info', data.task_id);
            checkStatus(data.task_id); // Start polling
        } else {
             throw new Error('API response successful but did not contain task_id.');
        }

    } catch (error) {
         // Handle errors specifically from the initial POST request
        handleApiError(error); // Don't pass taskId here, it's a general submit error
        generateButton.disabled = false; // Ensure button is re-enabled on submit failure
    }
});


// Bitrate select logic
outputFormatSelect.addEventListener('change', () => {
    const selectedFormat = outputFormatSelect.value;
    const bitrateContainer = outputBitRateSelect.parentElement; // Assuming label is parent
    if (selectedFormat === 'mp3' || selectedFormat === 'm4a') {
        outputBitRateSelect.disabled = false;
        bitrateContainer.style.display = ''; // Show label+select
    } else {
        outputBitRateSelect.disabled = true;
        outputBitRateSelect.value = ''; // Reset value
        bitrateContainer.style.display = 'none'; // Hide label+select
    }
});

// Initial setup
updateKeyStatus();
// Initial state for bitrate select based on default format (ogg)
const initialFormat = outputFormatSelect.value;
const initialBitrateContainer = outputBitRateSelect.parentElement;
if (initialFormat === 'mp3' || initialFormat === 'm4a') {
    outputBitRateSelect.disabled = false;
    initialBitrateContainer.style.display = '';
} else {
    outputBitRateSelect.disabled = true;
    initialBitrateContainer.style.display = 'none';
}


console.log('Sonauto API Tester script loaded.');