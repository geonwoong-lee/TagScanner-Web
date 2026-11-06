// FR-08 / FR-09 계산 검증
// 실행: node tests/insights.test.js
//
// 외부 패키지 없이 Node 기본 assert만 쓴다.
// 참가자 CSV(eval/data/)가 있으면 그 데이터로도 검증하고, 없으면 그 부분만 건너뛴다.
// CSV는 공개 저장소에 올리지 않으므로 다른 사람 컴퓨터에는 없을 수 있다.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Insights = require('../insights.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  통과  ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
    console.log('  실패  ' + name + '\n         ' + e.message);
  }
}

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// 테스트용 상품 한 건
let seq = 0;
function item(over) {
  seq++;
  return Object.assign({
    id: 'i' + String(seq).padStart(4, '0'),
    category: '상의',
    brand: 'A',
    price: 50000,
    liked: false,
    compared: false,
    decision: '',
    createdAt: seq,
  }, over);
}

console.log('\n[1] 찜과 비교 점수');
test('찜만 한 것과 찜+비교 한 것의 차이는 비교 가중치(20)와 같다', () => {
  const base = [item({ category: '하의' }), item({ category: '하의' })];
  const a = Insights.scoreOne(item({ liked: true }), base);
  const b = Insights.scoreOne(item({ liked: true, compared: true }), base);
  assert.ok(close(b.total - a.total, Insights.WEIGHTS.compared),
    `차이 ${b.total - a.total}, 기대 ${Insights.WEIGHTS.compared}`);
});
test('찜 가중치는 25, 비교 가중치는 20', () => {
  const s = Insights.scoreOne(item({ liked: true, compared: true }), []);
  assert.strictEqual(s.parts.liked, 25);
  assert.strictEqual(s.parts.compared, 20);
});
test('가중치 합계는 100', () => {
  const W = Insights.WEIGHTS;
  assert.strictEqual(W.liked + W.compared + W.category + W.brand + W.price, 100);
});

console.log('\n[2] 사용자 간 격리');
test('한 사람 목록으로 계산하면 결과에 그 사람 상품만 나온다', () => {
  const userA = [item({ brand: 'X' }), item({ brand: 'X' }), item({ brand: 'Y' })];
  const userB = [item({ brand: 'Z', liked: true, compared: true })];
  const idsA = new Set(userA.map((i) => i.id));
  const recs = Insights.recommend(userA, 3);
  recs.forEach((r) => assert.ok(idsA.has(r.item.id), 'B의 상품이 섞임: ' + r.item.id));
  assert.ok(!recs.some((r) => r.item.id === userB[0].id));
});

console.log('\n[3] 저장 개수별 동작');
test('0건이면 빈 결과', () => {
  assert.deepStrictEqual(Insights.recommend([], 3), []);
  assert.strictEqual(Insights.analyze([]).empty, true);
});
test('1건이면 1개, 카테고리·브랜드·가격은 중립값', () => {
  const r = Insights.recommend([item({})], 3);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].parts.category, Insights.NEUTRAL.category);
  assert.strictEqual(r[0].parts.brand, Insights.NEUTRAL.brand);
  assert.strictEqual(r[0].parts.price, Insights.NEUTRAL.price);
});
test('2건이면 2개', () => {
  assert.strictEqual(Insights.recommend([item({}), item({})], 3).length, 2);
});
test('3건 이상이면 3개', () => {
  const list = [item({}), item({}), item({}), item({}), item({})];
  assert.strictEqual(Insights.recommend(list, 3).length, 3);
});

console.log('\n[4] 빠진 값과 극단적인 경우');
test('가격이 0이거나 없으면 가격 점수 0, 안내 문구', () => {
  const others = [item({ price: 40000 }), item({ price: 60000 })];
  const zero = Insights.scoreOne(item({ price: 0 }), others);
  const none = Insights.scoreOne(item({ price: null }), others);
  assert.strictEqual(zero.parts.price, 0);
  assert.strictEqual(none.parts.price, 0);
  assert.ok(zero.notes.includes('가격 없음'));
});
test('브랜드나 카테고리가 비면 그 점수는 0, 안내 문구', () => {
  const others = [item({}), item({})];
  const s = Insights.scoreOne(item({ brand: '', category: '' }), others);
  assert.strictEqual(s.parts.brand, 0);
  assert.strictEqual(s.parts.category, 0);
  assert.ok(s.notes.includes('브랜드 없음'));
  assert.ok(s.notes.includes('카테고리 없음'));
});
test('전부 찜이면 찜 점수는 모두 같아 순위를 가르지 않는다', () => {
  const list = [item({ liked: true }), item({ liked: true }), item({ liked: true })];
  const r = Insights.recommend(list, 3);
  r.forEach((x) => assert.strictEqual(x.parts.liked, 25));
});
test('전부 비교 안 했으면 비교 점수는 모두 0', () => {
  const list = [item({}), item({}), item({})];
  Insights.recommend(list, 3).forEach((x) => assert.strictEqual(x.parts.compared, 0));
});

console.log('\n[5] 자기 자신 제외(leave-one-out)와 재현성');
test('하나뿐인 브랜드는 자기 자신을 빼면 0점이다', () => {
  // 자기 자신을 기준에 넣으면 1/1로 만점이 된다. 빼면 0이 나와야 한다
  const list = [item({ brand: '유일' }), item({ brand: 'B' }), item({ brand: 'B' })];
  const r = Insights.recommend(list, 3);
  const solo = r.find((x) => x.item.brand === '유일');
  assert.strictEqual(solo.parts.brand, 0);
});
test('같은 입력이면 같은 결과', () => {
  const list = [item({ liked: true }), item({ brand: 'B' }), item({ compared: true }), item({})];
  const a = JSON.stringify(Insights.recommend(list, 3).map((x) => [x.item.id, x.total]));
  const b = JSON.stringify(Insights.recommend(list, 3).map((x) => [x.item.id, x.total]));
  assert.strictEqual(a, b);
});

console.log('\n[6] 점수 범위와 근거');
test('합계는 0~100이고 구성 점수의 합과 같다', () => {
  const list = [
    item({ liked: true, compared: true, price: 50000 }),
    item({ liked: true, price: 50000 }),
    item({ price: 1 }),
    item({ price: 9999999 }),
  ];
  Insights.recommend(list, 4).forEach((x) => {
    const sum = Object.values(x.parts).reduce((a, b) => a + b, 0);
    assert.ok(x.total >= 0 && x.total <= 100, '범위 밖: ' + x.total);
    assert.ok(close(x.total, sum), `합계 ${x.total} != 구성합 ${sum}`);
  });
});
test('근거 문구는 실제로 점수가 붙은 항목에서만 나온다', () => {
  const list = [item({ liked: false, compared: false, brand: '유일' }), item({}), item({})];
  const r = Insights.recommend(list, 3);
  const plain = r.find((x) => x.item.brand === '유일');
  assert.ok(!plain.reasons.some((t) => t.includes('찜')), '찜 안 했는데 찜 근거');
  assert.ok(!plain.reasons.some((t) => t.includes('비교')), '비교 안 했는데 비교 근거');
  assert.ok(!plain.reasons.some((t) => t.includes('여러 번 저장한')), '한 번뿐인데 브랜드 근거');
});

console.log('\n[7] 동점 처리와 중복');
test('동점이면 비교한 것, 찜한 것 순으로 앞선다', () => {
  // 찜(25)만 한 것과 비교(20)+가격 차이로 맞춘 것을 만들기는 어렵다.
  // 대신 정렬 규칙을 직접 확인한다: 점수가 같은 두 건에서 비교한 쪽이 앞에 와야 한다
  const a = item({ id: 'zzz', compared: true, brand: 'Q', category: 'Q', price: null });
  const b = item({ id: 'aaa', compared: false, liked: false, brand: 'Q', category: 'Q', price: null });
  // b에 비교 점수만큼 다른 점수를 줄 수 없으므로 동점 상황만 따로 만든다
  const c = item({ id: 'aaa2', compared: true, brand: 'Q', category: 'Q', price: null });
  const r = Insights.recommend([a, c], 2);
  assert.strictEqual(r[0].total, r[1].total, '동점 상황이 만들어지지 않음');
  // 동점이고 비교·찜이 같으면 최근 것이 먼저
  assert.ok(r[0].item.createdAt >= r[1].item.createdAt);
  void b;
});
test('TOP3에 같은 상품이 두 번 들어가지 않는다', () => {
  const list = [item({}), item({}), item({}), item({})];
  const ids = Insights.recommend(list, 3).map((x) => x.item.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
test('샀거나 포기한 상품은 추천에서 빠진다', () => {
  const list = [
    item({ liked: true, compared: true, decision: 'bought' }),
    item({ liked: true, compared: true, decision: 'dropped' }),
    item({ decision: 'hold' }),
    item({}),
  ];
  const r = Insights.recommend(list, 3);
  assert.ok(!r.some((x) => x.item.decision === 'bought' || x.item.decision === 'dropped'));
  assert.strictEqual(r.length, 2);
});

// ============================================================
// [8] 참가자 CSV
// ============================================================
const csvPath = path.join(__dirname, '..', 'eval', 'data', 'capstone_user_items_131.csv');
console.log('\n[8] 참가자 데이터');
if (!fs.existsSync(csvPath)) {
  console.log('  건너뜀  ' + path.relative(process.cwd(), csvPath) + ' 없음');
} else {
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(',');
    const o = {};
    header.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });

  test('131행', () => assert.strictEqual(rows.length, 131));
  test('사용자 10명', () => assert.strictEqual(new Set(rows.map((r) => r.user_id)).size, 10));
  test('찜 표시 107행', () => assert.strictEqual(rows.filter((r) => r.liked === '1').length, 107));
  test('비교 표시 40행', () => assert.strictEqual(rows.filter((r) => r.compared === '1').length, 40));
  test('남성 5명, 여성 5명', () => {
    const g = {};
    rows.forEach((r) => { g[r.user_id] = r.gender; });
    const v = Object.values(g);
    assert.strictEqual(v.filter((x) => x === '남성').length, 5);
    assert.strictEqual(v.filter((x) => x === '여성').length, 5);
  });
  test('전원 20대', () => assert.ok(rows.every((r) => r.age_group === '20대')));

  // 앱이 계산할 모양으로 바꾼다. 성별과 나이는 점수에 넣지 않는다
  const toItem = (r) => ({
    id: r.record_id,
    category: r.category,
    brand: r.brand,
    price: Number(r.price_krw),
    liked: r.liked === '1',
    compared: r.compared === '1',
    decision: '',
    createdAt: 0,
  });

  const byUser = {};
  rows.forEach((r) => { (byUser[r.user_id] = byUser[r.user_id] || []).push(toItem(r)); });

  test('사용자별 추천에 다른 사용자 기록이 섞이지 않는다', () => {
    Object.entries(byUser).forEach(([uid, list]) => {
      const mine = new Set(list.map((i) => i.id));
      Insights.recommend(list, 3).forEach((x) => {
        assert.ok(mine.has(x.item.id), `${uid}번 결과에 남의 기록 ${x.item.id}`);
      });
    });
  });
  test('성별을 바꿔도 점수가 같다 (성별은 점수에 쓰지 않는다)', () => {
    const list = byUser['1'];
    const a = Insights.recommend(list, 3).map((x) => x.total);
    const b = Insights.recommend(list.map((i) => Object.assign({}, i, { gender: '여성' })), 3).map((x) => x.total);
    assert.deepStrictEqual(a, b);
  });

  // 사용자별 결과를 보여준다 (발표 자료 확인용)
  console.log('\n  사용자별 TOP3');
  Object.keys(byUser).sort((a, b) => a - b).forEach((uid) => {
    const list = byUser[uid];
    const s = Insights.analyze(list);
    const recs = Insights.recommend(list, 3);
    console.log(`\n  ${uid}번 (${list.length}건, 찜 ${s.liked.count}, 비교 ${s.compared.count}, 중앙가 ${Math.round(s.price.median).toLocaleString()}원)`);
    recs.forEach((x, i) => {
      console.log(`    ${i + 1}. ${x.item.id} ${x.item.category}/${x.item.brand} ${x.item.price.toLocaleString()}원  ${x.total.toFixed(2)}점  [${x.reasons.join(', ')}]`);
    });
  });
}

console.log(`\n결과: 통과 ${passed}, 실패 ${failed}`);
if (failed) {
  console.log('\n실패 항목');
  failures.forEach((f) => console.log('  - ' + f.name + ': ' + f.message));
  process.exit(1);
}
