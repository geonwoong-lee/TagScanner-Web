// ============================================================
// 파일럿 테스트용 서버 연동 (Supabase)
//  - 회원가입 / 로그인
//  - 기기 간 동기화 (상품 정보 + 사진)
//  - 사용 로그 수집 (서버 기록 + GA4 이벤트)
//  - OCR 호출 대행 (참가자가 API 키를 갖지 않아도 되게)
//
// 로컬 우선으로 동작한다. 서버가 없거나 로그인하지 않아도 앱은 그대로 쓸 수 있고,
// 로그인하면 그동안 쌓인 내용을 올린다.
// ============================================================
(function () {
  const cfg = window.APP_CONFIG || {};
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.10/+esm';
  const LAST_PULL_KEY = 'tagscanner.lastPull.v1';
  const LOG_QUEUE_KEY = 'tagscanner.logQueue.v1';
  const TOMBSTONE_KEY = 'tagscanner.deleted.v1';

  let client = null;
  let currentUser = null;
  let syncing = false;
  const listeners = [];

  const enabled = () => Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const user = () => currentUser;
  const notify = () => listeners.forEach((fn) => { try { fn(currentUser); } catch (e) { console.warn(e); } });

  // ---- 기기에 남는 작은 상태값 ----
  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('저장 실패', key, e); }
  };

  // 삭제한 상품 기록 (동기화 때 서버에도 삭제를 알린다)
  function addTombstone(localId) {
    const list = readJson(TOMBSTONE_KEY, []);
    if (!list.some((t) => t.localId === localId)) list.push({ localId, deletedAt: Date.now() });
    writeJson(TOMBSTONE_KEY, list);
  }

  // ---- 시작 ----
  async function init() {
    if (!enabled()) return { enabled: false };
    try {
      const { createClient } = await import(SDK_URL);
      client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      const { data } = await client.auth.getSession();
      currentUser = data.session?.user ?? null;
      client.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user ?? null;
        notify();
      });
      notify();
      initAnalytics();
      if (currentUser) syncNow().catch((e) => console.warn('첫 동기화 실패', e));
      return { enabled: true, user: currentUser };
    } catch (e) {
      console.warn('서버 연결 실패 (앱은 계속 쓸 수 있습니다):', e);
      return { enabled: false, error: e };
    }
  }

  // ---- GA4 ----
  function initAnalytics() {
    if (!cfg.gaMeasurementId || window.gtag) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.gaMeasurementId}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // 참가자는 번호로만 구분한다 (이메일 같은 개인정보는 보내지 않는다)
    window.gtag('config', cfg.gaMeasurementId, { user_id: currentUser?.id, anonymize_ip: true });
  }

  // ---- 계정 ----
  async function signUp(email, password, participantCode) {
    if (!client) throw new Error('서버에 연결되어 있지 않습니다');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { participant_code: participantCode || null } },
    });
    if (error) throw error;
    currentUser = data.user ?? null;
    notify();
    return data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error('서버에 연결되어 있지 않습니다');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user ?? null;
    notify();
    return data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    localStorage.removeItem(LAST_PULL_KEY);
    notify();
  }

  // 데이터 수집 동의 시각 기록
  async function setConsent() {
    if (!client || !currentUser) return;
    await client.from('profiles').upsert({ id: currentUser.id, consented_at: new Date().toISOString() });
  }

  // ---- 사용 로그 ----
  // 서버에 한 줄씩 쌓고, GA4에도 같은 이름으로 보낸다. 오프라인이면 모아 두었다가 나중에 올린다.
  function log(event, payload = {}) {
    if (window.gtag && cfg.gaMeasurementId) {
      try { window.gtag('event', event, payload); } catch (e) { console.warn('GA 전송 실패', e); }
    }
    if (!enabled()) return;
    const queue = readJson(LOG_QUEUE_KEY, []);
    queue.push({ event, payload, client_ts: new Date().toISOString() });
    writeJson(LOG_QUEUE_KEY, queue.slice(-500));
    flushLogs().catch(() => {});
  }

  // 전송이 겹치면 같은 로그가 두 번 올라가므로 한 번에 하나만 보낸다
  let flushing = false;

  async function flushLogs() {
    if (!client || !currentUser || flushing) return;
    const queue = readJson(LOG_QUEUE_KEY, []);
    if (queue.length === 0) return;
    flushing = true;
    try {
      const rows = queue.map((q) => ({ ...q, user_id: currentUser.id }));
      const { error } = await client.from('usage_events').insert(rows);
      if (error) {
        console.warn('로그 전송 실패 (다음에 다시 시도)', error.message);
        return;
      }
      // 보내는 동안 새로 쌓인 로그는 남겨 둔다
      writeJson(LOG_QUEUE_KEY, readJson(LOG_QUEUE_KEY, []).slice(queue.length));
    } finally {
      flushing = false;
    }
  }

  // ---- 동기화 ----
  const toRow = (t, uid) => ({
    user_id: uid,
    local_id: t.id,
    brand: t.brand || null,
    product_name: t.productName || null,
    price: t.price || null,
    price_num: window.parsePriceNumber ? window.parsePriceNumber(t.price) : null,
    size: t.size || null,
    serial: t.serial || null,
    material: t.material || null,
    care: t.care || null,
    store: t.store || null,
    memo: t.memo || null,
    category: t.category || null,
    favorite: Boolean(t.favorite),
    decision: t.decision || null,
    decided_at: t.decidedAt ? new Date(t.decidedAt).toISOString() : null,
    compared_count: Number(t.comparedCount || 0),
    first_compared_at: t.firstComparedAt ? new Date(t.firstComparedAt).toISOString() : null,
    cover_photo_id: t.coverPhotoId || null,
    deleted: false,
    created_at: new Date(t.createdAt || Date.now()).toISOString(),
    updated_at: new Date(t.updatedAt || t.createdAt || Date.now()).toISOString(),
  });

  const fromRow = (row) => ({
    id: row.local_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    brand: row.brand || '',
    productName: row.product_name || '',
    price: row.price || '',
    size: row.size || '',
    serial: row.serial || '',
    material: row.material || '',
    care: row.care || '',
    store: row.store || '',
    memo: row.memo || '',
    category: row.category || '',
    favorite: Boolean(row.favorite),
    decision: row.decision || '',
    decidedAt: row.decided_at ? new Date(row.decided_at).getTime() : null,
    comparedCount: Number(row.compared_count || 0),
    firstComparedAt: row.first_compared_at ? new Date(row.first_compared_at).getTime() : null,
    coverPhotoId: row.cover_photo_id || undefined,
    photos: [],
  });

  async function syncNow({ silent = true } = {}) {
    if (!client || !currentUser || syncing) return { skipped: true };
    syncing = true;
    const uid = currentUser.id;
    const result = { pushed: 0, pulled: 0, photosUp: 0, photosDown: 0 };
    try {
      await flushLogs();

      // 1) 삭제 알리기
      const tombstones = readJson(TOMBSTONE_KEY, []);
      if (tombstones.length) {
        await client.from('items')
          .update({ deleted: true, updated_at: new Date().toISOString() })
          .eq('user_id', uid)
          .in('local_id', tombstones.map((t) => t.localId));
        writeJson(TOMBSTONE_KEY, []);
      }

      // 2) 내 상품 올리기
      const local = window.loadTags();
      if (local.length) {
        const { error } = await client.from('items')
          .upsert(local.map((t) => toRow(t, uid)), { onConflict: 'user_id,local_id' });
        if (error) throw error;
        result.pushed = local.length;
      }

      // 3) 사진 올리기 (서버에 없는 것만)
      const { data: remotePhotos } = await client.from('item_photos').select('id,item_id,kind').eq('user_id', uid);
      const remotePhotoIds = new Set((remotePhotos || []).map((p) => p.id));
      const { data: remoteItems } = await client.from('items').select('id,local_id,updated_at,deleted').eq('user_id', uid);
      const itemIdByLocal = new Map((remoteItems || []).map((r) => [r.local_id, r.id]));

      for (const t of local) {
        for (const p of (t.photos || [])) {
          if (remotePhotoIds.has(p.id)) continue;
          const blob = await window.PhotoStore.get(p.id);
          if (!blob) continue;
          const path = `${uid}/${p.id}.jpg`;
          const up = await client.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
          if (up.error) { console.warn('사진 업로드 실패', p.id, up.error.message); continue; }
          await client.from('item_photos').upsert({
            id: p.id, user_id: uid, item_id: itemIdByLocal.get(t.id), kind: p.kind, storage_path: path,
          });
          result.photosUp++;
        }
      }

      // 4) 다른 기기에서 바뀐 내용 받기
      const since = localStorage.getItem(LAST_PULL_KEY) || '1970-01-01T00:00:00Z';
      const { data: changed, error: pullErr } = await client.from('items')
        .select('*').eq('user_id', uid).gt('updated_at', since);
      if (pullErr) throw pullErr;

      if (changed && changed.length) {
        const tags = window.loadTags();
        const byLocalId = new Map(tags.map((t) => [t.id, t]));
        const photosByItem = new Map();
        const { data: photoRows } = await client.from('item_photos')
          .select('*').eq('user_id', uid).in('item_id', changed.map((r) => r.id));
        for (const row of photoRows || []) {
          if (!photosByItem.has(row.item_id)) photosByItem.set(row.item_id, []);
          photosByItem.get(row.item_id).push(row);
        }

        for (const row of changed) {
          const localTag = byLocalId.get(row.local_id);
          if (row.deleted) {
            if (localTag) tags.splice(tags.indexOf(localTag), 1);
            continue;
          }
          // 기기에서 더 최근에 고친 내용은 덮어쓰지 않는다
          if (localTag && (localTag.updatedAt || 0) > new Date(row.updated_at).getTime()) continue;

          const incoming = fromRow(row);
          incoming.photos = (photosByItem.get(row.id) || []).map((p) => ({
            id: p.id, kind: p.kind, createdAt: new Date(p.created_at).getTime(),
          }));
          // 사진 파일이 이 기기에 없으면 내려받는다
          for (const p of incoming.photos) {
            if (await window.PhotoStore.get(p.id)) continue;
            const dl = await client.storage.from('photos').download(`${uid}/${p.id}.jpg`);
            if (dl.error) { console.warn('사진 내려받기 실패', p.id, dl.error.message); continue; }
            await window.PhotoStore.put(p.id, dl.data);
            result.photosDown++;
          }
          if (localTag) Object.assign(localTag, incoming);
          else tags.push(incoming);
          result.pulled++;
        }
        tags.sort((a, b) => b.createdAt - a.createdAt);
        window.saveTags(tags);
      }

      localStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
      return result;
    } catch (e) {
      if (!silent) throw e;
      console.warn('동기화 실패', e);
      return { error: e };
    } finally {
      syncing = false;
    }
  }

  // ---- OCR 대행 호출 ----
  // 서버(Edge Function)가 구글 키를 갖고 대신 호출한다. 참가자는 키를 몰라도 된다.
  async function visionOcr(base64) {
    if (!client || !currentUser) throw new Error('로그인이 필요합니다');
    const { data, error } = await client.functions.invoke('vision', { body: { image: base64 } });
    if (error) throw new Error(error.message || 'OCR 서버 호출 실패');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  window.Cloud = {
    enabled, init, user, signUp, signIn, signOut, setConsent,
    log, syncNow, visionOcr, addTombstone,
    onAuthChange: (fn) => { listeners.push(fn); if (currentUser !== undefined) fn(currentUser); },
    isSyncing: () => syncing,
  };
})();
