import { API_BASE_URL } from 'config';
import { submitGenerationRequest, pollGenerationStatus } from 'api';
import {
    updateKeyStatus,
    addStatusMessage,
    renderResult,
    toggleGenerateButton,
    getFormData,
    setupBitrateSelect,
    handleApiErrorUI // Renamed for clarity
} from 'ui';

// --- DOM Elements ---
const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyButton = document.getElementById('saveApiKey');
const keyStatusElement = document.getElementById('keyStatus');
const generateForm = document.getElementById('generateForm');
const generateButton = document.getElementById('generateButton');
const statusMessages = document.getElementById('statusMessages');
const resultsContainer = document.getElementById('resultsContainer');
const outputFormatSelect = document.getElementById('outputFormat');
const outputBitRateSelect = document.getElementById('outputBitRate');

// --- State ---
let apiKey = localStorage.getItem('sonautoApiKey');

// --- Initialization ---
updateKeyStatus(apiKey, keyStatusElement, apiKeyInput);
setupBitrateSelect(outputFormatSelect, outputBitRateSelect);
console.log('Sonauto API Tester script loaded.');

// --- Event Listeners ---

// API Key Handling
saveApiKeyButton.addEventListener('click', () => {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
        apiKey = newApiKey;
        localStorage.setItem('sonautoApiKey', apiKey);
        console.log('API Key saved.');
        updateKeyStatus(apiKey, keyStatusElement, apiKeyInput);
    } else if (!apiKey) {
        alert('Please enter an API key.');
    } else {
        console.log('No new API key entered, keeping existing one.');
        updateKeyStatus(apiKey, keyStatusElement, apiKeyInput); // Ensure status reflects saved key
    }
});

// Generation Form Submission
generateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!apiKey) {
        alert('Please save your API key first.');
        return;
    }

    toggleGenerateButton(true, generateButton);
    addStatusMessage('Preparing generation request...', 'info', null, statusMessages);

    let payload;
    try {
        payload = getFormData(generateForm); // Gather and validate form data
    } catch (error) {
        addStatusMessage(`Form validation failed: ${error.message}`, 'FAILURE', null, statusMessages);
        handleApiErrorUI(error, null, statusMessages, generateButton); // Use UI error handler
        return; // Stop submission
    }

    addStatusMessage('Sending generation request...', 'info', null, statusMessages);
    console.log('Sending payload:', JSON.stringify(payload, null, 2));

    try {
        const data = await submitGenerationRequest(apiKey, payload);
        if (data.task_id) {
            addStatusMessage(`Request successful! Task ID: ${data.task_id}. Starting status check.`, 'info', data.task_id, statusMessages);
            // Start polling, passing necessary UI callbacks
            pollGenerationStatus(
                data.task_id,
                apiKey,
                (message, type) => addStatusMessage(message, type, data.task_id, statusMessages),
                (result) => renderResult(result, resultsContainer),
                (error) => handleApiErrorUI(error, data.task_id, statusMessages, generateButton), // Pass UI error handler
                () => toggleGenerateButton(false, generateButton) // Callback to re-enable button on final state
            );
        } else {
            throw new Error('API response successful but did not contain task_id.');
        }
    } catch (error) {
        // Handle errors specifically from the initial POST request
        handleApiErrorUI(error, null, statusMessages, generateButton); // Use UI error handler
    }
});