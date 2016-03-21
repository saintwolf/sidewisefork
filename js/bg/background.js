/* Copyright (c) 2012 Joel Thornton <sidewise@joelpt.net> See LICENSE.txt for license details. */

var tree, recentlyClosedTree, recentlyClosedGroupList = [],
  recentlyClosedGroupListLastCount = 0,
  recentlyClosedGroupWaitIteration = 0,
  ghostTree, sidebarHandler, paneCatalog, focusTracker, monitorInfo, settings, browserIsClosed = !1,
  firstTimeInstallTabId, allowSavingPageTree = !0,
  denyingSavingPageTreeForMs;
window.onload = onLoad;

function onLoad() {
  chrome.tabs.getCurrent(function() {
    settings = new Settings;
    tree = new PageTree(PageTreeCallbackProxy, onPageTreeModifiedDelayed);
    recentlyClosedTree = new UiDataTree(RecentlyClosedTreeCallbackProxy, void 0, function() {
      truncateRecentlyClosedTree(settings.get("closed_maxPagesRemembered"));
      savePageTreeToLocalStorage(recentlyClosedTree, "recentlyClosedTree", !0)
    }, 0.9 * config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS, config.TREE_ONMODIFIED_STARTUP_DURATION_MS, 0.9 * config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS);
    ghostTree = new UiDataTree(function() {}, void 0, function() {
      savePageTreeToLocalStorage(ghostTree, "ghostTree", !1)
    }, 0.95 * config.TREE_ONMODIFIED_DELAY_ON_STARTUP_MS, config.TREE_ONMODIFIED_STARTUP_DURATION_MS, 0.95 * config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS);
    tree.name = "pageTree";
    recentlyClosedTree.name = "recentlyClosedTree";
    ghostTree.name = "ghostTree";
    sidebarHandler = new SidebarHandler;
    chrome.tabs.query({
      url: "chrome-extension://gimdgohlhgfhfafpobendnlkpjbbnfjd/sidebar.html"
    }, function(a) {
      if (a)
        for (var b = a.length -
            1; 0 <= b; b--) {
          var c = a[b];
          chrome.tabs.remove(c.id, function() {
            log("Removed extraneous sidebar window " + c.id)
          })
        }
      focusTracker = new ChromeWindowFocusTracker(postLoad)
    })
  })
}

function onPageTreeModifiedDelayed() {
  browserIsClosed ? log("Browser is closed, will not save page tree!") : allowSavingPageTree ? (tree.lastModified != tree.lastSaved && (savePageTreeToLocalStorage(tree, "pageTree", !0), tree.lastSaved = tree.lastModified), tree.onModifiedDelayedWaitMs = config.TREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS) : TimeoutManager.reset("retryOnPageTreeModifiedDelayed", onPageTreeModifiedDelayed, config.DENIED_SAVE_TREE_RETRY_MS)
}

function postLoad(a) {
  if (a) {
    a = settings.initializeDefaults();
    settings.updateStateFromSettings();
    paneCatalog = new SidebarPaneCatalog;
    paneCatalog.loadState();
    registerEventHandlers();
    injectContentScriptInExistingTabs("content_script.js");
    loadTreeFromLocalStorage(recentlyClosedTree, "recentlyClosedTree", config.PAGETREE_NODE_TYPES);
    recentlyClosedTree.removeZeroChildTopNodes();
    var b = recentlyClosedTree.root.children[0];
    b && b.collecting && (b.collecting = !1);
    var c = (b = settings.get("backupPageTree", [])) && 0 < b.length;
    c && localStorage.backupPageTreeLastSession != localStorage.backupPageTree && (localStorage.backupPageTreeLastSession = localStorage.backupPageTree, settings.cache.backupPageTreeLastSession = b);
    var d = settings.get("pageTree", []),
      e = !1;
    0 < d.length ? (log("Have stored tree data"), e = !0) : (log("Missing stored tree data"), 0 < b.length && (log("Backup exists of tree data, restoring"), d = b, e = !0));
    e ? (log("--- loading page tree from storage ---"), loadPageTreeFromLocalStorage(d), setTimeout(startAssociationRun, 2E3), populatePages(!0),
      a && showWhatsNewPane(), showPromoPageAnnually()) : (log("--- first time population of page tree ---"), populatePages());
    loadTreeFromLocalStorage(ghostTree, "ghostTree", config.GHOSTTREE_NODE_TYPES);
    synchronizeGhostTree();
    setInterval(synchronizeGhostTree, 30 * MINUTE_MS);
    c || setTimeout(function() {
      backupPageTree(true)
    }, config.SAVE_TREE_INITIAL_BACKUP_AFTER_MS);
    setInterval(backupPageTree, config.SAVE_TREE_BACKUP_EVERY_MS);
    reportEvent("sidewise", "loaded");
    monitorInfo = new MonitorInfo;
    monitorInfo.isKnown() ? createSidebarOnStartup() :
      monitorInfo.retrieveMonitorMetrics(function() {
        monitorInfo.saveToSettings();
        createSidebarOnStartup()
      })
  } else chrome.windows.onCreated.addListener(function() {
    restartSidewise()
  })
}

function registerEventHandlers() {
  registerRequestEvents();
  registerWindowEvents();
  registerTabEvents();
  registerWebNavigationEvents();
  registerBrowserActionEvents();
  registerSnapInEvents();
  registerOmniboxEvents();
  registerRuntimeEvents()
}

function createSidebarOnStartup() {
  settings.get("openSidebarOnStartup") && (sidebarHandler.monitorMetrics = monitorInfo.detectedMonitors, sidebarHandler.maximizedOffset = monitorInfo.detectedMaxMonitorOffset, sidebarHandler.createWithDockState(settings.get("dockState", "right")), settings.get("firstTimeInstallShown") || (settings.set("firstTimeInstallShown", !0), setTimeout(function() {
    chrome.tabs.create({
      url: "/options_install.html",
      active: !0
    }, function(a) {
      setTimeout(function() {
        tree.updatePage(a.id, {
          status: "loaded"
        });
        firstTimeInstallTabId = a.id
      }, 500)
    })
  }, 1500)), setInterval(checkForMalwarePageInSidebar, 5E3))
}

function savePageTreeToLocalStorage(a, b, c) {
  if (!a.lastModified || !a.lastSaved || a.lastModified != a.lastSaved) {
    log("--- saving tree to " + b + " ---");
    var d = clone(a.tree, ["parent", "root", "hostTree", "chromeId"]);
    c && (d = d.filter(function(a) {
      return !a.incognito
    }));
    0 == d.length ? console.error("Did not save tree because it is empty!") : (settings.set(b, d), a.lastSaved = a.lastModified)
  }
}

function backupPageTree(a) {
  if (browserIsClosed) log("Skipped saving backup of tree because browser is closed");
  else {
    var b = tree.reduce(function(a) {
      return a + 1
    }, 0);
    b < config.MIN_NODES_TO_BACKUP_TREE && !a ? log("Skipped saving backup of tree due to too few nodes (" + b + ")") : savePageTreeToLocalStorage(tree, "backupPageTree", !0)
  }
}

function disallowSavingTreeForDuration(a) {
  !allowSavingPageTree && denyingSavingPageTreeForMs > a ? log("Already disallowing tree saving for " + denyingSavingPageTreeForMs + " (vs. " + a + ")") : (log("Disallowing tree saving for " + a), allowSavingPageTree = !1, denyingSavingPageTreeForMs = a, TimeoutManager.reset("allowSavingPageTree", function() {
    log("Reallowing tree saving");
    allowSavingPageTree = !0
  }, a))
}

function loadTreeFromLocalStorage(a, b, c) {
  a.loadTree(settings.get(b), c)
}

function loadPageTreeFromLocalStorage(a) {
  tree.loadTree(a, config.PAGETREE_NODE_TYPES);
  tree.tree.forEach(function(a) {
    if (a instanceof PageNode || a instanceof WindowNode) a.chromeId = null, a.windowId = null, a instanceof PageNode && (a.mediaState = null, a.mediaTime = null)
  });
  chrome.tabs.query({}, function(a) {
    var c = a.map(function(a) {
        return a.url + "\n" + a.title
      }),
      d = 1,
      e = [];
    tree.forEach(function(a, b, i, h, j) {
      if (a instanceof WindowNode && 1 == a.children.length && a.children[0] instanceof PageNode && isNewTabUrl(a.children[0].url) &&
        0 == a.children[0].children.length) e.push(a.children[0]), e.push(a);
      else if (a instanceof PageNode && !a.hibernated && a.url.match(/^chrome-/) && -1 == c.indexOf(a.url + "\n" + a.title)) e.push(a);
      else {
        a.restored = !1;
        if (a instanceof WindowNode) a.restorable && a.hibernated ? a.old = !0 : a.hibernated || (a.title = getMessage("text_LastSession"), d++, a.restorable = !0, a.hibernated = !0, settings.get("autoCollapseLastSessionWindows") && (a.collapsed = !0));
        else if (a instanceof PageNode && (a.restorable || !a.hibernated)) a.hibernated = !0, a.restorable = !0, a.status = "complete";
        sidebarHandler.sidebarExists() && tree.callbackProxyFn("add", {
          element: a,
          parentId: j ? j.id : void 0
        })
      }
    });
    e.forEach(function(a) {
      try {
        tree.removeNode(a)
      } catch (b) {}
    });
    e = [];
    tree.root.children.forEach(function(a) {
      a instanceof WindowNode && 0 == a.children.length && e.push(a)
    });
    e.forEach(function(a) {
      try {
        tree.removeNode(a)
      } catch (b) {}
    });
    tree.rebuildIndexes();
    tree.rebuildTabIndex();
    tree.rebuildParents();
    tree.updateLastModified()
  })
}

function PageTreeCallbackProxy(a, b) {
  log(a, b);
  var c = b.element;
  if (c && !c.incognito) switch (a) {
    case "add":
      if (ghostTree.getNode(c.id)) break;
      var d = new GhostNode(c.id, c.elemType);
      try {
        ghostTree.addNode(d, b.parentId, b.beforeSiblingId)
      } catch (e) {
        ghostTree.addNode(d)
      }
      break;
    case "move":
      try {
        ghostTree.moveNode(c.id, b.newParentId, b.beforeSiblingId, b.keepChildren)
      } catch (f) {}
      break;
    case "merge":
      try {
        ghostTree.mergeNodes(b.fromId, b.toId)
      } catch (g) {}
      break;
    case "update":
      if (b.element.id) try {
        ghostTree.updateNode(b.id, {
          id: b.element.id
        })
      } catch (i) {}
  }
  if (!("move" ==
      a && b.callbackBlocked)) {
    if ("remove" == a && !c.incognito && (!(c instanceof PageNode) || c.url && !c.url.match(/^chrome/))) addNodeToRecentlyClosedTree(c, b.removeChildren), recentlyClosedTree.removeZeroChildTopNodes();
    c instanceof WindowNode && !c.hibernated && "remove" == a ? (d = c.chromeId, focusTracker.remove(d), sidebarHandler.dockWindowId == d && (log("Dock window has been destroyed; choose new dock window"), sidebarHandler.redock(focusTracker.getFocused()))) : ("remove" == a || "move" == a) && (c.parent instanceof WindowNode && !c.parent.hibernated &&
      0 == c.parent.children.length) && TimeoutManager.reset("removeChildlessWindowNode_" + c.parent.id, function() {
      if (c.parent instanceof WindowNode && !c.parent.hibernated && 0 == c.parent.children.length) {
        var a = tree.getNode(c.parent.id);
        a && 0 == a.children.length ? (log("Removing stale window " + a.id), tree.removeNode(a, !0)) : log("Stale window " + c.parent.id + " is already removed or now has children")
      }
    }, 1500);
    c instanceof PageNode && (c.isTab() && ("move" == a || "add" == a)) && setTimeout(function() {
      fixPinnedUnpinnedTabOrder(c)
    }, 0);
    (d = sidebarHandler.sidebarPanes.pages) && d.PageTreeCallbackProxyListener.call(d, a, b)
  }
}

function RecentlyClosedTreeCallbackProxy(a, b) {
  log(a, b);
  if (!b.element.incognito) {
    "add" == a && b.element instanceof PageNode && (b.element.status = "complete", b.element.unread = !1);
    if ("remove" == a && !(b.element instanceof HeaderNode)) {
      var c = ghostTree.getNode(b.element.id);
      c && !c.alive && ghostTree.removeNode(b.element.id)
    }(c = sidebarHandler.sidebarPanes.closed) && c.PageTreeCallbackProxyListener.call(c, a, b)
  }
}

function deduplicateRecentlyClosedPageNode() {}

function addNodeToRecentlyClosedTree(a, b) {
  var c = a.children,
    d = ghostTree.getNode(a.id);
  d ? ghostTree.updateNode(d, {
    alive: !1
  }) : console.warn("Did not find ghost node matching", a.id);
  if (a instanceof WindowNode) {
    if ((d = recentlyClosedTree.root.children[0]) && d instanceof HeaderNode) log("Setting top HeaderNode.collecting to false", d), recentlyClosedTree.updateNode(d, {
      collecting: !1
    })
  } else if (!recentlyClosedTree.getNode(a.id)) {
    var e = Date.now(),
      a = clone(a, ["root", "parent", "children"]);
    a.__proto__ = config.PAGETREE_NODE_TYPES[a.elemType].prototype;
    a.children = [];
    var f = !1;
    if (d) try {
      var g = firstElem(d.beforeSiblings(), function(a) {
        return !a.alive
      });
      if (g && (g = recentlyClosedTree.getNode(g.id)) && !(g.parent instanceof HeaderNode) && e - g.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) recentlyClosedTree.addNodeRel(a, "after", g), f = !0;
      if (!f) {
        var i = firstElem(d.afterSiblings(), function(a) {
          return !a.alive
        });
        if (i && (i = recentlyClosedTree.getNode(i.id)) && !(i.parent instanceof HeaderNode) && e - i.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) recentlyClosedTree.addNodeRel(a,
          "before", i), f = !0
      }
      if (!f) {
        var h = firstElem(d.parents(), function(a) {
          return !a.alive
        });
        if (h && !h.isRoot && (h = recentlyClosedTree.getNode(h.id)) && e - h.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) recentlyClosedTree.addNodeRel(a, "append", h), f = !0
      }
    } catch (j) {}
    f || (f = getOrCreateTopCollectingHeaderNode(), recentlyClosedTree.addNodeRel(a, "prepend", f));
    requestAutoGroupingForNode(a);
    d && (log("Added to rctree", a.id, "addDescendants", b), d.children.forEach(function(b) {
      if (!b.alive)
        if ((b = recentlyClosedTree.getNode(b.id)) &&
          e - b.removedAt <= config.RECENTLY_CLOSED_ALLOW_RESTRUCTURING_MS) {
          recentlyClosedTree.moveNodeRel(b, "append", a, true);
          requestAutoGroupingForNode(b)
        }
    }))
  }
  b && c.forEach(function(b) {
    log("Add children to rctree", "parent", a.id, "doing child", b.id);
    addNodeToRecentlyClosedTree(b, !0)
  })
}

function restoreNode(a, b) {
  var c = recentlyClosedTree.getNode(a);
  if (!c) throw Error("Could not find requested node to restore in rctree", a);
  var d = 0,
    e = c.hibernated;
  c.hibernated = !0;
  restoreNodeFromRecentlyClosedTree(c, b, function(a) {
    e || (d++, tree.awakenPageNodes([a], a.topParent(), 1 == d));
    recentlyClosedTree.removeNode(c);
    recentlyClosedTree.removeZeroChildTopNodes()
  })
}

function findInsertPositionByGhostNode(a, b, c) {
  var d = firstElem(a.beforeSiblings(), function(a) {
    return "window" != a.ghostType && a.alive == b
  });
  if (d && (d = c.getNode(d.id))) return {
    relation: "after",
    to: d
  };
  if (d = firstElem(a.afterSiblings(), function(a) {
      return "window" != a.ghostType && a.alive == b
    }))
    if (d = c.getNode(d.id)) return {
      relation: "before",
      to: d
    };
  if (a = firstElem(a.parents(), function(a) {
      return "window" != a.ghostType && a.alive == b
    }))
    if (d = c.getNode(a.id)) return {
      relation: "append",
      to: d
    }
}

function restoreNodeFromRecentlyClosedTree(a, b, c) {
  var d = a.children,
    e = ghostTree.getNode(a.id);
  e ? ghostTree.updateNode(e, {
    alive: !0
  }) : console.warn("Did not find ghost node matching", a.id);
  if (!(a instanceof HeaderNode)) {
    a = clone(a, ["root", "parent", "children"]);
    a.__proto__ = config.PAGETREE_NODE_TYPES[a.elemType].prototype;
    a.children = [];
    var f, g = !1;
    if (e && (f = findInsertPositionByGhostNode(e, !0, tree))) tree.addNodeRel(a, f.relation, f.to), g = !0;
    if (!g) {
      f = tree.getNode(["chromeId", focusTracker.getFocused()]);
      if (!f ||
        f.incognito || "normal" != f.type)
        if (f = tree.getNode(function(a) {
            return a instanceof WindowNode && !a.hibernated && !a.incognito && "normal" == a.type
          }), !f && (f = tree.getNode(function(a) {
            return a instanceof WindowNode && !a.incognito && "normal" == a.type
          }), !f)) throw Error("Could not find any WindowNode to restore node under");
      tree.addNodeRel(a, "append", f)
    }
    log("Restored to tree", a.id, "addDescendants", b);
    e && restoreTreeChildrenToPreviousParentByGhost(e, a)
  }
  c && c(a);
  b && d.forEach(function(b) {
    log("Restore children to tree",
      "parent", a.id, "doing child", b.id);
    restoreNodeFromRecentlyClosedTree(b, !0, c)
  })
}

function restoreTreeChildrenToPreviousParentByGhost(a, b) {
  for (var c = a.children.length - 1; 0 <= c; c--) {
    var d = a.children[c];
    d.alive && (d = tree.getNode(d.id)) && tree.moveNodeRel(d, "append", b, !0)
  }
}

function moveReopenedNode(a, b, c) {
  log(a.id, b.id);
  var d = ghostTree.getNode(b.id);
  d ? ghostTree.updateNode(d, {
    alive: !0
  }) : console.warn("Did not find ghost node matching", b.id);
  var e = clone(b, ["root", "parent", "children"]);
  e.__proto__ = config.PAGETREE_NODE_TYPES[b.elemType].prototype;
  e.children = [];
  var f = !1;
  if (d) {
    var g = findInsertPositionByGhostNode(d, !0, tree);
    g && (log("Reopen to ghost position", b.id, g.relation, g.to.id), tree.addNodeRel(e, g.relation, g.to), f = !0)
  }
  f || (log("Reopen to existing open-node position", b.id,
    "before", a.id), tree.addNodeRel(e, "before", a));
  tree.updateNode(e, {
    chromeId: a.chromeId,
    windowId: a.windowId,
    pinned: a.pinned,
    hibernated: !1,
    restorable: !1,
    restored: !0
  });
  tree.removeNode(a);
  tree.focusedTabId == e.chromeId && tree.focusPage(e.chromeId);
  setTimeout(function() {
    recentlyClosedTree.removeNode(b.id);
    recentlyClosedTree.removeNode(a.id);
    recentlyClosedTree.removeZeroChildTopNodes()
  }, 0);
  log("Reopened to tree", e.id);
  d && restoreTreeChildrenToPreviousParentByGhost(d, e);
  c && c(e)
}

function getOrCreateTopCollectingHeaderNode() {
  var a = recentlyClosedTree.root.children[0];
  if (!a || !a.collecting) a = new HeaderNode, a.collecting = !0, recentlyClosedTree.addNodeRel(a, "prepend"), log("created collecting HeaderNode", a.id);
  return a
}

function requestAutoGroupingForNode(a) {
  recentlyClosedGroupList.push(a);
  scheduleAutoGrouping()
}

function scheduleAutoGrouping() {
  TimeoutManager.reset("autoGroupRecentlyClosedTreeNodes", autoGroupRecentlyClosedTreeNodes, config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
  TimeoutManager.reset("autoGroupRecentlyClosedTreeAfterIdle", autoGroupRecentlyClosedTreeAfterIdle, config.RECENTLY_CLOSED_GROUP_AFTER_REMOVE_IDLE_MS)
}

function autoGroupRecentlyClosedTreeAfterIdle() {
  var a = recentlyClosedTree.root.children[0];
  a && a instanceof HeaderNode && recentlyClosedTree.updateNode(a, {
    collecting: !1
  })
}

function autoGroupRecentlyClosedTreeNodes() {
  if (0 != recentlyClosedGroupList.length)
    if (recentlyClosedGroupList.length <= config.GROUPING_ROW_COUNT_THRESHOLD) recentlyClosedGroupList = [];
    else {
      if (recentlyClosedGroupList.length >= config.GROUPING_ROW_COUNT_WAIT_THRESHOLD) {
        if (recentlyClosedGroupListLastCount != recentlyClosedGroupList.length) {
          recentlyClosedGroupWaitIteration = 0;
          recentlyClosedGroupListLastCount = recentlyClosedGroupList.length;
          TimeoutManager.reset("autoGroupRecentlyClosedTreeNodes", autoGroupRecentlyClosedTreeNodes,
            config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
          log("Retriggering autoGroupRecentlyClosedTreeNodes()");
          return
        }
        if (recentlyClosedGroupWaitIteration < config.GROUPING_ROW_COUNT_WAIT_ITERATIONS) {
          recentlyClosedGroupWaitIteration++;
          TimeoutManager.reset("autoGroupRecentlyClosedTreeNodes", autoGroupRecentlyClosedTreeNodes, config.PREPEND_RECENTLY_CLOSED_GROUP_HEADER_INTERVAL_MS);
          log("Retriggering autoGroupRecentlyClosedTreeNodes() due to wait iteration");
          return
        }
        recentlyClosedGroupWaitIteration = recentlyClosedGroupListLastCount =
          0;
        log("Large group list count has not changed since last check, groupifying now")
      }
      var a = new HeaderNode;
      a.collecting = !1;
      recentlyClosedTree.addNodeRel(a, "prepend");
      for (var b = recentlyClosedTree.filter(function(a) {
          return -1 < recentlyClosedGroupList.indexOf(a) && a.parent instanceof HeaderNode
        }), c = b.length - 1; 0 <= c; c--) {
        var d = recentlyClosedTree.getNode(b[c].id);
        d && d.parent instanceof HeaderNode && recentlyClosedTree.moveNodeRel(d, "prepend", a, !0)
      }
      recentlyClosedGroupList = [];
      recentlyClosedTree.removeZeroChildTopNodes()
    }
}

function truncateRecentlyClosedTree(a) {
  var b = recentlyClosedTree.filter(function(a) {
    return !(a instanceof HeaderNode)
  });
  if (b.length > a) {
    for (var c = b.length - 1; c >= a; c--) recentlyClosedTree.removeNode(b[c]);
    recentlyClosedTree.removeZeroChildTopNodes()
  }
}

function synchronizeGhostTree() {
  removeMissingNodesFromGhostTree();
  addMissingNodesToGhostTree(tree, !0);
  addMissingNodesToGhostTree(recentlyClosedTree, !1)
}

function removeMissingNodesFromGhostTree() {
  for (var a = ghostTree.filter(function() {
      return !0
    }), b = a.length - 1; 0 <= b; b--) {
    var c = a[b];
    tree.getNode(c.id) || recentlyClosedTree.getNode(c.id) || ghostTree.removeNode(c, !1)
  }
}

function addMissingNodesToGhostTree(a, b) {
  function c(a) {
    var d = new GhostNode(a.node.id, a.node.elemType);
    d.children = a.children.map(c);
    d.alive = b;
    return d
  }
  var d = a.getCondensedTree(function(a) {
    return void 0 === ghostTree.getNode(a.id)
  });
  0 != d.length && (d.map(c).forEach(function(a) {
    ghostTree.addNode(a)
  }), ghostTree.rebuildIndexes())
}

function populatePages(a) {
  chrome.windows.getAll({
    populate: !0
  }, function(b) {
    for (var c = b.length, d = [], e = 0; e < c; e++) {
      var f = b[e];
      if ((!0 !== a || f.incognito) && !(!1 === a && f.incognito)) {
        var g = f.tabs,
          i = g.length;
        log("Populating tabs from window", "windowId", f.id, "number of tabs", i);
        if (f.id != sidebarHandler.windowId) {
          var h = tree.getNode(["chromeId", f.id]);
          h || (h = new WindowNode(f), tree.addNode(h));
          for (f = 0; f < i; f++) {
            var j = g[f];
            log("Populating", j.id, j.title, j.url, j);
            tree.getNode(["chromeId", j.id]) || tree.addNode(new PageNode(j),
              h);
            d.push(j)
          }
        }
      }
    }
    setTimeout(function() {
      findTabParents(d)
    }, 1500)
  })
}

function findTabParents(a) {
  log("entering findTabParents", a.length);
  var b = [],
    c;
  for (c in a) {
    var d = a[c];
    if (d.id != sidebarHandler.tabId && d.url)
      if (isScriptableUrl(d.url)) log("Asking for page details to find best-matching parent page", "tabId", d.id, "tab", d), getPageDetails(d.id, {
        action: "find_parent"
      }) || (log("Port not found, will try calling getPageDetails again later", "tabId", d.id), b.push(d));
      else if (d = tree.getNode(["chromeId", d.id])) log("Populating non scriptable page without asking for page details", d.id,
      d), tree.updateNode(d, {
      placed: !0
    })
  }
  0 < b.length && (a = function() {
    log("will requery these tabs", b);
    for (var a in b) {
      var c = b[a],
        d = tree.getNode(["chromeId", c.id]);
      d && d.placed ? log("Skipping already-placed page", "tabId", c.id) : (log("late getPageDetails running", "tabId", c.id, "tab", c), getPageDetails(c.id, {
        action: "find_parent"
      }))
    }
  }, setTimeout(a, 2E3), setTimeout(a, 6E3), setTimeout(a, 1E4), setTimeout(a, 16E3))
}

function shutdownSidewise() {
  browserIsClosed = !0;
  savePageTreeToLocalStorage(recentlyClosedTree, "recentlyClosedTree", !0);
  savePageTreeToLocalStorage(ghostTree, "ghostTree", !0);
  tree.disableCallbacks();
  recentlyClosedTree.disableCallbacks();
  ghostTree.disableCallbacks();
  TimeoutManager.clear("retryOnPageTreeModifiedDelayed");
  try {
    clearInterval(windowUpdateCheckInterval)
  } catch (a) {}
  try {
    sidebarHandler.remove()
  } catch (b) {}
  chrome.windows.getAll(function(a) {
    for (var b in a) chrome.windows.remove(a[b].id)
  })
}

function restartSidewise() {
  try {
    sidebarHandler.remove()
  } catch (a) {}
  chrome.tabs.query({
    windowType: "popup",
    url: chrome.extension.getURL("/sidebar.html")
  }, function(a) {
    a.forEach(function(a) {
      try {
        chrome.windows.remove(a.windowId)
      } catch (b) {}
    });
    document.location.reload()
  })
}

function showWhatsNewPane() {
  var a = paneCatalog.getPane("whatsnew");
  a && (settings.get("showWhatsNewPane") && !a.enabled) && (a.enabled = !0, paneCatalog.saveState(), sidebarHandler.sidebarExists() && sidebarHandler.sidebarPanes.sidebarHost.manager.enableSidebarPane(pane.id))
}

function showPromoPageAnnually() {}
var preventTestIconsCheck;

function checkForMalwarePageInSidebar() {
  preventTestIconsCheck || chrome.tabs.get(sidebarHandler.tabId, function(a) {
    0 <= a.title.toLowerCase().indexOf("malware") && (new IconTester).testIcons()
  })
};