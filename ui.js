// --- UI Element References (Assumed to be passed in or globally available) ---
// Note: This module focuses on updating the UI, not fetching data.

/**
 * Updates the display status of the saved API key.
 * @param {string|null} apiKey - The current API key (or null).
 * @param {HTMLElement} keyStatusElement - The element displaying the status.
 * @param {HTMLInputElement} apiKeyInput - The input field for the API key.
 */
export function updateKeyStatus(apiKey, keyStatusElement, apiKeyInput) {
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

/**
 * Adds or updates a status message in the status area.
 * @param {string} message - The message content.
 * @param {string} type - Message type ('info', 'SUCCESS', 'FAILURE').
 * @param {string|null} taskId - Optional task ID to update existing message.
 * @param {HTMLElement} statusMessagesContainer - The container for status messages.
 */
export function addStatusMessage(message, type = 'info', taskId = null, statusMessagesContainer) {
     if (!statusMessagesContainer) return;

     let existingMsg = null;
     if (taskId) {
        // Use a more specific selector to avoid accidentally selecting the container's placeholder
        existingMsg = statusMessagesContainer.querySelector(`.status-update[data-task-id="${taskId}"]`);
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
        if(taskId) existingMsg.dataset.taskId = taskId; // Ensure data-task-id is present
    } else {
         // Add new status message
        const p = document.createElement('p');
        p.textContent = fullMessage;
        p.className = cssClass;
        if (taskId) {
            p.dataset.taskId = taskId;
        }
        // Remove placeholder if it exists and we're adding the first real message
        const placeholder = statusMessagesContainer.querySelector('p:not(.status-update)');
         if (placeholder && placeholder.textContent.includes('Submit a generation request')) {
            statusMessagesContainer.innerHTML = ''; // Clear placeholder only once
        }
        statusMessagesContainer.appendChild(p);
    }
}


/**
 * Handles displaying API errors in the status messages area.
 * Also re-enables the generate button if the error is critical.
 * @param {Error} error - The error object.
 * @param {string|null} taskId - The associated task ID, if any.
 * @param {HTMLElement} statusMessagesContainer - The container for status messages.
 * @param {HTMLButtonElement} generateButton - The generate button element.
 */
export function handleApiErrorUI(error, taskId = null, statusMessagesContainer, generateButton) {
    console.error('API Error:', error);
    // Attempt to provide a more specific error message if available
    const message = `Error: ${error.message || 'An unknown error occurred.'}`;
    addStatusMessage(message, 'FAILURE', taskId, statusMessagesContainer);
    // Re-enable button on initial submit failure or definitive polling failure
    if (generateButton) {
        toggleGenerateButton(false, generateButton);
    }
}

/**
 * Renders the final generation result in the results area.
 * @param {object} result - The detailed generation result object from the API.
 * @param {HTMLElement} resultsContainerElement - The container for results.
 */
export function renderResult(result, resultsContainerElement) {
     if (!resultsContainerElement) return;

    const placeholder = resultsContainerElement.querySelector('p:not(.result-item)');
     if (placeholder && placeholder.textContent.includes('Generated songs will appear here')) {
        resultsContainerElement.innerHTML = ''; // Clear placeholder
    }

    const resultDiv = document.createElement('div');
    resultDiv.classList.add('result-item');

    let content = `<h3>Task ID: ${result.id}</h3>`;
    content += `<p><strong>Status:</strong> <span class="status-${result.status}">${result.status}</span></p>`;
     // Only display fields if they exist in the response
    if (result.prompt !== null && result.prompt !== undefined) content += `<p><strong>Prompt:</strong> ${result.prompt || '<i>(empty)</i>'}</p>`;
    if (result.tags && result.tags.length > 0) content += `<p><strong>Tags:</strong> ${result.tags.join(', ')}</p>`;
    if (result.lyrics) content += `<p><strong>Lyrics:</strong><br>${result.lyrics.replace(/\n/g, '<br>')}</p>`; // Preserve line breaks
    if (result.seed !== null && result.seed !== undefined) content += `<p><strong>Seed:</strong> ${result.seed}</p>`;
    if (result.prompt_strength !== null && result.prompt_strength !== undefined) content += `<p><strong>Prompt Strength:</strong> ${result.prompt_strength}</p>`;
    if (result.instrumental) content += `<p><strong>Instrumental:</strong> Yes</p>`;
    if (result.output_format) content += `<p><strong>Format:</strong> ${result.output_format}${result.output_bit_rate ? ` (${result.output_bit_rate} kbps)` : ''}</p>`;
    // Add extend/inpaint params if present
    if (result.extend_params) {
         content += `<p><strong>Extend Params:</strong> Side: ${result.extend_params.side}, Duration: ${result.extend_params.duration || 'N/A'}, Crop: ${result.extend_params.crop_duration || 0.0}s</p>`;
         if (result.extend_params.audio_url) content += `<p><small>Source URL: ${result.extend_params.audio_url}</small></p>`;
    }
    if (result.inpaint_params) {
        const sections = result.inpaint_params.sections ? JSON.stringify(result.inpaint_params.sections) : 'N/A';
        content += `<p><strong>Inpaint Params:</strong> Sections: ${sections}, Crop: ${result.inpaint_params.selection_crop || false}</p>`;
         if (result.inpaint_params.audio_url) content += `<p><small>Source URL: ${result.inpaint_params.audio_url}</small></p>`;
    }


    if (result.song_paths && result.song_paths.length > 0) {
        result.song_paths.forEach((path, index) => {
            let filename = `sonauto_${result.id}_${index}.${result.output_format || 'ogg'}`;
            try {
                const urlParts = new URL(path).pathname.split('/');
                const potentialFilename = urlParts[urlParts.length - 1];
                if (potentialFilename && potentialFilename.includes('.')) {
                    filename = potentialFilename;
                }
            } catch (e) {
                console.warn("Could not parse URL to extract filename:", path);
            }

            content += `
                <p><strong>Song ${index + 1}:</strong></p>
                <audio controls preload="metadata" src="${path}">
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
    resultsContainerElement.prepend(resultDiv);
}


/**
 * Enables or disables the generate button.
 * @param {boolean} disabled - True to disable, false to enable.
 * @param {HTMLButtonElement} buttonElement - The button element.
 */
export function toggleGenerateButton(disabled, buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = disabled;
    }
}

/**
 * Gathers form data, performs basic validation, and constructs the payload.
 * @param {HTMLFormElement} formElement - The form element.
 * @returns {object} - The cleaned payload object for the API.
 * @throws {Error} - Throws validation errors.
 */
export function getFormData(formElement) {
    const formData = new FormData(formElement); // Easier way to get values (if inputs have names)

    // Get values from specific elements by ID since form data might not capture all state easily
    const promptVal = document.getElementById('prompt').value.trim();
    const tagsVal = document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const lyricsVal = document.getElementById('lyrics').value.trim() || null;
    const instrumentalVal = document.getElementById('instrumental').checked;
    const seedVal = document.getElementById('seed').value ? parseInt(document.getElementById('seed').value, 10) : null;
    const promptStrengthVal = document.getElementById('promptStrength').value ? parseFloat(document.getElementById('promptStrength').value) : null;
    const numSongsVal = document.getElementById('numSongs').value ? parseInt(document.getElementById('numSongs').value, 10) : 1;
    const outputFormatVal = document.getElementById('outputFormat').value;
    const outputBitRateSelect = document.getElementById('outputBitRate');
    const outputBitRateVal = !outputBitRateSelect.disabled && outputBitRateSelect.value
                             ? parseInt(outputBitRateSelect.value, 10)
                             : null;

    const payload = {
        prompt: promptVal,
        tags: tagsVal.length > 0 ? tagsVal : null,
        lyrics: lyricsVal,
        instrumental: instrumentalVal,
        seed: seedVal,
        prompt_strength: promptStrengthVal,
        num_songs: numSongsVal,
        output_format: outputFormatVal,
        output_bit_rate: outputBitRateVal
    };

    // --- Validation based on API rules ---
    const hasPrompt = payload.prompt !== null && payload.prompt !== undefined; // Check key exists, even if ""
    const hasTags = payload.tags && payload.tags.length > 0;
    const hasLyrics = payload.lyrics && payload.lyrics.length > 0;

    if (!hasPrompt && !hasTags && !hasLyrics) {
        throw new Error('Please provide at least one of: Prompt, Tags, or Lyrics.');
    }
    if (payload.instrumental && hasLyrics) {
        throw new Error('Cannot provide lyrics for an instrumental song.');
    }
    if (payload.instrumental && !(hasPrompt || hasTags)) {
        throw new Error('For instrumental songs, please provide a Prompt or Tags.');
    }
    // Rule: "Providing only lyrics or tags (without a prompt) is not supported. However, you can pass an empty string..."
    // This implies if lyrics or tags are provided, prompt MUST be present (even if "").
    if ((hasLyrics || hasTags) && !hasPrompt) {
        console.warn("Only Lyrics or Tags provided without prompt. Adding empty prompt string.");
        payload.prompt = ""; // Ensure prompt key exists if lyrics/tags are sent
    }

    // Clean payload: Remove null/undefined values AFTER validation, except for prompt which can be ""
     Object.keys(payload).forEach(key => {
        // Allow prompt to be "" or lyrics to be null explicitly if needed by API
        if (payload[key] === null || payload[key] === undefined) {
             // Special case: If prompt was explicitly set to "" above, keep it.
             // If lyrics are empty string, they were set to null already.
             // Otherwise, delete keys with null/undefined values.
            if (key !== 'prompt' || payload[key] !== "") {
                 delete payload[key];
            }
        }
     });


    return payload;
}


/**
 * Sets up the event listener and initial state for the output bitrate select.
 * @param {HTMLSelectElement} outputFormatSelect - The format dropdown.
 * @param {HTMLSelectElement} outputBitRateSelect - The bitrate dropdown.
 */
export function setupBitrateSelect(outputFormatSelect, outputBitRateSelect) {
    const toggleBitrate = () => {
        const selectedFormat = outputFormatSelect.value;
        // Find the container div using closest()
        const bitrateContainer = outputBitRateSelect.closest('.bitrate-container');

        if (!bitrateContainer) {
            console.error("Bitrate container element not found. Cannot toggle visibility.");
             // Still try to enable/disable the select itself
             outputBitRateSelect.disabled = !(selectedFormat === 'mp3' || selectedFormat === 'm4a');
             if (outputBitRateSelect.disabled) {
                outputBitRateSelect.value = '';
             }
            return;
        }

        if (selectedFormat === 'mp3' || selectedFormat === 'm4a') {
            outputBitRateSelect.disabled = false;
            bitrateContainer.style.display = ''; // Show container
        } else {
            outputBitRateSelect.disabled = true;
            outputBitRateSelect.value = ''; // Reset value
            bitrateContainer.style.display = 'none'; // Hide container
        }
    };

    if (outputFormatSelect && outputBitRateSelect) {
        outputFormatSelect.addEventListener('change', toggleBitrate);
        toggleBitrate(); // Initial setup
    } else {
        console.error("Output format or bitrate select element not found during setup.");
    }
}