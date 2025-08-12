# Changelog

All notable changes to the LinkedIn Feed Cleaner extension will be documented in this file.

## [1.0.0] - 2025-08-12

### 🚀 Initial Release

#### Features
- **AI-Powered Filtering**: Integration with Gemini 2.0 Flash for intelligent content analysis
- **Single Score System**: Informativeness scoring (0-10) replacing complex multi-criteria approach
- **Visual Indicators**: Score badges on visible posts for transparency
- **Category Detection**: Automatic classification of promotional, engagement bait, entertainment, activity, and suggestion posts
- **Customizable Filtering**: User-configurable threshold (default: <7 hidden)
- **Manual Override**: "Show anyway" button for hidden posts with detailed explanations
- **Filter Modes**: Choose between hiding or blurring filtered content

#### Technical
- **Pure AI Filtering**: Removed hardcoded pattern matching in favor of AI analysis
- **Advanced Prompt System**: Strict scoring with deflation caps and boosters
- **Rate Limiting**: 100 requests per minute to prevent API abuse
- **Error Resilience**: Comprehensive error handling with graceful fallbacks
- **Performance Optimized**: 300ms debouncing and efficient DOM operations
- **Secure Storage**: API keys stored locally in Chrome's secure storage

#### User Interface
- **Clean Settings Panel**: Streamlined configuration with performance info
- **Enhanced Visuals**: Improved CSS styling with shadows and transitions
- **Clear Feedback**: Detailed filtering explanations with author info and post previews
- **Privacy Focus**: No data collection, all processing happens locally

#### Developer Experience
- **Modular Architecture**: Clean separation of concerns across components
- **Comprehensive Documentation**: Detailed README with troubleshooting guide
- **Code Quality**: Optimized JavaScript with proper error handling
- **Extensible Design**: Easy to modify prompts and scoring criteria

### Architecture
- `manifest.json`: Chrome extension configuration
- `content.js`: Main filtering logic with AI integration
- `popup.html/js`: Settings interface and user configuration
- `background.js`: Extension background service worker
- `styles.css`: UI styling for indicators and notifications
- `system_prompt.md`: AI analysis prompt with strict scoring rules

---

### Future Roadmap
- [ ] User feedback system for AI training
- [ ] Advanced analytics and filtering statistics
- [ ] Multiple AI model support
- [ ] Batch processing optimization
- [ ] Export/import settings functionality