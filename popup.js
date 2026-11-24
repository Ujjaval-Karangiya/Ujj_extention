// popup.js - Chrome Side Panel Controller for LinkedIn Comment ID Extractor & 1-by-1 Reviewer

document.addEventListener("DOMContentLoaded", () => {
  // Navigation Tabs (Profiles, History)
  const tabExtractBtn = document.getElementById("tab-extract-btn");
  const tabHistoryBtn = document.getElementById("tab-history-btn");

  const extractView = document.getElementById("extract-view");
  const historyView = document.getElementById("history-view");

  // Extract View Elements
  const postUrlInput = document.getElementById("post-url");
  const btnUseCurrent = document.getElementById("btn-use-current");
  const btnPasteUrl = document.getElementById("btn-paste-url");
  const btnClearUrl = document.getElementById("btn-clear-url");
  const chkAutoExpand = document.getElementById("chk-auto-expand");
  const selMaxLimit = document.getElementById("sel-max-limit");
  const inputCustomLimit = document.getElementById("input-custom-limit");
  const selMaxRounds = document.getElementById("sel-max-rounds");

  const btnStart = document.getElementById("btn-start");
  const btnQuick = document.getElementById("btn-quick");
  const btnStop = document.getElementById("btn-stop");

  const statusCard = document.getElementById("status-card");
  const statusTitle = document.getElementById("status-title");
  const statusDetail = document.getElementById("status-detail");
  const progressBar = document.getElementById("progress-bar");

  // 1-by-1 Reviewer Deck Elements
  const reviewerCard = document.getElementById("reviewer-card");
  const reviewCounter = document.getElementById("review-counter");
  const reviewViewedCount = document.getElementById("review-viewed-count");
  const reviewActiveName = document.getElementById("review-active-name");
  const reviewActiveHeadline = document.getElementById("review-active-headline");
  const reviewActiveId = document.getElementById("review-active-id");

  const btnReviewPrev = document.getElementById("btn-review-prev");
  const btnReviewOpen = document.getElementById("btn-review-open");
  const btnReviewNext = document.getElementById("btn-review-next");

  const badgeCount = document.getElementById("badge-count");
  const searchFilter = document.getElementById("search-filter");
  const emptyState = document.getElementById("empty-state");
  const profilesList = document.getElementById("profiles-list");

  const btnCopyIds = document.getElementById("btn-copy-ids");
  const btnCopyUrls = document.getElementById("btn-copy-urls");
  const btnExportCsv = document.getElementById("btn-export-csv");
  const btnExportJson = document.getElementById("btn-export-json");
  const btnClearResults = document.getElementById("btn-clear-results");

  // History Elements
  const historyEmpty = document.getElementById("history-empty");
  const historyList = document.getElementById("history-list");
  const btnClearHistory = document.getElementById("btn-clear-history");

  const toast = document.getElementById("toast");

  // State
  let currentProfiles = [];
  let activeReviewIndex = 0;
  let isExtracting = false;
  let activeTabId = null;

  // Sync state with storage
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.extractedProfiles) {
        currentProfiles = changes.extractedProfiles.newValue || [];
        updateReviewerUI();
        renderProfiles(getFilteredProfiles());
      }
      if (changes.activeReviewIndex !== undefined) {
        activeReviewIndex = changes.activeReviewIndex.newValue || 0;
        updateReviewerUI();
        renderProfiles(getFilteredProfiles());
      }
    }
  });

  // ==========================================
  // SAFE TAB NAVIGATION & DISCOVERY (SIDE PANEL COMPATIBLE)
  // ==========================================
  function isRestrictedUrl(url) {
    if (!url || typeof url !== "string") return true;
    const u = url.toLowerCase();
    return (
      u.startsWith("chrome://") ||
      u.startsWith("chrome-extension://") ||
      u.startsWith("edge://") ||
      u.startsWith("about:") ||
      u.startsWith("devtools://") ||
      u.startsWith("view-source:")
    );
  }

  function getActiveTab(callback) {
    // 1. Try active tab in lastFocusedWindow (standard for Chrome Side Panel)
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url && !isRestrictedUrl(tabs[0].url)) {
        return callback(tabs[0]);
      }
      // 2. Try active tab in currentWindow
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs2) => {
        if (tabs2 && tabs2[0] && tabs2[0].url && !isRestrictedUrl(tabs2[0].url)) {
          return callback(tabs2[0]);
        }
        // 3. Fallback: Any active tab on linkedin.com
        chrome.tabs.query({ active: true }, (tabs3) => {
          const linkedInTab = (tabs3 || []).find((t) => t.url && t.url.includes("linkedin.com"));
          if (linkedInTab) return callback(linkedInTab);
          // 4. Any tab on linkedin.com across all windows
          chrome.tabs.query({ url: "*://*.linkedin.com/*" }, (tabs4) => {
            if (tabs4 && tabs4.length > 0) return callback(tabs4[0]);
            // 5. Final fallback
            callback(tabs && tabs[0] ? tabs[0] : (tabs2 && tabs2[0] ? tabs2[0] : null));
          });
        });
      });
    });
  }

  // Initialization
  checkActiveTab();
  loadStoredData();

  // Tab Navigation Handling
  tabExtractBtn.addEventListener("click", () => switchTab("extract"));
  tabHistoryBtn.addEventListener("click", () => {
    switchTab("history");
    renderHistory();
  });

  function switchTab(tab) {
    [tabExtractBtn, tabHistoryBtn].forEach((btn) => btn.classList.remove("active"));
    [extractView, historyView].forEach((v) => v.classList.remove("active"));

    if (tab === "extract") {
      tabExtractBtn.classList.add("active");
      extractView.classList.add("active");
    } else if (tab === "history") {
      tabHistoryBtn.classList.add("active");
      historyView.classList.add("active");
    }
  }

  // Load Saved Profiles & State
  function loadStoredData() {
    chrome.storage.local.get(["extractedProfiles", "activeReviewIndex"], (res) => {
      currentProfiles = res.extractedProfiles || [];
      activeReviewIndex = typeof res.activeReviewIndex === "number" ? res.activeReviewIndex : 0;
      updateReviewerUI();
      renderProfiles(getFilteredProfiles());
    });
  }

  // Active Tab Check
  function checkActiveTab() {
    getActiveTab((tab) => {
      if (tab) {
        activeTabId = tab.id;
        const currentUrl = tab.url || "";
        if (currentUrl.includes("linkedin.com")) {
          if (
            currentUrl.includes("/feed/update/") ||
            currentUrl.includes("/posts/") ||
            currentUrl.includes("commentUrn") ||
            currentUrl.includes("/feed/")
          ) {
            postUrlInput.value = currentUrl;
          }
        }
      }
    });
  }

  // Input Helpers
  btnUseCurrent.addEventListener("click", () => {
    getActiveTab((tab) => {
      if (tab && tab.url) {
        postUrlInput.value = tab.url;
        showToast("Active tab URL inserted!");
      }
    });
  });

  btnPasteUrl.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        postUrlInput.value = text.trim();
        showToast("URL pasted!");
      }
    } catch (e) {
      postUrlInput.focus();
      showToast("Press Ctrl+V to paste.");
    }
  });

  btnClearUrl.addEventListener("click", () => {
    postUrlInput.value = "";
    postUrlInput.focus();
  });

  // Filter Profiles
  function getFilteredProfiles() {
    let list = currentProfiles;
    const q = searchFilter.value.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (p) =>
          (p.id && p.id.toLowerCase().includes(q)) ||
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.headline && p.headline.toLowerCase().includes(q))
      );
    }
    return list;
  }

  searchFilter.addEventListener("input", () => {
    renderProfiles(getFilteredProfiles());
  });

  // ==========================================
  // 1-BY-1 REVIEWER CONTROLLER
  // ==========================================
  function updateReviewerUI() {
    if (!currentProfiles || currentProfiles.length === 0) {
      reviewerCard.classList.remove("hidden");
      reviewCounter.textContent = "Profile 0 of 0";
      reviewViewedCount.textContent = "0 viewed";
      reviewActiveName.textContent = "No profiles loaded";
      reviewActiveHeadline.textContent = "Extract IDs from post comments below or load from history";
      reviewActiveId.textContent = "@id";
      btnReviewPrev.disabled = true;
      btnReviewNext.disabled = true;
      return;
    }

    reviewerCard.classList.remove("hidden");

    if (activeReviewIndex < 0) activeReviewIndex = 0;
    if (activeReviewIndex >= currentProfiles.length) activeReviewIndex = currentProfiles.length - 1;

    const current = currentProfiles[activeReviewIndex];
    if (!current) return;

    reviewCounter.textContent = `Profile ${activeReviewIndex + 1} of ${currentProfiles.length}`;

    const viewedCount = currentProfiles.filter((p) => p.viewed).length;
    reviewViewedCount.textContent = `${viewedCount}/${currentProfiles.length} viewed`;

    reviewActiveName.textContent = current.name || current.id;
    reviewActiveHeadline.textContent = current.headline || "LinkedIn Member";
    reviewActiveId.textContent = `@${current.id}`;

    btnReviewPrev.disabled = activeReviewIndex <= 0;
    btnReviewNext.disabled = false;
    btnReviewNext.textContent = activeReviewIndex === currentProfiles.length - 1 ? "Next ▶ (End)" : "Next ▶";
  }

  // Click ID Chip on reviewer deck to copy ID
  reviewActiveId.addEventListener("click", () => {
    const current = currentProfiles && currentProfiles[activeReviewIndex];
    if (current && current.id) {
      copyToClipboard(current.id, `Copied ID: ${current.id}`);
    }
  });

  // 1-by-1 Next Button -> Marks viewed and opens NEXT profile
  btnReviewNext.addEventListener("click", () => {
    if (!currentProfiles || currentProfiles.length === 0) return;

    // Mark current as viewed
    currentProfiles[activeReviewIndex].viewed = true;

    if (activeReviewIndex < currentProfiles.length - 1) {
      activeReviewIndex++;
    } else {
      showToast("🎉 You've reached the last profile!");
    }

    const nextProfile = currentProfiles[activeReviewIndex];
    openInCurrentTab(nextProfile.profileUrl);

    chrome.storage.local.set({
      extractedProfiles: currentProfiles,
      activeReviewIndex: activeReviewIndex
    });

    updateReviewerUI();
    renderProfiles(getFilteredProfiles());
  });

  // 1-by-1 Prev Button -> Opens PREVIOUS profile
  btnReviewPrev.addEventListener("click", () => {
    if (!currentProfiles || currentProfiles.length === 0) return;

    if (activeReviewIndex > 0) {
      activeReviewIndex--;
      const prevProfile = currentProfiles[activeReviewIndex];
      openInCurrentTab(prevProfile.profileUrl);

      chrome.storage.local.set({ activeReviewIndex: activeReviewIndex });
      updateReviewerUI();
      renderProfiles(getFilteredProfiles());
    }
  });

  // 1-by-1 Open Current Button -> Re-opens current profile in active tab
  btnReviewOpen.addEventListener("click", () => {
    if (!currentProfiles || currentProfiles.length === 0) return;

    const currentProfile = currentProfiles[activeReviewIndex];
    currentProfile.viewed = true;
    openInCurrentTab(currentProfile.profileUrl);

    chrome.storage.local.set({ extractedProfiles: currentProfiles });
    updateReviewerUI();
    renderProfiles(getFilteredProfiles());
  });

  // ==========================================
  // RENDER PROFILES LIST
  // ==========================================
  function renderProfiles(profilesToRender) {
    badgeCount.textContent = `${profilesToRender.length} IDs`;

    if (!profilesToRender || profilesToRender.length === 0) {
      emptyState.classList.remove("hidden");
      profilesList.innerHTML = "";
      return;
    }

    emptyState.classList.add("hidden");
    profilesList.innerHTML = "";

    profilesToRender.forEach((profile) => {
      const originalIndex = currentProfiles.findIndex((p) => p.id === profile.id);
      const isActive = originalIndex === activeReviewIndex;
      const isViewed = !!profile.viewed;

      let statusBadge = isViewed
        ? `<span class="badge-viewed">✓ Viewed</span>`
        : `<span class="badge-new">New</span>`;

      const li = document.createElement("li");
      li.className = `profile-item ${isActive ? "active-profile" : ""}`;

      const firstLetter = (profile.name || profile.id || "L").charAt(0).toUpperCase();

      li.innerHTML = `
        <div class="profile-avatar">${firstLetter}</div>
        <div class="profile-info">
          <div class="profile-name-row">
            <span class="profile-name" title="Click to view in current tab">${escapeHtml(profile.name)}</span>
            ${statusBadge}
          </div>
          <div class="profile-headline" title="${escapeHtml(profile.headline)}">${escapeHtml(profile.headline)}</div>
          <div class="profile-id-row">
            <span class="id-chip" title="Click to copy ID">@${escapeHtml(profile.id)}</span>
          </div>
          ${profile.commentText
          ? `<div class="profile-comment-snippet" title="${escapeHtml(profile.commentText)}">💬 "${escapeHtml(profile.commentText)}"</div>`
          : ""
        }
        </div>
        <div class="profile-actions">
          <button class="btn-open-sm" title="Open in active tab">
            Open 🌐
          </button>
        </div>
      `;

      // Select and Open profile on click
      const selectAndOpen = () => {
        if (originalIndex !== -1) {
          activeReviewIndex = originalIndex;
        }
        profile.viewed = true;
        chrome.storage.local.set({
          extractedProfiles: currentProfiles,
          activeReviewIndex: activeReviewIndex
        });

        openInCurrentTab(profile.profileUrl);
        updateReviewerUI();
        renderProfiles(getFilteredProfiles());
      };

      li.querySelector(".profile-name").addEventListener("click", (e) => {
        e.stopPropagation();
        selectAndOpen();
      });

      li.querySelector(".btn-open-sm").addEventListener("click", (e) => {
        e.stopPropagation();
        selectAndOpen();
      });

      li.addEventListener("click", () => {
        selectAndOpen();
      });

      li.querySelector(".id-chip").addEventListener("click", (e) => {
        e.stopPropagation();
        copyToClipboard(profile.id, `Copied ID: ${profile.id}`);
      });

      profilesList.appendChild(li);
    });
  }

  // ==========================================
  // SAFE TAB NAVIGATION (SIDE PANEL COMPATIBLE)
  // ==========================================
  function openInCurrentTab(url) {
    if (!url) return;

    getActiveTab((activeTab) => {
      // If active tab is a restricted browser internal page (like chrome://extensions), create tab
      if (!activeTab || isRestrictedUrl(activeTab.url)) {
        chrome.tabs.create({ url: url, active: true }, (newTab) => {
          if (newTab) activeTabId = newTab.id;
        });
        return;
      }

      // Safe update using callback with lastError check
      try {
        chrome.tabs.update(activeTab.id, { url: url }, (updatedTab) => {
          if (chrome.runtime.lastError || !updatedTab) {
            console.warn("[SidePanel] tabs.update was rejected, opening tab:", chrome.runtime.lastError?.message);
            chrome.tabs.create({ url: url, active: true });
          }
        });
      } catch (err) {
        console.warn("[SidePanel] Exception updating tab:", err);
        chrome.tabs.create({ url: url, active: true });
      }
    });
  }

  // ==========================================
  // EXTRACTION EXECUTION (LIMITS UP TO 1000)
  // ==========================================
  if (selMaxLimit) {
    selMaxLimit.addEventListener("change", () => {
      if (selMaxLimit.value === "custom") {
        inputCustomLimit.classList.remove("hidden");
        inputCustomLimit.focus();
      } else {
        inputCustomLimit.classList.add("hidden");
      }
    });
  }

  function getMaxLimitValue() {
    let limit = 1000;
    if (selMaxLimit && selMaxLimit.value === "custom") {
      limit = parseInt(inputCustomLimit.value, 10) || 1000;
    } else if (selMaxLimit) {
      limit = parseInt(selMaxLimit.value, 10) || 1000;
    }
    return Math.min(1000, Math.max(1, limit));
  }

  btnQuick.addEventListener("click", () => {
    getActiveTab((activeTab) => {
      if (!activeTab || !activeTab.url || !activeTab.url.includes("linkedin.com")) {
        alert("Please open a LinkedIn post in the active tab to scan comments.");
        return;
      }

      const targetLimit = getMaxLimitValue();

      setExtractingState(true);
      updateStatus("Quick Scanning...", `Extracting visible commenter IDs (Limit: ${targetLimit})...`, 50);

      ensureContentScriptInjected(activeTab.id, () => {
        chrome.tabs.sendMessage(activeTab.id, { action: "QUICK_EXTRACT", maxLimit: targetLimit }, (res) => {
          setExtractingState(false);
          if (chrome.runtime.lastError) {
            console.warn("[SidePanel] QUICK_EXTRACT error:", chrome.runtime.lastError.message);
            updateStatus("Could not connect", "Please refresh the LinkedIn page (F5) and try again.", 0);
            showToast("Please refresh the LinkedIn page (F5)");
            return;
          }
          if (res && res.profiles && res.profiles.length > 0) {
            currentProfiles = res.profiles;
            activeReviewIndex = 0;
            updateReviewerUI();
            renderProfiles(getFilteredProfiles());
            updateStatus("Scan Complete!", `Found ${res.count} LinkedIn IDs.`, 100);
            showToast(`Quick Scan: Found ${res.count} IDs!`);
          } else {
            updateStatus("Scan Finished", "No commenter IDs found on this page.", 100);
            showToast("No commenter IDs found on this page.");
          }
          setTimeout(() => statusCard.classList.add("hidden"), 3000);
        });
      });
    });
  });

  btnStart.addEventListener("click", () => {
    const inputUrl = postUrlInput.value.trim();
    const autoExpand = chkAutoExpand.checked;
    const maxRounds = parseInt(selMaxRounds.value, 10) || 100;
    const maxLimit = getMaxLimitValue();

    getActiveTab((activeTab) => {
      const currentTabUrl = activeTab ? activeTab.url : "";
      let targetUrl = inputUrl || currentTabUrl;

      if (!targetUrl || !targetUrl.includes("linkedin.com")) {
        alert("Please enter a valid LinkedIn post link or open a LinkedIn post tab.");
        postUrlInput.focus();
        return;
      }

      setExtractingState(true);
      updateStatus("Starting extraction...", `Target limit: ${maxLimit} IDs (${maxRounds} max rounds)...`, 15);

      const isSamePage = normalizeUrl(targetUrl) === normalizeUrl(currentTabUrl);

      if (isSamePage && activeTab && activeTab.id) {
        ensureContentScriptInjected(activeTab.id, () => {
          chrome.tabs.sendMessage(
            activeTab.id,
            {
              action: "START_EXTRACTION",
              autoExpand: autoExpand,
              maxExpandRounds: maxRounds,
              maxLimit: maxLimit,
              sourceUrl: targetUrl
            },
            (res) => {
              if (chrome.runtime.lastError) {
                console.warn("[SidePanel] START_EXTRACTION error:", chrome.runtime.lastError.message);
                setExtractingState(false);
                updateStatus("Could not connect", "Please refresh the LinkedIn page (F5) and try again.", 0);
                showToast("Please refresh the LinkedIn page (F5)");
              }
            }
          );
        });
      } else {
        const startExtractionOnLoad = (targetTabId) => {
          let hasStarted = false;
          const trigger = () => {
            if (hasStarted) return;
            hasStarted = true;
            chrome.tabs.onUpdated.removeListener(listener);
            updateStatus("Page loaded", `Scanning comments (Limit: ${maxLimit})...`, 35);
            setTimeout(() => {
              ensureContentScriptInjected(targetTabId, () => {
                chrome.tabs.sendMessage(
                  targetTabId,
                  {
                    action: "START_EXTRACTION",
                    autoExpand: autoExpand,
                    maxExpandRounds: maxRounds,
                    maxLimit: maxLimit,
                    sourceUrl: targetUrl
                  },
                  (res) => {
                    if (chrome.runtime.lastError) {
                      console.warn("[SidePanel] START_EXTRACTION error:", chrome.runtime.lastError.message);
                      setExtractingState(false);
                      updateStatus("Could not connect", "Please refresh the LinkedIn page (F5) and try again.", 0);
                      showToast("Please refresh the LinkedIn page (F5)");
                    }
                  }
                );
              });
            }, 2000);
          };

          const listener = (tid, changeInfo) => {
            if (tid === targetTabId && changeInfo.status === "complete") {
              trigger();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(trigger, 4000);
        };

        if (!activeTab || isRestrictedUrl(currentTabUrl)) {
          updateStatus("Opening post tab...", "Loading LinkedIn post", 20);
          chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
            if (newTab) {
              activeTabId = newTab.id;
              startExtractionOnLoad(newTab.id);
            }
          });
        } else {
          updateStatus("Navigating to post...", "Loading LinkedIn post", 20);
          chrome.tabs.update(activeTab.id, { url: targetUrl }, (updatedTab) => {
            if (chrome.runtime.lastError || !updatedTab) {
              console.warn("[SidePanel] tabs.update failed, opening in new tab:", chrome.runtime.lastError?.message);
              chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
                if (newTab) {
                  activeTabId = newTab.id;
                  startExtractionOnLoad(newTab.id);
                }
              });
              return;
            }
            startExtractionOnLoad(activeTab.id);
          });
        }
      }
    });
  });

  btnStop.addEventListener("click", () => {
    getActiveTab((activeTab) => {
      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, { action: "STOP_EXTRACTION" });
      }
    });
    setExtractingState(false);
    updateStatus("Extraction stopped.", "Saved extracted IDs.", 100);
    setTimeout(() => statusCard.classList.add("hidden"), 2500);
  });

  // Message listener from content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "EXTRACTION_STATUS") {
      updateStatus(request.message, "Analyzing comments container...", 20);
    } else if (request.action === "EXTRACTION_PROGRESS") {
      const maxLimit = request.maxLimit || getMaxLimitValue();
      const percent = Math.min(95, Math.round((request.count / maxLimit) * 100));
      updateStatus(`Expanding comments... (${request.count}/${maxLimit} IDs)`, request.message, percent);
      badgeCount.textContent = `${request.count} IDs`;
    } else if (request.action === "EXTRACTION_COMPLETE") {
      setExtractingState(false);
      updateStatus("Extraction Complete!", request.message, 100);
      currentProfiles = request.profiles || [];
      activeReviewIndex = 0;
      updateReviewerUI();
      renderProfiles(getFilteredProfiles());
      showToast(`Success! Extracted ${request.count} LinkedIn IDs.`);
      setTimeout(() => statusCard.classList.add("hidden"), 3000);
    } else if (request.action === "EXTRACTION_ERROR") {
      setExtractingState(false);
      updateStatus("Error during extraction", request.error, 0);
      showToast("Error: " + request.error);
    }
  });

  function setExtractingState(extracting) {
    isExtracting = extracting;
    if (extracting) {
      btnStart.classList.add("hidden");
      btnQuick.classList.add("hidden");
      btnStop.classList.remove("hidden");
      statusCard.classList.remove("hidden");
    } else {
      btnStart.classList.remove("hidden");
      btnQuick.classList.remove("hidden");
      btnStop.classList.add("hidden");
    }
  }

  function updateStatus(title, detail, progressPercent) {
    statusTitle.textContent = title;
    statusDetail.textContent = detail;
    if (progressPercent !== undefined) {
      progressBar.style.width = `${progressPercent}%`;
    }
  }

  function ensureContentScriptInjected(tabId, callback) {
    chrome.tabs.sendMessage(tabId, { action: "PING" }, (response) => {
      if (chrome.runtime.lastError || !response || response.status !== "pong") {
        console.log("[SidePanel] PING failed, injecting content.js into tab", tabId);
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: ["content.js"]
          },
          (results) => {
            if (chrome.runtime.lastError) {
              console.warn("[SidePanel] executeScript error:", chrome.runtime.lastError.message);
            }
            setTimeout(callback, 300);
          }
        );
      } else {
        callback();
      }
    });
  }

  function normalizeUrl(url) {
    if (!url) return "";
    return url.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
  }

  // ==========================================
  // EXPORT TOOLBAR ACTIONS
  // ==========================================
  btnCopyIds.addEventListener("click", () => {
    const profiles = getFilteredProfiles();
    if (profiles.length === 0) return showToast("No profiles to copy.");
    const idsText = profiles.map((p) => p.id).join("\n");
    copyToClipboard(idsText, `Copied ${profiles.length} IDs to clipboard!`);
  });

  btnCopyUrls.addEventListener("click", () => {
    const profiles = getFilteredProfiles();
    if (profiles.length === 0) return showToast("No profiles to copy.");
    const urlsText = profiles.map((p) => p.profileUrl).join("\n");
    copyToClipboard(urlsText, `Copied ${profiles.length} Profile URLs!`);
  });

  btnExportCsv.addEventListener("click", () => {
    const profiles = getFilteredProfiles();
    if (profiles.length === 0) return showToast("No profiles to export.");

    let csvContent = "LinkedIn ID,Name,Headline,Profile URL,Viewed,Extracted At\n";
    profiles.forEach((p) => {
      const row = [
        `"${escapeCsv(p.id)}"`,
        `"${escapeCsv(p.name)}"`,
        `"${escapeCsv(p.headline)}"`,
        `"${escapeCsv(p.profileUrl)}"`,
        `"${p.viewed ? "Yes" : "No"}"`,
        `"${escapeCsv(p.extractedAt || "")}"`
      ];
      csvContent += row.join(",") + "\n";
    });

    downloadBlob(csvContent, "text/csv;charset=utf-8;", `linkedin_ids_${Date.now()}.csv`);
    showToast("CSV file downloaded!");
  });

  btnExportJson.addEventListener("click", () => {
    const profiles = getFilteredProfiles();
    if (profiles.length === 0) return showToast("No profiles to export.");
    const jsonStr = JSON.stringify(profiles, null, 2);
    downloadBlob(jsonStr, "application/json;charset=utf-8;", `linkedin_ids_${Date.now()}.json`);
    showToast("JSON file downloaded!");
  });

  btnClearResults.addEventListener("click", () => {
    if (confirm("Clear extracted profiles list?")) {
      currentProfiles = [];
      activeReviewIndex = 0;
      chrome.storage.local.set({ extractedProfiles: [], activeReviewIndex: 0 }, () => {
        updateReviewerUI();
        renderProfiles([]);
        showToast("Extracted profiles cleared.");
      });
    }
  });

  // ==========================================
  // HISTORY SESSIONS VIEW
  // ==========================================
  function renderHistory() {
    chrome.storage.local.get(["history"], (res) => {
      const history = res.history || [];
      if (history.length === 0) {
        historyEmpty.classList.remove("hidden");
        historyList.innerHTML = "";
        return;
      }

      historyEmpty.classList.add("hidden");
      historyList.innerHTML = "";

      history.forEach((session, idx) => {
        const li = document.createElement("li");
        li.className = "history-item";

        li.innerHTML = `
          <div class="history-info">
            <div class="history-date">${escapeHtml(session.date || "Unknown Date")}</div>
            <div class="history-url" title="${escapeHtml(session.postUrl || "")}">${escapeHtml(session.postUrl || "LinkedIn Post")}</div>
            <div class="history-count">📊 ${session.count || 0} IDs extracted</div>
          </div>
          <div class="history-actions">
            <button class="tool-btn btn-load-session" data-index="${idx}">Load</button>
            <button class="tool-btn tool-btn-danger btn-del-session" data-index="${idx}">✕</button>
          </div>
        `;

        li.querySelector(".btn-load-session").addEventListener("click", () => {
          currentProfiles = session.profiles || [];
          activeReviewIndex = 0;
          chrome.storage.local.set(
            { extractedProfiles: currentProfiles, activeReviewIndex: 0 },
            () => {
              switchTab("extract");
              updateReviewerUI();
              renderProfiles(getFilteredProfiles());
              showToast(`Loaded ${currentProfiles.length} IDs from session.`);
            }
          );
        });

        li.querySelector(".btn-del-session").addEventListener("click", () => {
          history.splice(idx, 1);
          chrome.storage.local.set({ history: history }, () => {
            renderHistory();
            showToast("Session removed.");
          });
        });

        historyList.appendChild(li);
      });
    });
  }

  btnClearHistory.addEventListener("click", () => {
    if (confirm("Clear all saved history sessions?")) {
      chrome.storage.local.set({ history: [] }, () => {
        renderHistory();
        showToast("History cleared.");
      });
    }
  });

  // ==========================================
  // UTILITY HELPERS
  // ==========================================
  function copyToClipboard(text, successMsg) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast(successMsg || "Copied to clipboard!");
      })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast(successMsg || "Copied to clipboard!");
      });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.classList.add("hidden"), 300);
    }, 2500);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeCsv(str) {
    if (!str) return "";
    return str.toString().replace(/"/g, '""');
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }
});
