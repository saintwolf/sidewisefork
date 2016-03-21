/* Copyright (c) 2012 Joel Thornton <sidewise@joelpt.net> See LICENSE.txt for license details. */

var Settings = function() {
  this.cache = {}
};
Settings.prototype = {
  set: function(b, a) {
    void 0 === a ? (localStorage.removeItem(b), void 0 !== this.cache[b] && delete this.cache[b]) : (localStorage[b] = JSON.stringify(a), this.cache[b] = a)
  },
  get: function(b, a) {
    var c = this.cache[b];
    if (void 0 !== c) return c;
    c = localStorage[b];
    return void 0 !== c ? (c = JSON.parse(c), this.cache[b] = c) : a
  },
  toJSON: function() {
    return "{" + mapObjectProps(this.cache, function(b) {
      return '"' + b + '": ' + JSON.stringify(localStorage[b])
    }).join(",") + "}"
  },
  dump: function(b) {
    return mapObjectProps(this.cache, function(a,
      c) {
      var d = JSON.stringify(c, StringifyReplacer);
      b && b < d.length && (d = d.substring(0, b) + "...");
      return a + ": " + d
    }).join("\n")
  },
  initializeDefaults: function(b) {
    var a = getVersion(),
      c = this.get("lastInitializedVersion");
    if (a == c && !b) return console.log("Settings are at current version", a), !1;
    console.log("Initializing settings", "old version:", c, "current version:", a);
    var d = {
        openSidebarOnStartup: !0,
        keepSidebarOnTop: !1,
        dockState: "left",
        browserActionButtonBehavior: "show",
        useAdvancedTreeFiltering: !1,
        pages_doubleClickAction: "hibernate",
        pages_middleClickAction: "none",
        pages_createNewTabUrl: "newtab",
        pages_clickOnHoverDelay: !1,
        pages_clickOnHoverDelayMs: 250,
        pages_clickOnMouseWheel: !1,
        pages_showMediaPlayTime: !0,
        pages_trimPageTitlePrefixes: !0,
        closed_maxPagesRemembered: 200,
        smartFocusOnClose: !1,
        smartFocusPrefersCousins: !1,
        smartFocusPrefersParent: !0,
        loggingEnabled: !1,
        alwaysShowAdvancedOptions: !1,
        sidebarTargetWidth: 275,
        allowAutoUnmaximize: !0,
        autoCollapseLastSessionWindows: !0,
        rememberOpenPagesBetweenSessions: !0,
        wakeHibernatedPagesOnClick: !1,
        animationEnabled: !0,
        autoSelectChildrenOnDrag: !0,
        reportUsageStatistics: !0,
        multiSelectActionConfirmThreshold: 5,
        showWhatsNewPane: !0,
        lastPromoPageShownDate: null,
        focusSidebarOnHover: !1
      },
      e;
    for (e in d) {
      var f = this.get(e),
        g = void 0 === f || b ? d[e] : f;
      this.set(e, g);
      f != g && console.log("Initialized setting", e, "to:", g)
    }
    void 0 === c ? (reportEvent("sidewise", "installed", a), reportPageView("/installed")) : reportEvent("sidewise", "updated", a);
    this.set("lastInitializedVersion", a);
    console.log("Initialization of settings done, settings version now at",
      a);
    return !0
  },
  updateStateFromSettings: function(b) {
    var a = chrome.extension.getBackgroundPage(),
      c = a.sidebarHandler,
      d = !1;
    loggingEnabled != this.get("loggingEnabled") && (d = !0, a.setLoggingState());
    c.targetWidth = this.get("sidebarTargetWidth");
    var e = this.get("dockState");
    if (c.sidebarExists())
      if (c.dockState != e) c.remove(function() {
        c.createWithDockState(e)
      });
      else
        for (var f in c.sidebarPanes)
          if (a = c.sidebarPanes[f]) {
            try {
              a.ft.useAdvancedFiltering = this.get("useAdvancedTreeFiltering");
              a.ft.autoSelectChildrenOnDrag = this.get("autoSelectChildrenOnDrag");
              a.ft.clickOnMouseWheel = this.get("pages_clickOnMouseWheel");
              var g;
              this.get("pages_clickOnHoverDelay") && (g = this.get("pages_clickOnHoverDelayMs"));
              a.ft.clickOnHoverDelayMs = g;
              "pages_trimPageTitlePrefixes" == b && "pages" == f && a.ft.formatAllRowTitles.call(a.ft)
            } catch (h) {}
            a.$.fx.off = !this.get("animationEnabled");
            d && void 0 !== a.loggingEnabled && "sidebarHost" != f && a.location.reload()
          }
  }
};