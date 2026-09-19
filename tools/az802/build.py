"""Merge scraped az802.json + topics.json + ko/*.json into data.js for the CBT app."""
import json, re, glob, html, sys, os

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'az-802', 'az802.json')
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

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
# 공식 출제 비중 (examcademy 표기)
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

questions = json.load(open(SRC, encoding='utf-8'))
topics = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'topics.json'), encoding='utf-8'))
ko = {}
for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ko', '*.json'))):
    ko.update(json.load(open(f, encoding='utf-8')))

errors = []
out = []
for q in questions:
    n = q['questionNumber']
    k = ko.get(str(n))
    if not k:
        errors.append(f'Q{n}: 번역 없음'); continue
    stem_en = html.unescape(q['stemRaw'])
    images = []
    def img_sub(m):
        images.append(m.group(1))
        return f'[[IMG{len(images)}]]'
    stem_en = IMG_RE.sub(img_sub, stem_en)
    stem_en = re.sub(r'[ \t]+\n', '\n', stem_en)
    stem_ko = k['stem']
    n_img_ko = len(re.findall(r'\[\[IMG\d+\]\]', stem_ko))
    if n_img_ko != len(images):
        errors.append(f'Q{n}: 이미지 자리표시자 불일치 (en {len(images)} / ko {n_img_ko})')

    expl_en = q.get('explanation', '')
    learn = []
    m = LEARN_RE.search(expl_en)
    if m:
        learn = [{'title': t, 'url': u} for t, u in LINK_RE.findall(m.group(1))]
        expl_en = expl_en[:m.start()].rstrip()
    expl_en = html.unescape(expl_en)

    item = {
        'n': n, 'id': q['questionId'], 'type': q['type'],
        'topic': topics[str(n)], 'topicKo': TOPIC_KO[topics[str(n)]],
        'images': images,
        'stemEn': stem_en, 'stemKo': stem_ko,
        'explanationEn': expl_en, 'explanationKo': k['explanation'],
        'learnMore': learn,
    }
    t = q['type']
    if t == 'multiple_choice':
        cho = k.get('choices', {})
        item['choices'] = []
        for c in q['choices']:
            if c['label'] not in cho:
                errors.append(f'Q{n}: 선택지 {c["label"]} 번역 없음')
            item['choices'].append({'label': c['label'], 'en': html.unescape(c['text']), 'ko': cho.get(c['label'], c['text'])})
        item['answers'] = q['answers']
    elif t == 'dropdown':
        bl = k.get('blanks', {})
        item['blanks'] = []
        for b in q['blanks']:
            kb = bl.get(b['id'])
            if not kb:
                errors.append(f'Q{n}: blank {b["id"]} 번역 없음'); kb = {'label': b['label'], 'options': b['options']}
            if len(kb['options']) != len(b['options']):
                errors.append(f'Q{n}: blank {b["id"]} 옵션 수 불일치')
            item['blanks'].append({
                'id': b['id'], 'labelEn': b['label'], 'labelKo': kb['label'],
                'options': [{'en': e, 'ko': kk} for e, kk in zip(b['options'], kb['options'])],
                'answer': b['answer'],
            })
            if b['answer'] not in b['options']:
                errors.append(f'Q{n}: blank {b["id"]} 정답이 옵션에 없음')
        tpl = q.get('template') or ''
        if tpl.startswith('$$'):
            tpl = tpl[1:]
        item['template'] = tpl
    elif t == 'statements':
        st = k.get('statements', [])
        if len(st) != len(q['statements']):
            errors.append(f'Q{n}: statements 수 불일치')
        item['statements'] = [{'en': s['text'], 'ko': st[i] if i < len(st) else s['text'], 'answer': s['answer']} for i, s in enumerate(q['statements'])]
        item['columns'] = q.get('columns', ['Yes', 'No'])
    elif t == 'drag_drop':
        it = k.get('items', {}); sl = k.get('slots', {})
        for x in q['items']:
            if x not in it: errors.append(f'Q{n}: item 번역 없음: {x}')
        item['items'] = [{'en': x, 'ko': it.get(x, x)} for x in q['items']]
        item['slots'] = []
        for s in q['slots']:
            if s['id'] not in sl: errors.append(f'Q{n}: slot {s["id"]} 번역 없음')
            if s['answer'] not in q['items']: errors.append(f'Q{n}: slot {s["id"]} 정답이 items에 없음')
            item['slots'].append({'id': s['id'], 'labelEn': s['label'], 'labelKo': sl.get(s['id'], s['label']), 'answer': s['answer']})
    out.append(item)

out.sort(key=lambda x: x['n'])
if errors:
    print('\n'.join(errors)); sys.exit(1)

# 이미지 존재 확인
for q in out:
    for im in q['images']:
        if not os.path.exists(os.path.join(OUT_DIR, 'assets', os.path.basename(im))):
            print('이미지 없음:', im)
    q['images'] = ['assets/' + os.path.basename(im) for im in q['images']]

topic_counts = {t: sum(1 for q in out if q['topic'] == t) for t in TOPIC_ORDER}
data = {
    'version': '2026-09-19.v1',
    'title': 'AZ-802 CBT',
    'source': 'examcademy.com/exams/microsoft/az-802',
    'questionCount': len(out),
    'topics': [{'en': t, 'ko': TOPIC_KO[t], 'weight': TOPIC_WEIGHT[t], 'count': topic_counts[t]} for t in TOPIC_ORDER],
    'questions': out,
}
os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.AZ802_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n')
print('OK', len(out), '문항 →', OUT_DIR + '/data.js')
import collections
print(collections.Counter(q['type'] for q in out))
print(topic_counts)
