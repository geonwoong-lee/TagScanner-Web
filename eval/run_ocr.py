"""택 사진을 Google Vision에 보내 원본 응답을 ocr_cache/에 저장한다.

앱(app.js runGoogleVisionOcr)과 같은 조건으로 호출한다:
긴 변 2048px 리사이즈, JPEG 0.92, TEXT_DETECTION + LOGO_DETECTION(5), 언어 힌트 ko/en.
키는 Windows 사용자 환경변수 GOOGLE_VISION_API_KEY에서 읽고 URL이 아닌 헤더로 보낸다.
이미 캐시된 이미지는 다시 호출하지 않는다.
"""
import base64
import io
import json
import os
import sys
import winreg

import requests
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, "ocr_cache")
MAX_SIDE = 2048


def load_key():
    key = os.environ.get("GOOGLE_VISION_API_KEY")
    if key:
        return key
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            return winreg.QueryValueEx(k, "GOOGLE_VISION_API_KEY")[0]
    except OSError:
        sys.exit("GOOGLE_VISION_API_KEY 환경변수가 없습니다")


def encode(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode()


def main():
    key = load_key()
    os.makedirs(CACHE, exist_ok=True)
    truth = json.load(open(os.path.join(ROOT, "ground_truth.json"), encoding="utf-8"))
    todo = [r["id"] for r in truth if not r.get("exclude")
            and not os.path.exists(os.path.join(CACHE, r["id"] + ".json"))]
    print(f"호출 대상 {len(todo)}장")
    for i, tid in enumerate(todo, 1):
        body = {"requests": [{
            "image": {"content": encode(os.path.join(ROOT, "images", tid + ".jpg"))},
            "features": [{"type": "TEXT_DETECTION", "maxResults": 1},
                         {"type": "LOGO_DETECTION", "maxResults": 5}],
            "imageContext": {"languageHints": ["ko", "en"]},
        }]}
        res = requests.post("https://vision.googleapis.com/v1/images:annotate",
                            headers={"X-Goog-Api-Key": key}, json=body, timeout=60)
        if not res.ok:
            sys.exit(f"{tid}: HTTP {res.status_code} {res.text[:300]}")
        resp = res.json()["responses"][0]
        if "error" in resp:
            sys.exit(f"{tid}: {resp['error']}")
        with open(os.path.join(CACHE, tid + ".json"), "w", encoding="utf-8") as f:
            json.dump(resp, f, ensure_ascii=False)
        print(f"[{i}/{len(todo)}] {tid} ok")


if __name__ == "__main__":
    main()
