"""번역용 다이제스트: 구형 문제은행에서 n 범위의 문항 전문을 출력한다.
usage: python tdigest.py 1 8   (통합번호 n 기준, 1~377)
"""
import json, re, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.normpath(os.path.join(HERE, '..', '..', 'az-800-801-merged', 'az802_legacy_bank.json'))
a, b = int(sys.argv[1]), int(sys.argv[2])
IMG_RE = re.compile(r'!\[[^\]]*\]\((images/[^)]+)\)')
LEARN_RE = re.compile(r'\n*\*\*Learn more:\*\*.*$', re.S)
qs = json.load(open(BANK, encoding='utf-8'))['questions']
for q in qs:
    if q['n'] < a or q['n'] > b: continue
    cnt = [0]
    def sub(m):
        cnt[0] += 1; return f'[[IMG{cnt[0]}]]'
    stem = IMG_RE.sub(sub, q['stemRaw'])
    stem = re.sub(r'[ \t]+\n', '\n', stem)
    print(f"##### n={q['n']} id={q['id']} type={q['type']} area={q['az802Area']} skill={q.get('az802Skill','')}")
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
