chrome.action.onClicked.addListener((tab) => {
  if (tab.url) {
    sendToVidralo(tab.url);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-to-vidralo",
    title: "Send to Vidralo",
    contexts: ["link", "page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  if (url) {
    sendToVidralo(url);
  }
});

function sendToVidralo(url) {
  const encodedUrl = encodeURIComponent(url);
  const deepLink = `vidralo://download?url=${encodedUrl}`;
  
  chrome.tabs.create({ url: deepLink, active: false }, (tab) => {
    setTimeout(() => {
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id);
      }
    }, 1000);
  });
}
