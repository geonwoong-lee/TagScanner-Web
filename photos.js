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

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('사진 저장이 중단되었습니다'));
    });
  }

  const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

  window.PhotoStore = { newId, put, get, remove, listIds, clear, url, hydrate, dataUrlToBlob, blobToDataUrl };
})();
