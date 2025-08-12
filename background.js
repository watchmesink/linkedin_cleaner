chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Feed Cleaner extension installed');
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.url.includes('linkedin.com')) {
    chrome.tabs.reload(tab.id);
  } else {
    chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
  }
});