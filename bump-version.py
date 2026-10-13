#!/usr/bin/env python
"""배포 버전을 한 번에 올린다.

index.html 안의 파일 주소(?v=...), 버전 확인 스크립트의 LOADED 값,
version.json 세 곳이 서로 어긋나면 참가자 기기에 예전 화면이 남는다.
그래서 한 군데서 같이 바꾼다.

사용법: python bump-version.py 2026-10-15a
"""
import io, json, re, sys

if len(sys.argv) != 2:
    print('사용법: python bump-version.py <새 버전>  (예: 2026-10-15a)')
    sys.exit(1)

new = sys.argv[1]
html = io.open('index.html', encoding='utf-8').read()

found = re.findall(r"\?v=([0-9a-z-]+)", html)
if not found:
    print('index.html에서 버전을 찾지 못했습니다')
    sys.exit(1)
old = found[0]

html = html.replace('?v=' + old, '?v=' + new)
html = html.replace("var LOADED = '" + old + "'", "var LOADED = '" + new + "'")
io.open('index.html', 'w', encoding='utf-8', newline='\n').write(html)

io.open('version.json', 'w', encoding='utf-8', newline='\n').write(
    json.dumps({'version': new}, ensure_ascii=False) + '\n')

print('%s -> %s' % (old, new))
