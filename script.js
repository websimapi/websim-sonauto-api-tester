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
    if (taskId && statusMessages.querySelector(`[data-task-id="${taskId}"]`)) {
        // Update existing status message for this task
        const existingMsg = statusMessages.querySelector(`[data-task-id="${taskId}"]`);
        existingMsg.textContent = `Task ${taskId}: ${message}`;
        existingMsg.className = `status-update ${type}`; // Update class for styling
    } else {
         // Add new status message
        const p = document.createElement('p');
        p.textContent = taskId ? `Task ${taskId}: ${message}` : message;
        p.className = `status-update ${type}`;
        if (taskId) {
            p.dataset.taskId = taskId;
        }
        // Remove placeholder if it exists
        const placeholder = statusMessages.querySelector('p:not(.status-update)');
        if (placeholder && placeholder.textContent.includes('Submit a generation request')) {
            statusMessages.innerHTML = ''; // Clear placeholder
        }
        statusMessages.appendChild(p);
    }
}

// Function to handle API errors
function handleApiError(error, taskId = null) {
    console.error('API Error:', error);
    const message = `Error: ${error.message || 'An unknown error occurred.'}`;
    addStatusMessage(message, 'FAILURE', taskId);
    generateButton.disabled = false; // Re-enable button on error
}

// Function to check generation status
async function checkStatus(taskId) {
    if (!apiKey) {
        addStatusMessage('Error: API Key is required to check status.', 'FAILURE');
        return;
    }

    addStatusMessage(`Checking status...`, 'info', taskId);

    const statusUrl = `${API_BASE_URL}/generations/status/${taskId}`;
    const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await fetch(statusUrl, { headers });
        if (!response.ok) {
            const errorData = await response.text(); // Use text() first as response might not be JSON
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData}`);
        }

        const status = await response.text(); // Status endpoint returns plain text
        addStatusMessage(`Status: ${status}`, status, taskId);

        if (status === 'SUCCESS' || status === 'FAILURE') {
            // Fetch full generation details if finished
            fetchGenerationResult(taskId, status === 'FAILURE');
        } else {
            // Poll again after a delay
            setTimeout(() => checkStatus(taskId), 5000); // Check every 5 seconds
        }
    } catch (error) {
        handleApiError(error, taskId);
        // Stop polling on error for this task
    }
}


// Function to fetch the final result
async function fetchGenerationResult(taskId, isFailure = false) {
     if (!apiKey) {
        addStatusMessage('Error: API Key is required to fetch results.', 'FAILURE');
        return;
    }
    if (isFailure) {
        addStatusMessage(`Generation failed. Check logs or API dashboard for details.`, 'FAILURE', taskId);
        // Optionally fetch details even on failure to get error message
        // return; // Stop if you don't want to fetch details on failure
    }

    addStatusMessage(`Fetching final result...`, 'info', taskId);

    const resultUrl = `${API_BASE_URL}/generations/${taskId}`;
     const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await fetch(resultUrl, { headers });
         if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
        }

        const result = await response.json();
        console.log('Generation Result:', result);

        if (result.status === 'FAILURE') {
             addStatusMessage(`Generation failed: ${result.error_message || 'No specific error message provided.'}`, 'FAILURE', taskId);
        } else if (result.status === 'SUCCESS' && result.song_paths && result.song_paths.length > 0) {
            addStatusMessage(`Generation successful!`, 'SUCCESS', taskId);
            renderResult(result);
        } else if (result.status !== 'FAILURE') {
            addStatusMessage(`Unexpected status: ${result.status}. Full response logged to console.`, 'info', taskId);
        }
         generateButton.disabled = false; // Re-enable button after completion/failure

    } catch (error) {
        handleApiError(error, taskId);
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
    content += `<p><strong>Status:</strong> ${result.status}</p>`;
    if (result.prompt) content += `<p><strong>Prompt:</strong> ${result.prompt}</p>`;
    if (result.tags && result.tags.length > 0) content += `<p><strong>Tags:</strong> ${result.tags.join(', ')}</p>`;
    if (result.lyrics) content += `<p><strong>Lyrics:</strong><br>${result.lyrics.replace(/\n/g, '<br>')}</p>`; // Preserve line breaks
    if (result.seed) content += `<p><strong>Seed:</strong> ${result.seed}</p>`;
    // Add other relevant details like format, bitrate etc. if needed from the result object


    if (result.song_paths && result.song_paths.length > 0) {
        result.song_paths.forEach((path, index) => {
            content += `
                <p><strong>Song ${index + 1}:</strong></p>
                <audio controls src="${path}">
                    Your browser does not support the audio element.
                </audio>
                <p><a href="${path}" target="_blank" download="sonauto_song_${result.id}_${index}.ogg">Download Song ${index + 1}</a></p>
            `; // Note: Download attribute might need adjustment based on actual filename/format
        });
    } else if (result.status !== 'FAILURE') {
        content += `<p>No song paths found, but status is ${result.status}.</p>`;
    }

    if (result.status === 'FAILURE' && result.error_message) {
         content += `<p class="error-message"><strong>Error:</strong> ${result.error_message}</p>`;
    }


    resultDiv.innerHTML = content;
    resultsContainer.appendChild(resultDiv);
}

// Handle form submission
generateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!apiKey) {
        alert('Please save your API key first.');
        return;
    }

    generateButton.disabled = true;
    addStatusMessage('Sending generation request...');


    const payload = {
        prompt: document.getElementById('prompt').value.trim() || null,
        tags: document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
        lyrics: document.getElementById('lyrics').value.trim() || null,
        instrumental: document.getElementById('instrumental').checked,
        seed: parseInt(document.getElementById('seed').value, 10) || null,
        output_format: outputFormatSelect.value,
        output_bit_rate: parseInt(outputBitRateSelect.value, 10) || null,
        // num_songs: 1, // Default, can add UI later if needed
    };

    // Remove null/empty values to avoid sending them unless explicitly allowed by API
    Object.keys(payload).forEach(key => {
        if (payload[key] === null || (Array.isArray(payload[key]) && payload[key].length === 0)) {
             // Allow empty string for prompt, but remove other nulls/empty arrays
            if (key !== 'prompt' || payload[key] === null) { // Keep prompt if it's "" but not if null
                 delete payload[key];
            }
        }
    });


    // API requires at least one of tags, lyrics, or prompt
    if (!payload.tags && !payload.lyrics && !payload.prompt && payload.prompt !== "") {
         alert('Please provide at least one of: Prompt, Tags, or Lyrics.');
         addStatusMessage('Generation failed: Missing required input (Prompt, Tags, or Lyrics).', 'FAILURE');
         generateButton.disabled = false;
         return;
    }
    if (payload.instrumental && payload.lyrics) {
        alert('Cannot provide lyrics for an instrumental song.');
        addStatusMessage('Generation failed: Cannot provide lyrics for an instrumental song.', 'FAILURE');
        generateButton.disabled = false;
        return;
    }
     if (!payload.instrumental && !payload.tags && !payload.prompt && payload.prompt !== "") {
        // Non-instrumental needs prompt or tags if no lyrics provided
        alert('Please provide a Prompt or Tags if not providing Lyrics for a non-instrumental song.');
        addStatusMessage('Generation failed: Missing Prompt or Tags for non-instrumental song without lyrics.', 'FAILURE');
        generateButton.disabled = false;
        return;
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
             const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
             throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.detail || errorData.message || 'Unknown error'}`); // Sonauto might use 'detail'
        }

        const data = await response.json();
        if (data.task_id) {
            addStatusMessage(`Request successful! Task ID: ${data.task_id}. Starting status check.`, 'info', data.task_id);
            checkStatus(data.task_id); // Start polling
        } else {
             throw new Error('No task_id received in response.');
        }

    } catch (error) {
        handleApiError(error);
        generateButton.disabled = false; // Ensure button is re-enabled
    }
});


// Bitrate select logic
outputFormatSelect.addEventListener('change', () => {
    const selectedFormat = outputFormatSelect.value;
    if (selectedFormat === 'mp3' || selectedFormat === 'm4a') {
        outputBitRateSelect.disabled = false;
        outputBitRateSelect.parentElement.style.display = ''; // Show label too
    } else {
        outputBitRateSelect.disabled = true;
        outputBitRateSelect.value = ''; // Reset value
        outputBitRateSelect.parentElement.style.display = 'none'; // Hide label too
    }
});

// Initial setup
updateKeyStatus();
// Initial state for bitrate select
outputBitRateSelect.disabled = true;
outputBitRateSelect.parentElement.style.display = 'none';

// Clear placeholder if API key is already saved and user starts typing etc.
// (This example focuses on core functionality, more sophisticated UI state handling can be added)

console.log('Sonauto API Tester script loaded.');

