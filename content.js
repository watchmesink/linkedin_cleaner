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
    return new Promise(async (resolve) => {
      chrome.storage.sync.get(['geminiApiKey', 'systemPrompt', 'filterMode', 'muteWords'], async (result) => {
        this.apiKey = result.geminiApiKey || '';
        this.systemPrompt = result.systemPrompt || await this.getDefaultPrompt();
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

  async getDefaultPrompt() {
    try {
      const response = await fetch(chrome.runtime.getURL('system_prompt.md'));
      const text = await response.text();
      return text;
    } catch (error) {
      console.error('LinkedIn Feed Cleaner: Failed to load system prompt:', error);
      // Fallback prompt
      return `Analyze this LinkedIn post and rate it on a scale of 1-10 for informativeness:

INFORMATIVENESS (1-10): How much valuable, actionable information does this post contain?
- 10: Rich insights, detailed explanations, actionable advice
- 1: No useful information, empty platitudes

Post content:
Author: {{author}}
Content: {{content}}

Respond with ONLY a JSON object in this exact format:
{"informativeness": X, "category": "normal"}`;
    }
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
    
    hiddenIndicator.innerHTML = `
      <div class="hidden-post-notice">
        <div class="hidden-post-left">
          <div class="post-preview">"${truncatedContent}"</div>
          <div class="filter-reason">${explanation} (${scoreText})</div>
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