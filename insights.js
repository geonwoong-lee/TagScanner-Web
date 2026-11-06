// ============================================================
// 저장 기록 분석과 구매 우선순위 계산
//
// 화면과 떼어 놓은 순수 계산만 담는다. 브라우저와 Node에서 같은 코드가 돌아가므로
// 실험 데이터(CSV)로 검증한 것과 앱이 쓰는 것이 같은 로직이다.
//
// 주의: 여기서 내는 점수는 구매 확률이 아니다. 저장 기록 안에서의 상대적 우선순위다.
//       가중치는 초기 설계값이며 학습하거나 검증한 값이 아니다.
// ============================================================
(function (root) {
  // ---- 가중치 (합계 100) ----
  var W = {
    liked: 25,       // 찜 표시
    compared: 20,    // 비교 표시
    category: 20,    // 같은 카테고리를 얼마나 자주 저장했는지
    brand: 15,       // 같은 브랜드를 얼마나 자주 저장했는지
    price: 20,       // 평소 저장하는 가격대와 가까운지
  };
  // 비교할 다른 기록이 없을 때 쓰는 중립값
  var NEUTRAL = { category: W.category / 2, brand: W.brand / 2, price: W.price / 2 };
  // 가격 차이를 나눌 때의 하한. 싼 상품에서 점수가 급락하지 않게 한다
  var PRICE_FLOOR = 10000;

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function text(v) {
    return String(v == null ? '' : v).trim();
  }

  function median(values) {
    var s = values.filter(function (v) { return num(v) !== null && v > 0; })
      .sort(function (a, b) { return a - b; });
    if (!s.length) return null;
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mean(values) {
    var s = values.filter(function (v) { return num(v) !== null && v > 0; });
    if (!s.length) return null;
    return s.reduce(function (a, b) { return a + b; }, 0) / s.length;
  }

  // 많이 나온 값부터 센다
  function countBy(items, key) {
    var map = new Map();
    items.forEach(function (it) {
      var k = text(it[key]);
      if (!k) return;
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(function (e) { return { name: e[0], count: e[1] }; })
      .sort(function (a, b) {
        return b.count - a.count || a.name.localeCompare(b.name, 'ko');
      });
  }

  // ============================================================
  // FR-08: 저장 기록 요약
  // ============================================================
  function analyze(items) {
    var list = Array.isArray(items) ? items : [];
    var total = list.length;
    if (total === 0) return { empty: true, total: 0 };

    var liked = list.filter(function (it) { return it.liked; });
    var compared = list.filter(function (it) { return it.compared; });
    var prices = list.map(function (it) { return num(it.price); })
      .filter(function (v) { return v !== null && v > 0; });

    var categories = countBy(list, 'category');
    var brands = countBy(list, 'brand');

    // 카테고리별 가격 중앙값. 가격이 있는 기록이 2건 이상인 카테고리만 낸다
    var byCategory = categories.map(function (c) {
      var members = list.filter(function (it) { return text(it.category) === c.name; });
      var mp = members.map(function (it) { return num(it.price); })
        .filter(function (v) { return v !== null && v > 0; });
      return {
        name: c.name,
        count: c.count,
        ratio: c.count / total,
        medianPrice: mp.length >= 2 ? median(mp) : null,
      };
    });

    return {
      empty: false,
      total: total,
      liked: { count: liked.length, ratio: liked.length / total },
      compared: { count: compared.length, ratio: compared.length / total },
      price: {
        mean: mean(prices),
        median: median(prices),
        likedMedian: median(liked.map(function (it) { return num(it.price); })),
        missing: total - prices.length,
      },
      categories: byCategory,
      topCategories: byCategory.slice(0, 3),
      brands: brands,
      topBrands: brands.slice(0, 3),
      decisions: {
        bought: list.filter(function (it) { return it.decision === 'bought'; }).length,
        hold: list.filter(function (it) { return it.decision === 'hold'; }).length,
        dropped: list.filter(function (it) { return it.decision === 'dropped'; }).length,
        undecided: list.filter(function (it) { return !it.decision; }).length,
      },
    };
  }

  // ============================================================
  // FR-09: 저장한 상품 중 먼저 볼 것 고르기
  // ============================================================

  // 한 건을 평가할 때는 그 건을 뺀 나머지로 기준을 만든다.
  // 자기 자신이 기준에 들어가면 어떤 상품이든 "자주 저장한 것"이 되어 버린다.
  function scoreOne(item, others) {
    var parts = {};
    var reasons = [];
    var notes = [];

    parts.liked = item.liked ? W.liked : 0;
    parts.compared = item.compared ? W.compared : 0;
    if (item.liked && item.compared) reasons.push('찜하고 비교까지 한 상품');
    else if (item.liked) reasons.push('찜한 상품');
    else if (item.compared) reasons.push('비교해 본 상품');

    // 카테고리 관심도
    var cat = text(item.category);
    if (!cat) {
      parts.category = 0;
      notes.push('카테고리 없음');
    } else {
      var catCounts = countBy(others, 'category');
      if (!catCounts.length) {
        parts.category = NEUTRAL.category;
      } else {
        var catTop = catCounts[0].count;
        var catMine = catCounts.filter(function (c) { return c.name === cat; })[0];
        var catN = catMine ? catMine.count : 0;
        parts.category = (catN / catTop) * W.category;
        if (catN > 0 && catN === catTop) reasons.push('가장 많이 저장한 ' + cat);
        else if (catN >= 2) reasons.push('자주 저장한 ' + cat);
      }
    }

    // 브랜드 관심도
    var brand = text(item.brand);
    if (!brand) {
      parts.brand = 0;
      notes.push('브랜드 없음');
    } else {
      var brandCounts = countBy(others, 'brand');
      if (!brandCounts.length) {
        parts.brand = NEUTRAL.brand;
      } else {
        var brandTop = brandCounts[0].count;
        var brandMine = brandCounts.filter(function (b) { return b.name === brand; })[0];
        var brandN = brandMine ? brandMine.count : 0;
        parts.brand = (brandN / brandTop) * W.brand;
        if (brandN >= 2) reasons.push('여러 번 저장한 ' + brand);
      }
    }

    // 가격 적합도
    var p = num(item.price);
    if (p === null || p <= 0) {
      parts.price = 0;
      notes.push('가격 없음');
    } else {
      // 기준 가격을 고르는 순서:
      //   같은 카테고리의 찜한 것 → 전체 찜한 것 → 전체 저장한 것
      var likedOthers = others.filter(function (o) { return o.liked; });
      var M = median(likedOthers
        .filter(function (o) { return text(o.category) === cat; })
        .map(function (o) { return num(o.price); }));
      if (M === null) M = median(likedOthers.map(function (o) { return num(o.price); }));
      if (M === null) M = median(others.map(function (o) { return num(o.price); }));

      if (M === null) {
        parts.price = NEUTRAL.price;
      } else {
        var gap = Math.abs(p - M) / Math.max(M, PRICE_FLOOR);
        parts.price = W.price * Math.max(0, 1 - gap);
        if (parts.price >= W.price * 0.75) reasons.push('평소 보던 가격대와 비슷함');
      }
    }

    var raw = parts.liked + parts.compared + parts.category + parts.brand + parts.price;
    return {
      parts: parts,
      total: Math.max(0, Math.min(100, raw)),
      reasons: reasons,
      notes: notes,
    };
  }

  // 사거나 포기하기로 이미 정한 상품은 다시 권하지 않는다
  function isOpen(it) {
    return it.decision !== 'bought' && it.decision !== 'dropped';
  }

  function recommend(items, topK) {
    var k = topK || 3;
    var list = (Array.isArray(items) ? items : []).filter(isOpen);
    if (!list.length) return [];

    var scored = list.map(function (item) {
      var others = list.filter(function (o) { return o.id !== item.id; });
      var s = scoreOne(item, others);
      return { item: item, parts: s.parts, total: s.total, reasons: s.reasons, notes: s.notes };
    });

    scored.sort(function (a, b) {
      return b.total - a.total
        || Number(b.item.compared) - Number(a.item.compared)
        || Number(b.item.liked) - Number(a.item.liked)
        || (num(b.item.createdAt) || 0) - (num(a.item.createdAt) || 0)
        || String(a.item.id).localeCompare(String(b.item.id));
    });

    return scored.slice(0, k);
  }

  // 앱이 쓰는 상품 모양을 계산용 모양으로 바꾼다
  function fromTags(tags, parsePrice) {
    var toPrice = typeof parsePrice === 'function' ? parsePrice : function (v) {
      var m = String(v || '').match(/([\d,]+)/);
      return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
    };
    return (tags || []).map(function (t) {
      return {
        id: t.id,
        category: t.category || '',
        brand: t.brand || '',
        price: toPrice(t.price),
        liked: Boolean(t.favorite),
        compared: Number(t.comparedCount || 0) > 0,
        decision: t.decision || '',
        createdAt: t.createdAt || 0,
        productName: t.productName || '',
        raw: t,
      };
    });
  }

  root.Insights = {
    analyze: analyze,
    recommend: recommend,
    scoreOne: scoreOne,
    fromTags: fromTags,
    WEIGHTS: W,
    NEUTRAL: NEUTRAL,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).Insights;
}
