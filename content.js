// content.js - LinkedIn Comment ID Extractor & 1-by-1 Reviewer

(function () {
  console.log("%c[LinkedIn Extractor]%c Script injected & active.", "color: #0a66c2; font-weight: bold;", "");

  let isExtracting = false;
  let abortExtraction = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const NON_PROFILE_SLUGS = new Set([
    "feed", "jobs", "mynetwork", "messaging", "notifications", "me", "recent",
    "search", "learning", "in", "pub", "company", "school", "showcase", "groups",
    "events", "pulse", "help", "post", "posts", "detail", "analytics", "newsletters",
    "salary", "services", "settings", "premium", "checkpoint", "authwall"
  ]);

  function extractIdFromUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
      const match = url.match(/\/in\/([^\/\?#&]+)/i);
      if (match && match[1]) {
        let cleanId = decodeURIComponent(match[1]).replace(/\/+$/, "").trim();
        if (cleanId && !NON_PROFILE_SLUGS.has(cleanId.toLowerCase())) {
          return cleanId;
        }
      }
    } catch (e) { }
    return null;
  }

  function cleanProfileUrl(id) {
    return `https://www.linkedin.com/in/${id}/`;
  }

  // ==========================================
  // POST COMMENTS EXTRACTION ENGINE
  // ==========================================
  async function ensureCommentsAreOpened() {
    // 1. Check if comments or comment elements already exist on page
    const existingComments = document.querySelectorAll(
      "article[class*='comment'], div[class*='comments-comment-item'], [data-test-comment-item], .comments-comments-list, [class*='comments-container'], form[class*='comments-comment-box'], div.comments-comment-texteditor"
    );
    if (existingComments.length > 0) {
      console.log("[LinkedIn Extractor] Comments section is already open/visible.");
      return true;
    }

    // 2. If on dedicated post URL, comments will load directly without toggling
    const isDedicatedPost =
      window.location.href.includes("/feed/update/") ||
      window.location.href.includes("/posts/") ||
      window.location.href.includes("/pulse/");
    if (isDedicatedPost) {
      console.log("[LinkedIn Extractor] On dedicated post URL.");
      return true;
    }

    // 3. Otherwise (e.g. browsing main feed), find comment button to open comments
    const commentToggleSelectors = [
      "button[aria-label*='comment' i]",
      "button[data-field='comments']",
      "button.comment-button",
      ".social-details-social-counts__comments",
      "button[class*='social-actions__comment']",
      "span[class*='social-details-social-counts__comments']"
    ];

    for (const sel of commentToggleSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        try {
          btn.scrollIntoView({ behavior: "smooth", block: "center" });
          btn.click();
          await sleep(1500);
          return true;
        } catch (e) { }
      }
    }
    return false;
  }

  async function switchSortToAllComments() {
    try {
      const sortButtons = document.querySelectorAll(
        "button[aria-label*='sort' i], button.comments-sort-order-toggle, button[class*='sort-order']"
      );
      for (const btn of sortButtons) {
        const text = (btn.innerText || "").toLowerCase();
        if (text.includes("relevant") || text.includes("most")) {
          btn.click();
          await sleep(500);
          const menuItems = document.querySelectorAll(
            "[role='menuitem'], .artdeco-dropdown__item, button[class*='dropdown-item']"
          );
          for (const item of menuItems) {
            const itemText = (item.innerText || "").toLowerCase();
            if (itemText.includes("all") || itemText.includes("most recent") || itemText.includes("recent")) {
              item.click();
              await sleep(1200);
              return;
            }
          }
        }
      }
    } catch (e) { }
  }

  function findExpandButtons() {
    const found = [];
    const candidates = document.querySelectorAll(
      "button, [role='button'], a.show-prev-comments, a.load-more-comments"
    );

    const matchTerms = [
      "more comments", "previous comments", "show comments", "load comments", "see comments",
      "more replies", "previous replies", "see replies", "load replies", "show replies", "view replies",
      "load more", "show more", "see more", "show previous", "load previous", "previous",
      "más comentarios", "comentarios anteriores", "plus de commentaires", "commentaires précédents",
      "weitere kommentare", "vorherige kommentare"
    ];

    candidates.forEach((btn) => {
      if (!btn || btn.disabled || btn.offsetParent === null) return;
      if (btn.closest("header#global-nav, nav, footer, #compactheader, aside, .scaffold-layout__aside")) return;

      const text = (btn.innerText || "").toLowerCase().trim();
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase().trim();
      const className = (btn.className || "").toString().toLowerCase();

      // Skip reactions/like/comment-toggle buttons
      if (
        text === "like" || text === "comment" || text === "repost" || text === "send" ||
        aria === "like" || aria === "comment" || aria === "repost" || aria === "send" ||
        className.includes("reaction") || className.includes("feed-shared-social-action")
      ) {
        return;
      }

      let isMatch = matchTerms.some((term) => text.includes(term) || aria.includes(term));

      if (
        !isMatch &&
        (className.includes("load-more-comments") ||
          className.includes("show-prev-comments") ||
          className.includes("comments-comments-list__load-more") ||
          className.includes("comments-comments-list__pagination") ||
          className.includes("load-more-replies") ||
          className.includes("show-previous-replies") ||
          btn.hasAttribute("data-test-load-more-comments-button") ||
          btn.hasAttribute("data-test-load-more-replies-button"))
      ) {
        isMatch = true;
      }

      // Check replies button patterns like "1 reply", "5 replies", "12 replies"
      if (!isMatch && (/\b\d+\s+repl(y|ies)\b/i.test(text) || /\b\d+\s+repl(y|ies)\b/i.test(aria))) {
        isMatch = true;
      }

      if (isMatch) found.push(btn);
    });

    return found;
  }

  function getPostAuthorId() {
    try {
      const postHeader = document.querySelector(
        ".feed-shared-actor, .update-components-actor, header[class*='actor'], .feed-shared-update-v2__content header"
      );
      if (postHeader) {
        const authorLink = postHeader.querySelector("a[href*='/in/']");
        if (authorLink) return extractIdFromUrl(authorLink.href);
      }
    } catch (e) { }
    return null;
  }

  function extractCurrentProfiles() {
    const profilesMap = new Map();
    const postAuthorId = getPostAuthorId();

    // Strategy 1: Find individual comment cards / items
    const commentSelectors = [
      "article.comments-comment-item",
      "article[class*='comment']",
      "div.comments-comment-item",
      "div[class*='comments-comment-item']",
      "div[class*='comment-item']",
      "li.comments-comments-list__comment-item",
      "li[class*='comments-comment']",
      "div.comments-reply-item",
      "div[class*='comments-reply-item']",
      "div[class*='comment-reply']",
      "[data-test-comment-item]",
      "[data-id*='comment']",
      "[data-view-name*='comment']"
    ];

    let commentElements = [];
    for (const sel of commentSelectors) {
      const matches = document.querySelectorAll(sel);
      if (matches.length > 0) commentElements.push(...Array.from(matches));
    }
    commentElements = Array.from(new Set(commentElements));

    commentElements.forEach((el) => {
      const links = el.querySelectorAll("a[href*='/in/']");
      if (links.length === 0) return;

      let primaryId = null;
      let primaryName = "";
      let primaryHeadline = "";

      for (const a of links) {
        const id = extractIdFromUrl(a.href);
        if (!id) continue;

        if (!primaryId) primaryId = id;

        // Try to get commenter name
        const nameTextEl = a.querySelector(
          ".comments-post-meta__name-text, span[aria-hidden='true'], span[dir='ltr'], span.comments-post-meta__name"
        );
        let nameCandidate = "";
        if (nameTextEl && nameTextEl.innerText && nameTextEl.innerText.trim()) {
          nameCandidate = nameTextEl.innerText.trim();
        } else if (a.innerText && a.innerText.trim()) {
          nameCandidate = a.innerText.trim().split("\n")[0].trim();
        } else {
          const img = a.querySelector("img[alt]");
          if (img && img.alt) nameCandidate = img.alt.trim();
        }

        if (nameCandidate && !primaryName) {
          primaryName = nameCandidate;
          primaryId = id;
        }
      }

      if (!primaryId) return;

      // Headline
      const headEl = el.querySelector(
        ".comments-post-meta__headline, .comments-post-meta__subtitle, [class*='headline'], [class*='subtitle']"
      );
      if (headEl && headEl.innerText) {
        primaryHeadline = headEl.innerText.trim();
      }

      // Comment Text
      let commentText = "";
      const cEl = el.querySelector(
        ".comments-comment-item-content-body, .comments-comment-item__main-content, .update-components-text, [class*='inline-show-more-text'], [class*='comment-item__text']"
      );
      if (cEl && cEl.innerText) {
        commentText = cEl.innerText.trim().substring(0, 300);
      }

      if (!profilesMap.has(primaryId.toLowerCase())) {
        profilesMap.set(primaryId.toLowerCase(), {
          id: primaryId,
          profileUrl: cleanProfileUrl(primaryId),
          name: primaryName || primaryId,
          headline: primaryHeadline || "LinkedIn Member",
          commentText: commentText,
          viewed: false,
          extractedAt: new Date().toISOString()
        });
      }
    });

    // Strategy 2: Comments container scan
    const commentsAreas = document.querySelectorAll(
      ".comments-comments-list, [data-test-comments-list], [class*='comments-container'], [class*='comments-list'], section[class*='comments'], form[class*='comments-comment-box'] ~ *"
    );

    commentsAreas.forEach((area) => {
      const anchors = area.querySelectorAll("a[href*='/in/']");
      anchors.forEach((a) => {
        const id = extractIdFromUrl(a.href);
        if (id && !profilesMap.has(id.toLowerCase())) {
          let name = (a.innerText || "").trim().split("\n")[0];
          const img = a.querySelector("img[alt]");
          if (!name && img && img.alt) name = img.alt.trim();

          profilesMap.set(id.toLowerCase(), {
            id: id,
            profileUrl: cleanProfileUrl(id),
            name: name || id,
            headline: "LinkedIn Member",
            commentText: "",
            viewed: false,
            extractedAt: new Date().toISOString()
          });
        }
      });
    });

    // Strategy 3: Page-wide fallback (excluding nav, footer, and sidebar suggestions)
    if (profilesMap.size === 0) {
      const allAnchors = document.querySelectorAll("a[href*='/in/']");
      allAnchors.forEach((a) => {
        if (
          a.closest(
            "header#global-nav, nav, footer, #compactheader, aside, .scaffold-layout__aside, section[aria-label*='More profiles' i], section[aria-label*='People also viewed' i], div[class*='right-rail']"
          )
        ) {
          return;
        }

        const id = extractIdFromUrl(a.href);
        if (id && (!postAuthorId || id.toLowerCase() !== postAuthorId.toLowerCase())) {
          if (!profilesMap.has(id.toLowerCase())) {
            let name = (a.innerText || "").trim().split("\n")[0];
            const img = a.querySelector("img[alt]");
            if (!name && img && img.alt) name = img.alt.trim();

            profilesMap.set(id.toLowerCase(), {
              id: id,
              profileUrl: cleanProfileUrl(id),
              name: name || id,
              headline: "LinkedIn Member",
              commentText: "",
              viewed: false,
              extractedAt: new Date().toISOString()
            });
          }
        }
      });
    }

    // Strategy 4: If page is a profile page (/in/username)
    if (profilesMap.size === 0) {
      const profileMatch = window.location.pathname.match(/\/in\/([^\/\?#&]+)/i);
      if (profileMatch && profileMatch[1]) {
        const currentProfileId = decodeURIComponent(profileMatch[1]).replace(/\/+$/, "").trim();
        if (currentProfileId && !NON_PROFILE_SLUGS.has(currentProfileId.toLowerCase())) {
          const h1 = document.querySelector("h1");
          const name = h1 ? h1.innerText.trim() : currentProfileId;
          const headlineEl = document.querySelector(".text-body-medium, [class*='headline']");
          const headline = headlineEl ? headlineEl.innerText.trim() : "LinkedIn Member";

          profilesMap.set(currentProfileId.toLowerCase(), {
            id: currentProfileId,
            profileUrl: cleanProfileUrl(currentProfileId),
            name: name,
            headline: headline,
            commentText: "Current profile",
            viewed: false,
            extractedAt: new Date().toISOString()
          });
        }
      }
    }

    const result = Array.from(profilesMap.values());
    console.log(`[LinkedIn Extractor] Found ${result.length} unique profiles.`);
    return result;
  }

  async function autoExpandComments(maxRounds = 100, maxLimit = 1000, onProgress) {
    let rounds = 0;
    let consecutiveNoButtons = 0;

    console.log(`[LinkedIn Extractor] Auto-expand started: maxRounds=${maxRounds}, maxLimit=${maxLimit}`);

    await ensureCommentsAreOpened();
    await sleep(800);
    await switchSortToAllComments();
    await sleep(800);

    while (rounds < maxRounds && !abortExtraction) {
      rounds++;

      const commentSection = document.querySelector(
        ".comments-comments-list, [class*='comments-container'], [class*='comments-comment-item']"
      );
      if (commentSection) {
        commentSection.scrollIntoView({ behavior: "smooth", block: "end" });
      } else {
        window.scrollBy({ top: 600, behavior: "smooth" });
      }

      await sleep(1000);

      const expandBtns = findExpandButtons();
      console.log(`[LinkedIn Extractor] Round ${rounds}: Found ${expandBtns.length} expand buttons.`);

      if (expandBtns.length === 0) {
        consecutiveNoButtons++;
        if (consecutiveNoButtons >= 3) {
          console.log("[LinkedIn Extractor] No more expand buttons found after 3 checks. Stopping expand.");
          break;
        }
      } else {
        consecutiveNoButtons = 0;
        for (const btn of expandBtns) {
          if (abortExtraction) break;
          try {
            btn.scrollIntoView({ behavior: "smooth", block: "center" });
            btn.click();
            await sleep(900);
          } catch (e) { }
        }
      }

      const currentList = extractCurrentProfiles();
      const currentCount = currentList.length;

      if (onProgress) {
        onProgress({
          round: rounds,
          maxRounds: maxRounds,
          count: currentCount,
          maxLimit: maxLimit,
          status: `Expanding comments (Round ${rounds}/${maxRounds}). Found ${currentCount}/${maxLimit} IDs...`
        });
      }

      if (maxLimit && currentCount >= maxLimit) {
        console.log(`[LinkedIn Extractor] Target limit of ${maxLimit} IDs reached!`);
        break;
      }

      await sleep(1000);
    }
  }

  async function runExtraction(options = {}) {
    if (isExtracting) return;
    isExtracting = true;
    abortExtraction = false;

    const autoExpand = options.autoExpand !== false;
    const maxRounds = options.maxExpandRounds || 100;
    const maxLimit = options.maxLimit || 1000;
    const sourceUrl = options.sourceUrl || window.location.href;

    try {
      chrome.runtime.sendMessage({
        action: "EXTRACTION_STATUS",
        status: "starting",
        count: 0,
        message: `Scanning post & comments (Target limit: ${maxLimit} IDs)...`
      });

      if (autoExpand) {
        await autoExpandComments(maxRounds, maxLimit, (progress) => {
          chrome.runtime.sendMessage({
            action: "EXTRACTION_PROGRESS",
            round: progress.round,
            maxRounds: progress.maxRounds,
            count: progress.count,
            maxLimit: progress.maxLimit,
            message: progress.status
          });
        });
      }

      let profiles = extractCurrentProfiles();
      if (maxLimit && profiles.length > maxLimit) {
        profiles = profiles.slice(0, maxLimit);
      }

      chrome.storage.local.get(["extractedProfiles", "history"], (data) => {
        const history = data.history || [];
        const sessionRecord = {
          id: Date.now(),
          date: new Date().toLocaleString(),
          postUrl: sourceUrl,
          count: profiles.length,
          profiles: profiles
        };

        const updatedHistory = [sessionRecord, ...history].slice(0, 30);

        chrome.storage.local.set(
          {
            extractedProfiles: profiles,
            lastSession: sessionRecord,
            history: updatedHistory,
            activeReviewIndex: 0
          },
          () => {
            chrome.runtime.sendMessage({
              action: "EXTRACTION_COMPLETE",
              profiles: profiles,
              count: profiles.length,
              sourceUrl: sourceUrl,
              message: `Finished! Extracted ${profiles.length} LinkedIn IDs.`
            });
          }
        );
      });

      return profiles;
    } catch (err) {
      console.error("[LinkedIn Extractor] Error:", err);
      chrome.runtime.sendMessage({ action: "EXTRACTION_ERROR", error: err.message });
    } finally {
      isExtracting = false;
    }
  }

  async function runQuickExtract(maxLimit = 1000) {
    await ensureCommentsAreOpened();
    let profiles = extractCurrentProfiles();
    if (maxLimit && profiles.length > maxLimit) {
      profiles = profiles.slice(0, maxLimit);
    }

    chrome.storage.local.set({ extractedProfiles: profiles, activeReviewIndex: 0 }, () => {
      chrome.runtime.sendMessage({
        action: "EXTRACTION_COMPLETE",
        profiles: profiles,
        count: profiles.length,
        sourceUrl: window.location.href,
        message: `Quick scan extracted ${profiles.length} LinkedIn IDs.`
      });
    });

    return profiles;
  }

  // ==========================================
  // EXTENSION MESSAGING LISTENER
  // ==========================================
  if (window.__licExtMsgListener) {
    try {
      chrome.runtime.onMessage.removeListener(window.__licExtMsgListener);
    } catch (e) { }
  }

  window.__licExtMsgListener = (request, sender, sendResponse) => {
    console.log("[LinkedIn Extractor] Message received:", request.action);
    if (request.action === "START_EXTRACTION") {
      runExtraction(request);
      sendResponse({ status: "extraction_started" });
    } else if (request.action === "STOP_EXTRACTION") {
      abortExtraction = true;
      isExtracting = false;
      sendResponse({ status: "extraction_stopping" });
    } else if (request.action === "QUICK_EXTRACT") {
      runQuickExtract(request.maxLimit || 1000).then((profiles) => {
        sendResponse({ profiles: profiles, count: profiles.length });
      });
      return true;
    } else if (request.action === "PING") {
      sendResponse({ status: "pong", url: window.location.href });
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(window.__licExtMsgListener);
})();
