"""번역용 다이제스트: sc300.json 에서 원본 번호 범위의 문항 전문을 출력한다.
usage: python tdigest.py 1 10          (questionNumber 기준)
       python tdigest.py 1 10 --todo   (번역 없는 문항만)
"""
import json, re, sys, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'sc-300', 'sc300.json'))
a, b = int(sys.argv[1]), int(sys.argv[2])
todo = '--todo' in sys.argv
IMG_RE = re.compile(r'!\[[^\]]*\]\((images/[^)]+)\)')
LEARN_RE = re.compile(r'\n*\*\*Learn more:\*\*.*$', re.S)
qs = json.load(open(SRC, encoding='utf-8'))['questions']
done = set()
for f in glob.glob(os.path.join(HERE, 'ko', '*.json')):
    done.update(json.load(open(f, encoding='utf-8')).keys())
for q in qs:
    n = q['questionNumber']
    if n < a or n > b: continue
    if todo and str(n) in done: continue
    cnt = [0]
    def sub(m):
        cnt[0] += 1; return f'[[IMG{cnt[0]}]]'
    stem = IMG_RE.sub(sub, q['stemRaw'])
    stem = re.sub(r'[ \t]+\n', '\n', stem)
    print(f"##### n={n} type={q['type']} topic={q['topic']}")
    print(stem.strip())
    t = q['type']
    if t == 'multiple_choice':
        for c in q['choices']: print(f"  ({c['label']}) {c['text']}")
        print("  ANSWER:", q['answers'])
    elif t == 'dropdown':
        if q.get('template'): print("  TEMPLATE:", q['template'].replace('\n', ' ⏎ '))
        for bl in q['blanks']:
            print(f"  [blank id={bl['id']}] label={bl['label']!r} :: " + " | ".join(bl['options']) + f"  => {bl['answer']}")
    elif t == 'statements':
        for s in q['statements']: print(f"  - {s['text']}  => {s['answer']}")
    elif t == 'drag_drop':
        print("  ITEMS: " + " | ".join(q['items']))
        for s in q['slots']: print(f"  [slot id={s['id']}] label={s['label']!r} => {s['answer']}")
    elif t == 'answer_reveal':
        print("  ANSWERTEXT:", IMG_RE.sub('', q.get('answerText') or '').strip())
    ex = LEARN_RE.sub('', q.get('explanation') or '').strip()
    print("  EXPL:", ex)
    print()
