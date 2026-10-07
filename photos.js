// ============================================================
// 상품 사진 저장소 (IndexedDB)
// localStorage는 사이트당 약 5MB라 사진을 여러 장 담을 수 없다.
// 사진은 여기에 파일(Blob)로 저장하고, 상품 정보에는 사진 id 목록만 남긴다.
// ============================================================
(function () {
  const DB_NAME = 'tagscanner';
  const STORE = 'photos';
  const DB_VERSION = 1;

  let dbPromise = null;
  const urlCache = new Map(); // 사진 id → object URL

  // 사파리는 저장이 막힌 상황에서 오류 객체를 null로 주는 경우가 있다.
  // 그대로 넘기면 받는 쪽에서 e.message를 읽다가 또 터지고, 진짜 원인은 사라진다.
  function toError(raw, fallback) {
    if (raw instanceof Error) return raw;
    if (raw && (raw.name || raw.message)) {
      const err = new Error(raw.message || raw.name);
      err.name = raw.name || 'StorageError';
      return err;
    }
    const err = new Error(fallback);
    err.name = 'StorageUnavailable';
    return err;
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        reject(toError(null, '이 브라우저에서는 사진 저장소를 쓸 수 없습니다'));
        return;
      }
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        // 사생활 보호 모드 등에서는 열기 자체가 예외를 던진다
        reject(toError(e, '사진 저장소를 열 수 없습니다'));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(toError(req.error, '사진 저장소를 열 수 없습니다'));
      req.onblocked = () => reject(toError(null, '다른 탭에서 앱이 열려 있어 사진 저장소를 쓸 수 없습니다'));
    });
    // 실패한 약속을 캐시에 남겨두면 영영 다시 시도하지 못한다
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch (e) {
        reject(toError(e, '사진 저장소에 접근할 수 없습니다'));
        return;
      }
      const store = tx.objectStore(STORE);
      let result;
      try {
        Promise.resolve(fn(store)).then((r) => { result = r; }, (e) => reject(toError(e, '사진 저장에 실패했습니다')));
      } catch (e) {
        reject(toError(e, '사진 저장에 실패했습니다'));
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(toError(tx.error, '사진 저장에 실패했습니다'));
      tx.onabort = () => reject(toError(tx.error, '사진 저장이 중단되었습니다 (저장 공간이 부족할 수 있습니다)'));
    });
  }

  const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(toError(req.error, '사진을 읽지 못했습니다'));
  });

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function put(id, blob) {
    await run('readwrite', (store) => { store.put(blob, id); });
    const old = urlCache.get(id);
    if (old) { URL.revokeObjectURL(old); urlCache.delete(id); }
    return id;
  }

  async function get(id) {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    return (await request(tx.objectStore(STORE).get(id))) || null;
  }

  async function remove(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (list.length === 0) return;
    await run('readwrite', (store) => { for (const id of list) store.delete(id); });
    for (const id of list) {
      const url = urlCache.get(id);
      if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
    }
  }

  async function listIds() {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    return request(tx.objectStore(STORE).getAllKeys());
  }

  async function clear() {
    await run('readwrite', (store) => { store.clear(); });
    for (const url of urlCache.values()) URL.revokeObjectURL(url);
    urlCache.clear();
  }

  // 화면에 쓸 주소 (같은 사진은 한 번만 만든다)
  async function url(id) {
    if (!id) return '';
    if (urlCache.has(id)) return urlCache.get(id);
    const blob = await get(id);
    if (!blob) return '';
    const u = URL.createObjectURL(blob);
    urlCache.set(id, u);
    return u;
  }

  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // <img data-photo-id="..."> 에 실제 사진을 채운다. 렌더 함수 끝에서 호출한다.
  async function hydrate(root) {
    const imgs = (root || document).querySelectorAll('img[data-photo-id]');
    await Promise.all(Array.from(imgs).map(async (img) => {
      const id = img.dataset.photoId;
      if (img.dataset.loadedId === id) return;
      const u = await url(id);
      if (u) {
        img.src = u;
        img.dataset.loadedId = id;
      } else {
        img.classList.add('photo-missing');
      }
    }));
  }

  // 사진 저장이 실제로 되는지 미리 확인한다. 참가자 기기에서 막혀 있으면 바로 알 수 있다.
  async function probe() {
    const id = '__probe__';
    try {
      await put(id, new Blob(['x'], { type: 'text/plain' }));
      await remove(id);
      return { ok: true };
    } catch (e) {
      const err = toError(e, '사진 저장소를 쓸 수 없습니다');
      return { ok: false, name: err.name, message: err.message };
    }
  }

  window.PhotoStore = { newId, put, get, remove, listIds, clear, url, hydrate, dataUrlToBlob, blobToDataUrl, probe };
})();
