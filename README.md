# LinkedIn Feed Cleaner

A Chrome extension that uses AI to analyze and hide uninformative, bragging, or useless posts from your LinkedIn feed using advanced content analysis.

## ✨ Features

### 🧠 **AI-Powered Analysis**
- Uses **Google's Gemini 2.0 Flash** for lightning-fast post analysis
- **Single Informativeness Score** (0-10): How much valuable, actionable information does the post contain?
- **Automatic Category Detection**: Promotional, engagement bait, entertainment, activity, suggestions
- **Intelligent Content Understanding**: Context-aware analysis with deflation caps and boosters

### 🎯 **Smart Filtering**
- **Configurable Threshold**: Posts scoring below 7/10 are hidden by default
- **Visual Score Indicators**: See informativeness scores on visible posts
- **Manual Override**: Hidden posts can be revealed with "Show anyway" button
- **Detailed Explanations**: Clear reasoning for why posts were filtered

### 🔒 **Privacy & Performance**
- **Rate Limited**: 100 API requests per minute to prevent spam
- **Local Storage**: Your API key stays in your browser
- **Optimized Performance**: 300ms debouncing and efficient DOM operations
- **Error Resilient**: Graceful fallbacks when API is unavailable

## 🚀 Installation

### 1. **Get a Gemini API Key**
- Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
- Create a new API key
- Copy the key for later use

### 2. **Install the Extension**
- Download or clone this repository
- Open Chrome and navigate to `chrome://extensions/`
- Enable "Developer mode" in the top right
- Click "Load unpacked" and select the extension folder
- The extension icon should appear in your toolbar

### 3. **Configure the Extension**
- Click the extension icon in your toolbar
- Paste your Gemini API key
- Optionally customize the system prompt for analysis
- Choose filter mode (Hide or Blur)
- Add custom mute words if desired
- Click "Save Settings"
- Refresh your LinkedIn feed

## 🔧 How It Works

### **Content Analysis Pipeline**
1. **Detection**: Monitors LinkedIn feed for new posts using optimized DOM observation
2. **Extraction**: Extracts post content, author info, and metadata
3. **Pre-filtering**: Checks mute words before sending to AI
4. **AI Analysis**: Gemini 2.0 Flash analyzes content using our strict prompt system
5. **Filtering**: Posts with low scores or auto-flagged categories are hidden
6. **Display**: Visible posts show informativeness scores, hidden posts show detailed explanations

### **AI Scoring System**
- **10**: Novel insights with concrete steps, data, numbers, code, examples
- **7-9**: Solid information with specifics and actionable elements
- **4-6**: Some utility but lacks depth, evidence, or clear steps
- **1-3**: Vague, generic, platitudinous, or unsupported opinions
- **0**: Auto-flagged categories (promotional, engagement bait, entertainment, etc.)

## 📊 Advanced Features

### **Deflation Caps** (prevents overscoring)
- Motivational quotes/platitudes → max score 2
- Humble brags with vague lessons → max score 3
- Generic announcements → max score 4
- Recycled tip lists → max score 5
- Unsupported opinions → max score 5

### **Boosters** (increases scores within bands)
- Evidence: numbers, benchmarks, datasets, code, metrics
- Specificity: concrete steps tied to real scenarios
- Novelty: non-obvious insights, experiments, failure analysis

### **Auto-Zero Categories**
- **Promotional**: "Sponsored", sales CTAs, product launches
- **Engagement Bait**: "Like if you agree", "Comment YES", emoji requests
- **Entertainment**: Memes, jokes, "Friday fun" without professional value
- **Activity**: "X commented", reshares with minimal commentary
- **Suggestions**: "People to follow", networking prompts

## 🛠️ Development

### **Architecture**
- `manifest.json`: Extension configuration and permissions
- `content.js`: Main filtering logic with AI integration
- `popup.html/js`: Settings interface and configuration
- `background.js`: Extension background service worker
- `styles.css`: UI styling for indicators and hidden posts
- `system_prompt.md`: AI analysis prompt (strict scoring system)

### **Performance Optimizations**
- 300ms debounced DOM observation
- API rate limiting (100 req/min)
- Efficient selector caching
- Error handling with graceful fallbacks
- Optimized JSON parsing and validation

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| Posts not being filtered | Check API key configuration and LinkedIn page refresh |
| Extension not working | Verify you're on linkedin.com, check console for errors |
| API errors | Validate Gemini API key and check quota limits |
| Rate limit reached | Wait for rate limit reset (1 minute window) |
| Scores seem wrong | Review and customize system prompt in settings |

## 📈 Performance Info

- **Model**: Gemini 2.0 Flash
- **Rate Limit**: 100 requests per minute
- **Debounce Delay**: 300ms for optimal responsiveness
- **Fallback Score**: 8/10 when API unavailable
- **Memory**: Optimized DOM operations with selector caching

## 🚨 Privacy & Security

- ✅ API key stored locally in Chrome's secure storage
- ✅ Post content only sent to Google's Gemini API for analysis
- ✅ No data collection or tracking by this extension
- ✅ All processing happens in your browser
- ✅ Rate limiting prevents API abuse
- ✅ Error handling protects against malformed responses

---

**Built with ❤️ for a cleaner, more informative LinkedIn experience**