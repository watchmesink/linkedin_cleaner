class LinkedInFeedCleaner {
  constructor() {
    this.processedPosts = new Set();
    this.observer = null;
    this.apiKey = '';
    this.systemPrompt = '';
    this.filterMode = 'hide'; // 'hide' | 'blur'
    this.muteWords = [];
    this.hideCommentActivity = true;
    this.hidePeopleSuggestions = true;
    this.processPostsDebounced = this.debounce(() => this.processPosts(), 300);
    
    // Performance optimizations
    this.selectorCache = new Map();
    this.apiRequestCount = 0;
    this.apiRequestLimit = 100; // Prevent API spam
    this.apiRequestWindow = 60000; // 1 minute window
    this.lastApiReset = Date.now();
    
    this.init();
  }

  // Simple debounce helper to limit how often we re-process DOM changes
  debounce(fn, wait) {
    let timeoutId = null;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async init() {
    await this.loadSettings();
    this.startObserving();
    this.processPosts();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['geminiApiKey', 'systemPrompt', 'filterMode', 'muteWords'], (result) => {
        this.apiKey = result.geminiApiKey || '';
        this.systemPrompt = result.systemPrompt || this.getDefaultPrompt();
        this.filterMode = result.filterMode || 'hide';
        this.muteWords = Array.isArray(result.muteWords)
          ? result.muteWords
          : (typeof result.muteWords === 'string' && result.muteWords.trim().length > 0
              ? result.muteWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
              : []);
        resolve();
      });
    });
  }

  getDefaultPrompt() {
    return `# LinkedIn Post Analysis — STRICT

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

## Pre-processing & general rules
- Trim whitespace. Treat multiple spaces/newlines as single separators.
- Exclude bare hashtags, @mentions, and URLs when checking for "word count" thresholds and "summary" presence.
- If borderline between two scores, ROUND DOWN.
- Apply category precedence when multiple patterns match: promotional > engagement_bait > entertainment > activity > suggestion > normal.

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
   - Contains "Promoted"/"Sponsored" or sales/marketing CTAs: "sign up", "register", "book a demo", "limited seats", "discount", "coupon", "launching", "we just shipped", "webinar" (without educational summary), "hiring"/"we're hiring" without role details & actionable info.

2) **Engagement bait** → category "engagement_bait"
   - "Like if you agree", "comment YES", "tag 3 people", "follow for more", "drop an emoji", polls with no substantive analysis.

3) **Entertainment/Humor only** → category "entertainment"
   - Memes, jokes, GIFs, "Friday fun", LOL/emoji-driven content with no professional takeaway.

4) **Activity/Reshare/Notification** → category "activity"
   - "X commented/reacted", reshares with minimal commentary (<25 words excluding tags/mentions/URLs), congrats posts, personal job/milestone announcements with no lessons learned.

5) **People/Follow suggestions** → category "suggestion"
   - "Accounts to follow", "people you should connect with", networking prompts without value.

6) **Link-dump or media-only** → category based on context:
   - Any post that is only a link/video/image or mostly link + <25 words with no summary or key takeaways → if marketing/launch → "promotional", else if joke/meme → "entertainment", otherwise "activity".

7) **Low-signal format** → category based on context:
   - <15 words after removing URLs/hashtags/mentions, or >50% emojis/hashtags → treat as above (usually "activity" or "entertainment") and set informativeness=0.

## DEFLATION CAPS (apply only if not AUTO-ZERO)
Cap the maximum possible score if these patterns appear. Never exceed the cap:

- **Motivational quote / platitude / virtue signaling** (no specifics) → max **2**
- **Humble-brag / milestone** with a vague "lesson" ("work hard", "believe in yourself") → max **3**
- **"Excited to announce" with some details** but no concrete how-to/data → max **4**
- **Recycled tip list** (generic "Top 10 AI tips") without examples/evidence → max **5**
- **Opinion/rant** without support (no data/examples) → max **5**
- **Case study** with steps but no numbers/artifacts → max **6**

## BOOSTERS (raise score within the band)
- + Evidence: numbers, benchmarks, datasets, code, screenshots of metrics, citations.
- + Specificity: concrete steps/checklists tied to real scenarios.
- + Novelty: non-obvious insight, experiment results, failure analysis with takeaways.

## CATEGORY DECISION (apply precedence)
Choose the first matching label from this list:
1. promotional
2. engagement_bait
3. entertainment
4. activity
5. suggestion
6. normal

## Examples (illustrative, not to output)
- "We're hiring! Apply here." → {"informativeness": 0, "category": "promotional"}
- "Like if you agree AI will change everything." → {"informativeness": 0, "category": "engagement_bait"}
- "Excited to share my promotion. So grateful." → {"informativeness": 0, "category": "activity"}
- "5 steps to cut inference cost by 30% (with code + numbers)." → {"informativeness": 8-10, "category": "normal"}`;
  }

  startObserving() {
    this.observer = new MutationObserver((mutations) => {
      // Debounced processing to avoid duplicate work during rapid DOM changes
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          this.processPostsDebounced();
          break;
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async processPosts() {
    const posts = this.getLinkedInPosts();
    for (const post of posts) {
      const postId = this.getPostUniqueId(post);
      if (this.processedPosts.has(postId)) {
        continue;
      }
      // Mark early to avoid re-entrancy while awaiting
      this.processedPosts.add(postId);
      await this.processPost(post);
      post.setAttribute('data-linkedin-cleaner-processed', '1');
    }
  }

  getLinkedInPosts() {
    // Focus on canonical post containers only to avoid nested duplicates
    const selectors = [
      '.occludable-update',
      'article[data-urn^="urn:li:activity:"]',
      'div[data-urn^="urn:li:activity:"]'
    ];

    const candidates = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => candidates.push(el));
    }

    const visibleUnprocessed = [];
    for (const el of candidates) {
      const canonical = this.getCanonicalPostElement(el);
      if (!canonical) continue;
      if (canonical.getAttribute('data-linkedin-cleaner-hidden') === '1') continue;
      if (canonical.getAttribute('data-linkedin-cleaner-processed') === '1') continue;
      const rect = canonical.getBoundingClientRect();
      if (rect.height <= 0 || rect.width <= 0) continue;
      visibleUnprocessed.push(canonical);
    }

    // Dedupe by stable id
    const byId = new Map();
    for (const post of visibleUnprocessed) {
      const id = this.getPostUniqueId(post);
      byId.set(id, post);
    }
    return Array.from(byId.values());
  }

  getCanonicalPostElement(element) {
    // Prefer LinkedIn's occludable update container where possible
    return (
      element.closest('.occludable-update') ||
      element.closest('article[data-urn^="urn:li:activity:"]') ||
      element.closest('div[data-urn^="urn:li:activity:"]') ||
      element
    );
  }

  getPostUniqueId(element) {
    // Prefer a URN inside the element subtree for stability
    const urnNode = element.getAttribute('data-urn')
      ? element
      : element.querySelector('[data-urn^="urn:li:activity:"]');
    const urn = urnNode ? urnNode.getAttribute('data-urn') : null;
    if (urn) return `urn:${urn}`;
    const dataIdNode = element.getAttribute('data-id') ? element : element.querySelector('[data-id*="urn:li:activity:"]');
    const dataId = dataIdNode ? dataIdNode.getAttribute('data-id') : null;
    if (dataId) return `dataid:${dataId}`;

    // Fallback: stable hash of trimmed visible text
    const text = (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return `txt:${hash}`;
  }

  extractPostContent(post) {
    const textSelectors = [
      '.feed-shared-text',
      '.attributed-text-segment-list__content',
      '.feed-shared-inline-show-more-text',
      '.feed-shared-text__text-view',
      '.update-components-text',
      '[data-test-id="main-feed-activity-card"] .attributed-text-segment-list__content'
    ];
    
    let content = '';
    
    for (const selector of textSelectors) {
      const textElement = post.querySelector(selector);
      if (textElement) {
        content += textElement.innerText.trim() + ' ';
      }
    }

    // Robust author extraction (name, role, avatar)
    const actorRoot = post.querySelector(
      '.update-components-actor, .feed-shared-actor, .update-components-actor__meta, header'
    ) || post;

    // Prefer anchor text for the author name to avoid container duplicates
    const directAnchor = actorRoot.querySelector('.update-components-actor__name a, .feed-shared-actor__name a, a[href*="/in/"]');
    let authorName = '';
    if (directAnchor && directAnchor.textContent) {
      authorName = this.normalizeName(directAnchor.textContent);
    } else {
      const nameSelectors = [
        '.update-components-actor__name',
        '.feed-shared-actor__name',
        'a.update-components-actor__meta-link',
        '[data-test-id="actor-name"]',
        'span.update-components-actor__name'
      ];
      for (const sel of nameSelectors) {
        const el = actorRoot.querySelector(sel);
        if (el && el.textContent) {
          const t = this.normalizeName(el.textContent);
          if (t && t.length > 1 && t.length < 120) { authorName = t; break; }
        }
      }
    }

    const roleSelectors = [
      '.update-components-actor__sub-description',
      '.feed-shared-actor__sub-description'
    ];
    let authorRole = '';
    for (const sel of roleSelectors) {
      const el = actorRoot.querySelector(sel);
      if (el && el.textContent) { authorRole = el.textContent.trim(); break; }
    }
    if (authorRole) {
      authorRole = this.normalizeRole(authorRole, authorName);
    }

    const avatarSelectors = [
      'img.update-components-actor__avatar-image',
      'img.feed-shared-actor__avatar-image',
      'img.entity-image',
      'img.ivm-view-attr__img--entity'
    ];
    let authorAvatar = '';
    for (const sel of avatarSelectors) {
      const img = actorRoot.querySelector(sel);
      if (img) {
        authorAvatar = img.getAttribute('src') || img.getAttribute('data-delayed-url') || img.getAttribute('data-src') || '';
        if (authorAvatar) break;
      }
    }

    const author = authorName || 'Unknown';

    return {
      content: content.trim(),
      author: author,
      authorName: authorName,
      authorRole: authorRole,
      authorAvatar: authorAvatar,
      element: post
    };
  }

  async analyzePost(content, author) {
    if (!this.apiKey) {
      console.warn('LinkedIn Feed Cleaner: No Gemini API key configured');
      return { informativeness: 8, category: 'normal' };
    }

    // API rate limiting
    const now = Date.now();
    if (now - this.lastApiReset > this.apiRequestWindow) {
      this.apiRequestCount = 0;
      this.lastApiReset = now;
    }
    
    if (this.apiRequestCount >= this.apiRequestLimit) {
      console.warn('LinkedIn Feed Cleaner: API rate limit reached, skipping analysis');
      return { informativeness: 8, category: 'normal' };
    }

    this.apiRequestCount++;

    const prompt = this.systemPrompt
      .replace('{{author}}', author)
      .replace('{{content}}', content);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        console.error('LinkedIn Feed Cleaner: Gemini API error:', data.error);
        return { informativeness: 8, category: 'normal' };
      }
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        const jsonMatch = text.match(/\{[^}]+\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Handle error responses from AI
          if (parsed.error) {
            console.warn('LinkedIn Feed Cleaner: AI returned error:', parsed.error);
            return { informativeness: 8, category: 'normal' };
          }
          
          return {
            informativeness: parseInt(parsed.informativeness) || 8,
            category: parsed.category || 'normal'
          };
        }
      }
      
      return { informativeness: 8, category: 'normal' };
    } catch (error) {
      console.error('LinkedIn Feed Cleaner: Error analyzing post:', error);
      return { informativeness: 8, category: 'normal' };
    }
  }

  async processPost(postElement) {
    try {
      const postData = this.extractPostContent(postElement);

      // Skip posts with minimal content
      if (!postData.content || postData.content.length < 10) {
        return;
      }

      // Only keep mute words functionality as it's user-configurable
      const muteReason = this.isMutedByWords(postData.content);
      if (muteReason) {
        this.hidePost(postElement, { informativeness: 0, category: 'muted' }, postData);
        return;
      }
      
      // Let AI handle all pattern detection and scoring
      const analysis = await this.analyzePost(postData.content, postData.author);
      
      // Hide posts with low informativeness (score < 7) or any auto-flagged categories
      if (analysis.informativeness < 7 || analysis.informativeness === 0) {
        this.hidePost(postElement, analysis, postData);
      } else {
        // Add score indicator to visible posts
        this.addScoreIndicator(postElement, analysis);
      }
      
    } catch (error) {
      console.error('LinkedIn Feed Cleaner: Error processing post:', error);
    }
  }

  hidePost(postElement, analysis, postData) {
    // Prevent duplicate indicators
    if (postElement.previousElementSibling && postElement.previousElementSibling.classList.contains('linkedin-cleaner-indicator')) {
      return;
    }

    if (this.filterMode === 'blur') {
      postElement.classList.add('linkedin-cleaner-blur');
    } else {
      postElement.style.display = 'none';
      postElement.classList.add('linkedin-cleaner-hidden');
    }
    postElement.setAttribute('data-linkedin-cleaner-hidden', '1');
    
    const firstWords = postData.content.split(' ').slice(0, 10).join(' ');
    const truncatedContent = firstWords + (postData.content.split(' ').length > 10 ? '...' : '');
    
    const hiddenIndicator = document.createElement('div');
    hiddenIndicator.className = 'linkedin-cleaner-indicator';
    let scoreText = '';
    let explanation = '';
    
    // Use AI-provided category and score
    const category = analysis.category || 'normal';
    switch (category) {
      case 'promotional':
        scoreText = '0/10';
        explanation = 'Promotional content';
        break;
      case 'engagement_bait':
        scoreText = '0/10';
        explanation = 'Engagement bait';
        break;
      case 'entertainment':
        scoreText = '0/10';
        explanation = 'Entertainment only';
        break;
      case 'activity':
        scoreText = '0/10';
        explanation = 'Activity post';
        break;
      case 'suggestion':
        scoreText = '0/10';
        explanation = 'People suggestion';
        break;
      case 'muted':
        scoreText = 'Muted';
        explanation = 'Contains muted words';
        break;
      default:
        scoreText = `${analysis.informativeness}/10`;
        explanation = 'Low informativeness';
    }
    const avatarHtml = postData.authorAvatar ? `<img class="author-avatar" src="${postData.authorAvatar}" alt="">` : '';
    const roleHtml = postData.authorRole ? `<div class="author-role">${postData.authorRole}</div>` : '';
    hiddenIndicator.innerHTML = `
      <div class="hidden-post-notice">
        <div class="hidden-post-left">
          ${avatarHtml}
          <div class="author-meta">
            <div class="author-name">${postData.authorName || postData.author}</div>
            ${roleHtml}
            <div class="post-preview">"${truncatedContent}"</div>
            <div class="filter-reason">${explanation} (${scoreText})</div>
          </div>
        </div>
        <div class="hidden-post-right">
          <button class="show-hidden-post">Show</button>
        </div>
      </div>
    `;
    
    hiddenIndicator.querySelector('.show-hidden-post').addEventListener('click', () => {
      if (this.filterMode === 'blur') {
        postElement.classList.remove('linkedin-cleaner-blur');
      } else {
        postElement.style.display = '';
      }
      hiddenIndicator.remove();
      postElement.classList.remove('linkedin-cleaner-hidden');
      postElement.removeAttribute('data-linkedin-cleaner-hidden');
    });
    
    postElement.parentNode.insertBefore(hiddenIndicator, postElement);
  }

  addScoreIndicator(postElement, analysis) {
    // Prevent duplicate indicators
    if (postElement.querySelector('.linkedin-cleaner-score-badge')) {
      return;
    }

    const scoreIndicator = document.createElement('div');
    scoreIndicator.className = 'linkedin-cleaner-score-badge';
    scoreIndicator.innerHTML = `<span class="score-value">${analysis.informativeness}/10</span>`;
    
    // Try to find the best position for the score indicator
    const headerElement = postElement.querySelector('.update-components-header, .feed-shared-actor, header');
    if (headerElement) {
      headerElement.style.position = 'relative';
      headerElement.appendChild(scoreIndicator);
    } else {
      // Fallback: add to top of post
      postElement.style.position = 'relative';
      postElement.appendChild(scoreIndicator);
    }
  }

  isMutedByWords(contentText) {
    if (!this.muteWords || this.muteWords.length === 0) return false;
    const haystack = (contentText || '').toLowerCase();
    return this.muteWords.some((word) => word && haystack.includes(word));
  }

  collapseDuplicate(text) {
    const mid = Math.floor(text.length / 2);
    const first = text.slice(0, mid);
    const second = text.slice(text.length % 2 === 0 ? mid : mid + 1);
    if (first === second) return first.trim();
    return text;
  }

  normalizeName(raw) {
    if (!raw) return '';
    let t = String(raw).trim();
    t = t.replace(/\s*•.*$/, ''); // remove trailing bullet section
    t = t.replace(/\s+\d+(st|nd|rd|th)\b.*/, ''); // remove connection level
    t = t.replace(/\s{2,}/g, ' ').trim();
    // Token-duplicate check (e.g., "John Doe John Doe")
    const tokens = t.split(/\s+/);
    if (tokens.length % 2 === 0) {
      const half = tokens.length / 2;
      const firstHalf = tokens.slice(0, half).join(' ');
      const secondHalf = tokens.slice(half).join(' ');
      if (firstHalf === secondHalf) t = firstHalf;
    }
    // Character-level duplicate (e.g., concatenated without space)
    const compact = t.replace(/\s+/g, '');
    const m = compact.match(/^(.+?)\1$/);
    if (m) {
      const candidate = m[1];
      // Try to rebuild spacing from original tokens
      if (tokens.length >= 2) t = tokens.slice(0, tokens.length / 2).join(' ');
      else t = candidate;
    }
    return t.trim();
  }

  normalizeRole(raw, authorName) {
    if (!raw) return '';
    let r = String(raw).trim();
    // Normalize whitespace and remove obvious trailing sections
    r = r.replace(/\s{2,}/g, ' ').replace(/[\u00B7•]+/g, ' • ').trim();

    // Split into segments on bullets, pipes, dashes, or sentence boundaries
    const segments = r
      .split(/\s*[•\u00B7\|\-–—]+\s|\.(?=\s|[A-Z])/)
      .map(s => s.trim())
      .filter(Boolean);

    const seen = new Set();
    const cleaned = [];
    for (let seg of segments) {
      // Drop if it contains the author name or connection level
      if (authorName && seg.toLowerCase().includes(authorName.toLowerCase())) continue;
      if (/\b\d+(st|nd|rd|th)\b/i.test(seg)) continue;
      // Drop time/meta segments
      if (/(\b\d+\s*(h|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|year|years)\b|edited|visible to anyone|followers|connections)/i.test(seg)) continue;
      // Drop generic tags
      if (/(^|\b)(premium|influencer|opentowork|open to work)($|\b)/i.test(seg)) continue;
      // Collapse duplicate halves within the segment
      seg = this.collapseDuplicate(seg.replace(/\s{2,}/g, ' ').trim());
      if (!seg) continue;
      const key = seg.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(seg);
    }

    let result = cleaned.join(', ');
    // Trim excessive length
    if (result.length > 160) result = result.slice(0, 160) + '…';
    return result;
  }
}

if (window.location.hostname === 'www.linkedin.com') {
  const cleaner = new LinkedInFeedCleaner();
}