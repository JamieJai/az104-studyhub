r"""AZ-802 CBT data.js 빌드.

입력
  ..\..\az-802\az802.json                       현행 AZ-802 63문항 (examcademy 스크랩)
  tools\topics.json                             현행 문항별 출제 영역
  tools\ko\*.json                               현행 문항 한국어 번역
  ..\..\az-800-801-merged\az802_legacy_bank.json 구형 AZ-800/801 중 AZ-802 범위 377문항 (영역 분류 완료)
  tools\ko_legacy\*.json                        구형 문항 한국어 번역 (id 키: "AZ-800-Q2")

출력
  data.js  (window.AZ802_DATA)   현행 n=1..63, 구형 n=101..
  assets\  이미지 (구형은 assets\az-800\, assets\az-801\)

번역이 없는 구형 문항은 영어 원문으로 대체하고 koMissing=true 를 붙인다.
"""
import json, re, glob, html, sys, os, shutil, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
DL = os.path.normpath(os.path.join(ROOT, '..'))
SRC = os.path.join(DL, 'az-802', 'az802.json')
LEGACY = os.path.join(DL, 'az-800-801-merged', 'az802_legacy_bank.json')
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else ROOT

TOPIC_KO = {
    'Deploy and manage AD DS': 'AD DS 배포 및 관리',
    'Manage Windows Server instances and workloads in a hybrid environment': '하이브리드 환경의 Windows Server 인스턴스·워크로드 관리',
    'Manage virtual machines': '가상 머신 관리',
    'Implement and manage an on-premises and hybrid networking infrastructure': '온-프레미스·하이브리드 네트워킹 인프라 구현 및 관리',
    'Manage storage and file services': '스토리지 및 파일 서비스 관리',
    'Secure Windows Server infrastructure': 'Windows Server 인프라 보안',
    'Monitor and troubleshoot Windows Server environments': 'Windows Server 환경 모니터링 및 문제 해결',
}
TOPIC_ORDER = list(TOPIC_KO.keys())
TOPIC_WEIGHT = {
    'Deploy and manage AD DS': (20, 25),
    'Manage Windows Server instances and workloads in a hybrid environment': (10, 15),
    'Manage virtual machines': (10, 15),
    'Implement and manage an on-premises and hybrid networking infrastructure': (10, 15),
    'Manage storage and file services': (15, 20),
    'Secure Windows Server infrastructure': (10, 15),
    'Monitor and troubleshoot Windows Server environments': (15, 20),
}

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

def convert(q, k, *, n, topic, legacy, asset_prefix, label):
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
        'n': n, 'id': q.get('id') or q['questionId'], 'type': q['type'],
        'topic': topic, 'topicKo': TOPIC_KO[topic],
        'legacy': legacy, 'koMissing': ko_missing,
        'images': [asset_prefix + os.path.basename(im) for im in images],
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
        item['answerImages'] = [asset_prefix + os.path.basename(im) for im in aimgs]
        item['answerTextEn'] = at_en
        item['answerTextKo'] = k.get('answerText') or at_en
    else:
        errors.append(f'{label}: 알 수 없는 유형 {t}')
    return item, images

def ensure_asset(src_dir, rel, dst_dir):
    src = os.path.join(src_dir, rel)
    dst = os.path.join(dst_dir, os.path.basename(rel))
    if not os.path.exists(src):
        errors.append(f'이미지 없음: {src}'); return
    os.makedirs(dst_dir, exist_ok=True)
    if not os.path.exists(dst):
        shutil.copy(src, dst)

out = []

# ---- 현행 AZ-802 ----
questions = json.load(open(SRC, encoding='utf-8'))
topics = json.load(open(os.path.join(HERE, 'topics.json'), encoding='utf-8'))
ko = load_ko(os.path.join(HERE, 'ko', '*.json'))
for q in sorted(questions, key=lambda x: x['questionNumber']):
    n = q['questionNumber']
    k = ko.get(str(n))
    if not k:
        errors.append(f'Q{n}: 현행 문항 번역 없음'); continue
    item, imgs = convert(q, k, n=n, topic=topics[str(n)], legacy=None, asset_prefix='assets/', label=f'Q{n}')
    for im in imgs: ensure_asset(os.path.join(DL, 'az-802'), im, os.path.join(OUT_DIR, 'assets'))
    out.append(item)

# ---- 구형 AZ-800/801 ----
legacy_count = 0; legacy_ko = 0
if os.path.exists(LEGACY):
    bank = json.load(open(LEGACY, encoding='utf-8'))
    kol = load_ko(os.path.join(HERE, 'ko_legacy', '*.json'))
    for q in bank['questions']:
        n = 100 + q['n']
        k = kol.get(q['id'])
        legacy = {'exam': q['sourceExam'], 'q': q['sourceQuestion'], 'id': q['id'],
                  'sourceTopic': q.get('sourceTopic') or '', 'skill': q.get('az802Skill') or ''}
        exam_dir = q['sourceExam'].lower()   # az-800
        item, imgs = convert(q, k, n=n, topic=q['az802AreaEn'], legacy=legacy, asset_prefix=f'assets/{exam_dir}/', label=q['id'])
        for im in imgs:
            ensure_asset(os.path.join(DL, 'az-800-801-merged'), im, os.path.join(OUT_DIR, 'assets', exam_dir))
        if q['type'] == 'answer_reveal':
            for im in IMG_RE.findall(q.get('answerText') or ''):
                ensure_asset(os.path.join(DL, 'az-800-801-merged'), im, os.path.join(OUT_DIR, 'assets', exam_dir))
        out.append(item)
        legacy_count += 1; legacy_ko += 0 if k is None else 1
else:
    warnings.append('구형 문제은행 없음: ' + LEGACY)

out.sort(key=lambda x: x['n'])
if errors:
    print('\n'.join(errors)); sys.exit(1)
for w in warnings: print('WARN', w)

current = [q for q in out if not q['legacy']]
legacy = [q for q in out if q['legacy']]
topic_stats = []
for t in TOPIC_ORDER:
    topic_stats.append({'en': t, 'ko': TOPIC_KO[t], 'weight': TOPIC_WEIGHT[t],
                        'count': sum(1 for q in current if q['topic'] == t),
                        'legacyCount': sum(1 for q in legacy if q['topic'] == t)})
data = {
    'version': '2026-09-19.v2',
    'title': 'AZ-802 CBT',
    'source': 'examcademy.com (az-802 / az-800 / az-801)',
    'questionCount': len(current), 'legacyCount': len(legacy), 'legacyTranslated': legacy_ko,
    'topics': topic_stats,
    'questions': out,
}
with open(os.path.join(OUT_DIR, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.AZ802_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n')
print(f'OK 현행 {len(current)} + 구형 {len(legacy)} (번역 {legacy_ko}/{len(legacy)}) → {os.path.join(OUT_DIR, "data.js")}')
print(collections.Counter(q['type'] for q in out))
