const DEFAULT_PROMPT = `# LinkedIn Post Analysis — STRICT

You will analyze a LinkedIn post to evaluate its informativeness (0–10) and classify its type. 
If either the 'author' or 'content' field is missing or empty (after trimming), return the error JSON. 
Otherwise, follow the rules below.

## Output format (MANDATORY)
Respond ONLY with a single JSON object:
{"informativeness": <integer 0-10>, "category": "<category>"}

Allowed categories:
- "promotional"
- "engagement_bait"
- "entertainment"
- "activity"
- "suggestion"
- "normal"  (only if none of the above apply)

Set reasoning_effort = minimal. Do not include any text besides the JSON.

## Input
- Author: {{author}}
- Content: {{content}}

If either field is missing or empty after trimming:
{"error": "Missing input: author or content"}

## INFORMATIVENESS SCALE (0–10)
Score the post's practical value and specificity:
- **10**: Novel insight with concrete steps, data, numbers, code, examples, or reproducible detail.
- **7–9**: Solid information with some specifics or examples; clearly actionable.
- **4–6**: Some utility but lacks depth, evidence, or clear steps.
- **1–3**: Vague, generic, platitudinous, or opinionated without support.
- **0**: Any AUTO-ZERO condition below.

## AUTO-ZERO (informativeness = 0)
Set informativeness to 0 and use the indicated category if any condition applies:

1) **Promotional/Sponsored/Marketing** → category "promotional"
2) **Engagement bait** → category "engagement_bait"
3) **Entertainment/Humor only** → category "entertainment"
4) **Activity/Reshare/Notification** → category "activity"
5) **People/Follow suggestions** → category "suggestion"

## CATEGORY DECISION
Choose the first matching label: promotional > engagement_bait > entertainment > activity > suggestion > normal`;

document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const systemPromptInput = document.getElementById('systemPrompt');
  const resetPromptBtn = document.getElementById('resetPrompt');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const filterModeInputs = Array.from(document.querySelectorAll('input[name="filterMode"]'));
  const muteWordsInput = document.getElementById('muteWords');
  chrome.storage.sync.get(['geminiApiKey', 'systemPrompt', 'filterMode', 'muteWords'], function(result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    
    systemPromptInput.value = result.systemPrompt || DEFAULT_PROMPT;

    const mode = result.filterMode || 'hide';
    const target = filterModeInputs.find(i => i.value === mode) || filterModeInputs[0];
    if (target) target.checked = true;

    const words = Array.isArray(result.muteWords) ? result.muteWords.join(', ') : (result.muteWords || '');
    muteWordsInput.value = words;
  });

  resetPromptBtn.addEventListener('click', function() {
    systemPromptInput.value = DEFAULT_PROMPT;
  });

  saveBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    const systemPrompt = systemPromptInput.value.trim();
    const filterMode = (filterModeInputs.find(i => i.checked)?.value) || 'hide';
    const muteWords = muteWordsInput.value
      .split(',')
      .map(w => w.trim())
      .filter(Boolean);
    
    if (!apiKey) {
      showStatus('Please enter your Gemini API key', 'error');
      return;
    }

    if (!systemPrompt) {
      showStatus('System prompt cannot be empty', 'error');
      return;
    }

    chrome.storage.sync.set({
      geminiApiKey: apiKey,
      systemPrompt: systemPrompt,
      filterMode: filterMode,
      muteWords: muteWords
    }, function() {
      showStatus('Settings saved successfully!', 'success');
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0].url.includes('linkedin.com')) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    });
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
});