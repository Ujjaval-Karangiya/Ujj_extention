// background.js - Service worker for LinkedIn Comment ID Extractor & Reviewer

// Configure Chrome Side Panel to open automatically when user clicks extension icon in toolbar
function setupSidePanel() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.log("[Background] Side panel behavior note:", error));
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("LinkedIn Comment ID Extractor & Reviewer installed.");
  setupSidePanel();

  chrome.storage.local.get(["extractedProfiles", "history", "activeReviewIndex"], (result) => {
    if (!result.extractedProfiles) {
      chrome.storage.local.set({ extractedProfiles: [] });
    }
    if (!result.history) {
      chrome.storage.local.set({ history: [] });
    }
    if (typeof result.activeReviewIndex !== "number") {
      chrome.storage.local.set({ activeReviewIndex: 0 });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupSidePanel();
});

// Explicit action click handler in case browser requires explicit open call
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.warn("[Background] Could not open side panel directly:", err);
      }
    }
  });
}

// Handler for navigation & extraction commands
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "NAVIGATE_AND_EXTRACT") {
    const targetUrl = request.url;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0] ? tabs[0] : null;

      const isRestrictedUrl = (u) =>
        !u ||
        u.startsWith("chrome://") ||
        u.startsWith("chrome-extension://") ||
        u.startsWith("edge://") ||
        u.startsWith("about:") ||
        u.startsWith("devtools://");

      const handleTab = (targetTab) => {
        const tabId = targetTab.id;

        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);

            setTimeout(() => {
              chrome.tabs.sendMessage(
                tabId,
                {
                  action: "START_EXTRACTION",
                  autoExpand: request.autoExpand,
                  maxExpandRounds: request.maxExpandRounds || 100,
                  maxLimit: request.maxLimit || 1000,
                  sourceUrl: targetUrl
                },
                () => {
                  if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript(
                      { target: { tabId: tabId }, files: ["content.js"] },
                      () => {
                        setTimeout(() => {
                          chrome.tabs.sendMessage(tabId, {
                            action: "START_EXTRACTION",
                            autoExpand: request.autoExpand,
                            maxExpandRounds: request.maxExpandRounds || 25,
                            sourceUrl: targetUrl
                          });
                        }, 500);
                      }
                    );
                  }
                }
              );
            }, 2000);
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs.update(tabId, { url: targetUrl }, (updated) => {
          if (chrome.runtime.lastError || !updated) {
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.tabs.create({ url: targetUrl, active: true }, handleTab);
          }
        });
        sendResponse({ status: "navigating_tab", tabId: tabId });
      };

      if (activeTab && !isRestrictedUrl(activeTab.url)) {
        handleTab(activeTab);
      } else {
        chrome.tabs.create({ url: targetUrl, active: true }, handleTab);
      }
    });

    return true; // Keep sendResponse async
  }
});
