r"""SC-300 CBT data.js 빌드.

입력
  ..\..\sc-300\sc300.json   examcademy SC-300 434문항 (scripts/parse.py + images_md.py 결과, 문항별 topic 포함)
  tools\ko\*.json           한국어 번역 (키: 문항 번호 문자열)

출력
  data.js  (window.SC300_DATA)
  assets\  이미지

번역이 없는 문항은 영어 원문으로 대체하고 koMissing=true 를 붙인다.
"""
import json, re, glob, html, sys, os, shutil, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
DL = os.path.normpath(os.path.join(ROOT, '..'))
SRC_DIR = os.path.join(DL, 'sc-300')
SRC = os.path.join(SRC_DIR, 'sc300.json')
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else ROOT

TOPIC_KO = {
    'Implement and manage user identities': '사용자 ID 구현 및 관리',
    'Implement authentication and access management': '인증 및 액세스 관리 구현',
    'Plan and implement workload identities': '워크로드 ID 계획 및 구현',
    'Plan and implement identity governance': 'ID 거버넌스 계획 및 구현',
}
TOPIC_ORDER = list(TOPIC_KO.keys())

IMG_RE = re.compile(r'!\[[^\]]*\]\((images/[^)]+)\)')
LEARN_RE = re.compile(r'\n*\*\*Learn more:\*\*\s*(.*)$', re.S)
LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

errors = []
warnings = []

def load_ko(pattern):
    ko = {}
    for f in sorted(glob.glob(pattern)):
        try:
            ko.update(json.load(open(f, encoding='utf-8')))
        except Exception as e:
            errors.append(f'{f}: JSON 파싱 실패 — {e}')
    return ko

def split_learn(expl):
    learn = []
    m = LEARN_RE.search(expl or '')
    if m:
        learn = [{'title': t, 'url': u} for t, u in LINK_RE.findall(m.group(1))]
        expl = expl[:m.start()].rstrip()
    return html.unescape(expl or ''), learn

def convert(q, k, *, n, topic, label):
    """스크랩 문항 q + 번역 k(없으면 None) → data.js 문항."""
    ko_missing = k is None
    k = k or {}
    stem_en = html.unescape(q['stemRaw'])
    images = []
    def img_sub(m):
        images.append(m.group(1)); return f'[[IMG{len(images)}]]'
    stem_en = IMG_RE.sub(img_sub, stem_en)
    stem_en = re.sub(r'[ \t]+\n', '\n', stem_en)
    stem_ko = k.get('stem') or stem_en
    if not ko_missing:
        n_img_ko = len(re.findall(r'\[\[IMG\d+\]\]', stem_ko))
        if n_img_ko != len(images):
            errors.append(f'{label}: 이미지 자리표시자 불일치 (en {len(images)} / ko {n_img_ko})')
    expl_en, learn = split_learn(q.get('explanation', ''))
    expl_ko = k.get('explanation') or expl_en

    item = {
        'n': n, 'id': q['questionId'], 'type': q['type'],
        'topic': topic, 'topicKo': TOPIC_KO[topic],
        'koMissing': ko_missing,
        'images': ['assets/' + os.path.basename(im) for im in images],
        'stemEn': stem_en, 'stemKo': stem_ko,
        'explanationEn': expl_en, 'explanationKo': expl_ko,
        'learnMore': learn,
    }
    t = q['type']
    unesc = lambda v: v[1:] if isinstance(v, str) and v.startswith('$$') else v
    if t == 'dropdown':
        for b in q['blanks']:
            b['options'] = [unesc(o) for o in b['options']]; b['answer'] = unesc(b['answer'])
    if t == 'drag_drop':
        q['items'] = [unesc(x) for x in q['items']]
        for s_ in q['slots']: s_['answer'] = unesc(s_['answer'])
    if t == 'multiple_choice':
        cho = k.get('choices', {})
        item['choices'] = []
        for c in q['choices']:
            if not ko_missing and c['label'] not in cho:
                errors.append(f'{label}: 선택지 {c["label"]} 번역 없음')
            item['choices'].append({'label': c['label'], 'en': html.unescape(c['text']), 'ko': cho.get(c['label'], html.unescape(c['text']))})
        item['answers'] = q['answers']
        if not all(a in [c['label'] for c in q['choices']] for a in q['answers']):
            warnings.append(f'{label}: 정답 라벨이 선택지에 없음 {q["answers"]}')
    elif t == 'dropdown':
        bl = k.get('blanks', {})
        item['blanks'] = []
        for b in q['blanks']:
            kb = bl.get(b['id'])
            if not ko_missing and not kb:
                errors.append(f'{label}: blank {b["id"]} 번역 없음')
            kb = kb or {'label': b['label'], 'options': b['options']}
            if len(kb['options']) != len(b['options']):
                errors.append(f'{label}: blank {b["id"]} 옵션 수 불일치 ({len(b["options"])} vs {len(kb["options"])})')
                kb = {'label': kb['label'], 'options': b['options']}
            item['blanks'].append({
                'id': b['id'], 'labelEn': b['label'], 'labelKo': kb['label'] or b['label'] or b['id'],
                'options': [{'en': e, 'ko': kk} for e, kk in zip(b['options'], kb['options'])],
                'answer': b['answer'],
            })
            if b['answer'] not in b['options']:
                errors.append(f'{label}: blank {b["id"]} 정답이 옵션에 없음')
        tpl = q.get('template') or ''
        if tpl.startswith('$$'): tpl = tpl[1:]
        item['template'] = html.unescape(tpl)
    elif t == 'statements':
        st = k.get('statements', [])
        if not ko_missing and len(st) != len(q['statements']):
            errors.append(f'{label}: statements 수 불일치')
        item['statements'] = [{'en': html.unescape(s['text']), 'ko': st[i] if i < len(st) else html.unescape(s['text']), 'answer': s['answer']} for i, s in enumerate(q['statements'])]
        item['columns'] = q.get('columns') or ['Yes', 'No']
    elif t == 'drag_drop':
        it = k.get('items', {}); sl = k.get('slots', {})
        if not ko_missing:
            for x in q['items']:
                if x not in it: errors.append(f'{label}: item 번역 없음: {x[:50]}')
        item['items'] = [{'en': x, 'ko': it.get(x, x)} for x in q['items']]
        item['slots'] = []
        for s in q['slots']:
            if not ko_missing and s['id'] not in sl: errors.append(f'{label}: slot {s["id"]} 번역 없음')
            if s['answer'] not in q['items']: errors.append(f'{label}: slot {s["id"]} 정답이 items에 없음')
            item['slots'].append({'id': s['id'], 'labelEn': s['label'], 'labelKo': sl.get(s['id'], s['label'] or s['id']), 'answer': s['answer']})
    elif t == 'answer_reveal':
        at = html.unescape(q.get('answerText') or '')
        aimgs = []
        def aimg(m):
            aimgs.append(m.group(1)); return ''
        at_en = IMG_RE.sub(aimg, at).strip()
        item['answerImages'] = ['assets/' + os.path.basename(im) for im in aimgs]
        item['answerTextEn'] = at_en
        item['answerTextKo'] = k.get('answerText') or at_en
        images += aimgs
    else:
        errors.append(f'{label}: 알 수 없는 유형 {t}')
    return item, images

def ensure_asset(rel, dst_dir):
    src = os.path.join(SRC_DIR, rel)
    dst = os.path.join(dst_dir, os.path.basename(rel))
    if not os.path.exists(src):
        errors.append(f'이미지 없음: {src}'); return
    os.makedirs(dst_dir, exist_ok=True)
    if not os.path.exists(dst):
        shutil.copy(src, dst)

src = json.load(open(SRC, encoding='utf-8'))
ko = load_ko(os.path.join(HERE, 'ko', '*.json'))
out = []
for q in sorted(src['questions'], key=lambda x: x['questionNumber']):
    n = q['questionNumber']
    if q['topic'] not in TOPIC_KO:
        errors.append(f'Q{n}: 알 수 없는 영역 {q["topic"]}'); continue
    item, imgs = convert(q, ko.get(str(n)), n=n, topic=q['topic'], label=f'Q{n}')
    for im in imgs: ensure_asset(im, os.path.join(OUT_DIR, 'assets'))
    out.append(item)

if errors:
    print('\n'.join(errors)); sys.exit(1)
for w in warnings: print('WARN', w)
unknown_ko = [k for k in ko if not any(str(q['n']) == k for q in out)]
if unknown_ko: print('WARN 번역 키가 문항에 없음:', unknown_ko)

weights = {t['topicName']: (t['percentageMin'], t['percentageMax']) for t in src['topics']}
topic_stats = [{'en': t, 'ko': TOPIC_KO[t], 'weight': list(weights[t]), 'count': sum(1 for q in out if q['topic'] == t)} for t in TOPIC_ORDER]
translated = sum(1 for q in out if not q['koMissing'])
data = {
    'version': '2026-09-19.v1',
    'title': 'SC-300 CBT',
    'source': 'examcademy.com (sc-300)',
    'scrapedAt': src['scrapedAt'][:10],
    'questionCount': len(out), 'translated': translated,
    'topics': topic_stats,
    'questions': out,
}
with open(os.path.join(OUT_DIR, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.SC300_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n')
print(f'OK {len(out)}문항 (번역 {translated}/{len(out)}) → {os.path.join(OUT_DIR, "data.js")}')
print(dict(collections.Counter(q['type'] for q in out)))
print({t['ko']: t['count'] for t in topic_stats})
