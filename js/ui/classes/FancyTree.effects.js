/* Copyright (c) 2012 Joel Thornton <sidewise@joelpt.net> See LICENSE.txt for license details. */

var EFFECT_DURATION_BASE_MS = 150;
FancyTree.prototype.slideOutAndShrink = function(b, e, c) {
  var a = [];
  b.each(function(f, g) {
    var d = $(g).children(".ftItemRow"),
      h = d.height() || e;
    a.push(h);
    d.show().css("margin-left", "0px").css("width", "100%").css("height", h).animate({
      "margin-left": "100%",
      width: "0"
    }, EFFECT_DURATION_BASE_MS, "easeOutSine", function() {
      $(this).animate({
        height: "0px"
      }, EFFECT_DURATION_BASE_MS, function() {
        $(this).hide();
        f == b.length - 1 && c && setTimeout(function() {
          c(a)
        }, 20)
      })
    })
  });
  return a
};
FancyTree.prototype.growAndSlideIn = function(b, e, c) {
  b.each(function(a, f) {
    var g = $(f).children(".ftItemRow"),
      d = e[a];
    g.show().css("margin-left", "100%").css("width", "0").css("height", 0).animate({
      height: d
    }, EFFECT_DURATION_BASE_MS, function() {
      $(this).animate({
        "margin-left": "0",
        width: "100%"
      }, EFFECT_DURATION_BASE_MS, "easeOutCubic", function() {
        a == b.length - 1 && c && setTimeout(c, 20)
      })
    })
  })
};