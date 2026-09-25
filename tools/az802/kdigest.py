r"""python tools/kdigest.py 24 52 130 ... — CBT 번호로 한국어 문제 요약 출력 (이론서 확인문제 작성용)"""
import json, re, sys, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, '..', 'data.js'), encoding='utf-8').read()
d = json.loads(src[src.index('{'):src.rindex('}') + 1])
byn = {q['n']: q for q in d['questions']}
for n in [int(a) for a in sys.argv[1:]]:
    q = byn[n]
    print(f"\n##### #{n} [{q['type']}] {q['topicKo']} " + (f"(구형 {q['legacy']['id']})" if q.get('legacy') else ''))
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
