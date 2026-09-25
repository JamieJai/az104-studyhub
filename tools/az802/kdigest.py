r"""CBT 번호로 한국어 문제 요약 출력 (이론서 확인문제 작성용)

    python tools/az802/kdigest.py 24 52 130          # 기본 AZ-802
    python tools/az802/kdigest.py --cbt AZ-900 66    # 다른 시험도 같은 형식이라 그대로 읽힌다
"""
import json, re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))   # 저장소 루트 (tools/az802 -> ../..)
args = sys.argv[1:]
cbt = 'AZ-802'
if args and args[0] == '--cbt':
    cbt = args[1]
    args = args[2:]
src = open(os.path.join(root, 'dist', cbt + '_CBT', 'data.js'), encoding='utf-8').read()
d = json.loads(src[src.index('{'):src.rindex('}') + 1])
byn = {q['n']: q for q in d['questions']}
for n in [int(a) for a in args]:
    q = byn[n]
    print(f"\n##### #{n} [{q['type']}] {q['topicKo']} " + (f"(구형 {q['legacy']['id']})" if q.get('legacy') else ''))
    if q.get('caseKo'):
        st = next((x for x in d.get('sets', []) if x['id'] == q['set']['id']), None)
        print(f"  [공통 지문 {q['set']['idx']}/{q['set']['size']}] " + (st['titleKo'] if st else q['set']['id']))
        print(re.sub(r'\n{2,}', '\n', q['caseKo'].strip()))
        print('  ---')
    print(q['stemKo'].strip())
    t = q['type']
    if t == 'multiple_choice':
        ans = set(q.get('answers') or [])
        for c in q['choices']:
            print(f"  {'*' if c['label'] in ans else ' '}({c['label']}) {c.get('ko') or c.get('en')}")
    elif t == 'dropdown':
        for b in q['blanks']:
            print(f"  [{b['id']}] {b.get('labelKo') or b.get('labelEn')}")
            for o in b['options']:
                print(f"     {'*' if o.get('en') == b.get('answer') else ' '}{o.get('ko') or o.get('en')}")
        if q.get('template'): print('  TEMPLATE:', q['template'])
    elif t == 'statements':
        for s in q['statements']:
            print(f"  - {s.get('ko') or s.get('en')} => {s.get('answer')}")
    elif t == 'drag_drop':
        ko = {i['en']: i.get('ko') or i['en'] for i in q['items']}
        print('  ITEMS:', ' | '.join(ko.values()))
        for s in q['slots']:
            print(f"  [{s.get('labelKo') or s.get('labelEn') or s['id']}] => {ko.get(s.get('answer'), s.get('answer'))}")
    elif t == 'answer_reveal':
        print('  ANSWER:', q.get('answerTextKo') or q.get('answerText'))
    print('  EXPL:', re.sub(r'\s+', ' ', q.get('explanationKo') or q.get('explanationEn') or '')[:600])
