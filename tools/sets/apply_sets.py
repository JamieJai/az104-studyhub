r"""AZ-802 / SC-300 data.js 에 세트(공통 지문) 정보와 유실 이미지 표시를 덧붙인다.

  python tools/sets/apply_sets.py            # dist/AZ-802_CBT/data.js, dist/SC-300_CBT/data.js 갱신
  python tools/sets/apply_sets.py --check    # 결과만 출력

세트 = 같은 지문(Case Study)·같은 표를 공유하는 문항 묶음. MS 시험처럼 한 지문에 여러 문항이 붙는 방식이라
앱에서 세트 문항은 연속으로(랜덤·모의고사에서도 한 덩어리로) 출제하고 `세트 1-3` 식으로 표시한다.

각 세트 문항에는
  set      {id, no, idx, size}
  caseEn/caseKo   공통 지문 (stem 에서 질문 부분을 뺀 앞부분 — 원본 stemEn/stemKo 는 그대로 둔다)
  askEn/askKo     질문 부분 (마지막 "You need to … / Which …" 문단들)
를 넣고, DATA.sets 에 세트 목록을 둔다. 이미지 파일이 유실된(수백 바이트짜리 빈 PNG) 문항은 missingImages 에 1-based 번호를 적는다.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
CHECK = '--check' in sys.argv

SETS = {
    'AZ-802': [
        {'id': 'az802-contoso', 'titleEn': 'Case study — Contoso, Ltd.', 'titleKo': '사례 연구 — Contoso, Ltd.',
         'members': [5, 6, 7, 11, 30, 48, 54, 62, 63]},
    ],
    'SC-300': [
        {'id': 'sc300-adatum', 'titleEn': 'Case study — ADatum Corporation', 'titleKo': '사례 연구 — ADatum Corporation',
         'members': [49, 129], 'caseFrom': 129},   # 49 는 스크랩 원본에 지문이 빠져 있어 129 의 지문을 붙인다
    ],
}
VAR = {'AZ-802': 'AZ802', 'SC-300': 'SC300'}
VERSION = {'AZ-802': '2026-09-22.v3', 'SC-300': '2026-09-22.v2'}

# 질문 문단: 마지막에서부터 이 패턴에 걸리는 문단까지를 "질문" 으로 본다 (목록 항목·긴 문단은 제외)
ASK_EN = re.compile(r'^(\*\*)?(You (need|implement|must|plan|are|have|want|create|configure)|Which |What |How |For each |NOTE|Note:|To answer|On which|Does |Select |Where )', re.I)

TYPE_HEAD = re.compile(r'^\s*(\*\*)?(HOTSPOT|DRAG DROP)(\*\*)?\s*[-–—]?\s*\n+')

def paragraphs(text):
    return text.replace('\r', '').split('\n\n')

def split_en(text):
    paras = paragraphs(text)
    idx = [i for i, p in enumerate(paras) if p.strip()]
    j = len(idx)
    while j > 0:
        p = paras[idx[j - 1]].strip()
        if ASK_EN.search(p) and not p.startswith('- ') and len(p) < 400: j -= 1
        else: break
    if j == len(idx): j = len(idx) - 1
    k = len(idx) - j                       # 질문 문단 수
    cut = idx[j]
    return '\n\n'.join(paras[:cut]).strip(), '\n\n'.join(paras[cut:]).strip(), k

def split_ko(text, k):
    """한국어는 문단 경계 규칙이 흔들려서 영어 질문 문단 수(k)만큼 뒤에서 잘라 맞춘다."""
    paras = paragraphs(text)
    idx = [i for i, p in enumerate(paras) if p.strip()]
    cut = idx[max(0, len(idx) - k)]
    return '\n\n'.join(paras[:cut]).strip(), '\n\n'.join(paras[cut:]).strip()

def strip_img_markers(text):
    return re.sub(r'\n*\[\[IMG\d+\]\]\n*', '\n\n', text).strip()

def load(exam):
    p = os.path.join(ROOT, 'dist', f'{exam}_CBT', 'data.js')
    s = open(p, encoding='utf-8', newline='').read()
    return p, json.JSONDecoder().raw_decode(s[s.index('{'):])[0]

def main():
    for exam, sets in SETS.items():
        path, data = load(exam)
        qs = data['questions']; byn = {q['n']: q for q in qs}
        # 이전 실행 결과 제거 (재실행 가능)
        for q in qs:
            for k in ('set', 'caseEn', 'caseKo', 'askEn', 'askKo', 'missingImages'): q.pop(k, None)
        out_sets = []
        for no, s in enumerate(sets, 1):
            members = sorted(s['members'])
            src = byn[s['caseFrom']] if s.get('caseFrom') else None
            src_split = None
            if src:
                ce, ae, k = split_en(src['stemEn']); ck, ak = split_ko(src['stemKo'], k)
                src_split = (ce, ck, src['images'])
            for i, n in enumerate(members, 1):
                q = byn[n]
                ce, ae, k = split_en(q['stemEn']); ck, ak = split_ko(q['stemKo'], k)
                if src and n != s['caseFrom']:
                    # 지문이 빠진 문항: 세트 대표 문항의 지문·이미지를 붙이고, 끝에 붙어 있던 이미지 표식은 뗀다
                    ce, ck, imgs = src_split
                    ae, ak = strip_img_markers(q['stemEn']), strip_img_markers(q['stemKo'])
                    ak = re.sub(r'^\*\(참고:.*?\)\*\s*', '', ak, flags=re.S)     # "지문이 빠졌다"는 번역자 주석은 이제 불필요
                    q['images'] = list(imgs)
                    q['stemEn'] = ce + '\n\n' + ae; q['stemKo'] = ck + '\n\n' + ak
                # 공통 지문 맨 앞의 문항 유형 머리말(HOTSPOT - / DRAG DROP -)은 개별 문항 것이라 지문에서는 뗀다
                ce = TYPE_HEAD.sub('', ce); ck = TYPE_HEAD.sub('', ck)
                q['set'] = {'id': s['id'], 'no': no, 'idx': i, 'size': len(members)}
                q['caseEn'], q['caseKo'], q['askEn'], q['askKo'] = ce, ck, ae, ak
                print(f'{exam} set{no}-{i} n={n:<4} ask(en)={ae[:60].replace(chr(10), " ")!r}  ask(ko)={ak[:40].replace(chr(10), " ")!r}')
            out_sets.append({'id': s['id'], 'no': no, 'titleEn': s['titleEn'], 'titleKo': s['titleKo'], 'members': members})
        data['sets'] = out_sets
        # 유실 이미지 (스크랩 원본에서 깨진 수백 바이트짜리 파일)
        miss = 0
        for q in qs:
            bad = []
            for i, im in enumerate(q['images'], 1):
                f = os.path.join(ROOT, 'dist', f'{exam}_CBT', im)
                if not os.path.exists(f) or os.path.getsize(f) < 300: bad.append(i)
            if bad: q['missingImages'] = bad; miss += 1
        data['version'] = VERSION[exam]
        print(f'{exam}: sets={len(out_sets)} members={sum(len(s["members"]) for s in out_sets)} missing-image questions={miss} version={data["version"]}')
        if not CHECK:
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(f'window.{VAR[exam]}_DATA = ' + json.dumps(data, ensure_ascii=False) + ';\n')

main()
