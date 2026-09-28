"""
Build the Rider–Waite–Smith (Pamela Colman Smith, 1909/1910) tarot deck assets.

Source: Wikimedia Commons, "Category:Rider-Waite-Smith tarot deck (TaionWC)" — scans of an
early original printing, every file tagged Public domain / PD-old-80-expired. The script
re-checks each file's licence, author and subject category before using it and aborts on any
mismatch, so a changed or re-uploaded file can't slip in silently.

Output (public/tarot/rws/):
  <card-id>.webp     660×1140  (detail / result view)
  <card-id>-sm.webp  264×456   (grids, fans, history thumbnails)
  credits.json       per-card source, author and licence (shown on the 「关于牌组」 panel)
  CREDITS.md         human-readable attribution

Usage:
  python scripts/gen-tarot-rws.py [--cache DIR] [--out public/tarot/rws]
Downloads are cached so re-runs only re-process. Requests carry a descriptive User-Agent and
are rate-limited per the Wikimedia API etiquette.
"""
import argparse
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Wikimedia asks API clients to identify themselves with a contact address:
# set ARCANUM_CONTACT (e.g. your email or repository URL) before running
UA = f"ArcanumTarot/0.1 (self-hosted fortune app; contact {os.environ.get('ARCANUM_CONTACT', 'unset')}) python-urllib"
API = 'https://commons.wikimedia.org/w/api.php'
CATEGORY = 'Category:Rider-Waite-Smith tarot deck (TaionWC)'

FULL = (660, 1140)   # 11:19
SMALL = (264, 456)

SUIT_FILE_PREFIX = {'wands': 'Wands', 'cups': 'Cups', 'swords': 'Swords', 'pentacles': 'Pents'}
SUIT_CATEGORY = {
    'wands': ('Wands', 'Clubs (Minor Arcana)'),
    'cups': ('Cups (Minor Arcana)',),
    'swords': ('Swords (Minor Arcana)',),
    'pentacles': ('Coins (Minor Arcana)', 'Pentacles (Minor Arcana)'),
}
RANK_CATEGORY = {11: 'Pages (Minor Arcana)', 12: 'Knights (Minor Arcana)', 13: 'Queens (Minor Arcana)', 14: 'Kings (Minor Arcana)'}
MAJOR_FILE_NAME = {
    0: 'Fool', 1: 'Magician', 2: 'High Priestess', 3: 'Empress', 4: 'Emperor', 5: 'Hierophant',
    6: 'Lovers', 7: 'Chariot', 8: 'Strength', 9: 'Hermit', 10: 'Wheel of Fortune', 11: 'Justice',
    12: 'Hanged Man', 13: 'Death', 14: 'Temperance', 15: 'Devil', 16: 'Tower', 17: 'Star',
    18: 'Moon', 19: 'Sun', 20: 'Judgement', 21: 'World',
}



MAJOR_CATEGORY_ALIASES = {2: ['Popess'], 5: ['Pope']}

def api(params):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={'User-Agent': UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f'  api retry {attempt + 1}: {e}', file=sys.stderr)
            time.sleep(4 * (attempt + 1))
    raise SystemExit('Commons API unreachable — aborting (no fallback sources are used).')


def download(url, dest, max_seconds=90):
    """Chunked download that gives up on stalled transfers (a slow trickle never trips socket timeouts)."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(6):
        start = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=30) as r, open(dest + '.part', 'wb') as f:
                expected = int(r.headers.get('Content-Length') or 0)
                while True:
                    chunk = r.read(64 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    if time.monotonic() - start > max_seconds:
                        raise TimeoutError(f'transfer exceeded {max_seconds}s')
            got = os.path.getsize(dest + '.part')
            if expected and got != expected:
                raise IOError(f'truncated: {got}/{expected} bytes')
            with Image.open(dest + '.part') as im:
                im.load()  # raises on a truncated / corrupt JPEG
            os.replace(dest + '.part', dest)
            return
        except Exception as e:  # noqa: BLE001
            print(f'  download retry {attempt + 1}: {e}', file=sys.stderr, flush=True)
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f'Failed to download {url}')


def strip_html(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def load_cards():
    """Card ids/numbers exactly as server/engines/tarot.engine.ts builds them."""
    data_dir = os.path.join(ROOT, 'server', 'data', 'tarot')
    cards = []
    for c in json.load(open(os.path.join(data_dir, 'major.json'), encoding='utf-8')):
        n = c['number']
        cards.append({'id': f'major-{n:02d}', 'arcana': 'major', 'number': n, 'nameEn': c['nameEn'], 'nameZh': c['nameZh'],
                      'file': f'File:RWS Tarot {n:02d} {MAJOR_FILE_NAME[n]}.jpg'})
    for suit, prefix in SUIT_FILE_PREFIX.items():
        for c in json.load(open(os.path.join(data_dir, f'{suit}.json'), encoding='utf-8')):
            n = c['number']
            cards.append({'id': f'{suit}-{n:02d}', 'arcana': 'minor', 'suit': suit, 'number': n, 'nameEn': c['nameEn'],
                          'nameZh': c['nameZh'], 'file': f'File:{prefix}{n:02d}.jpg'})
    assert len(cards) == 78, len(cards)
    return cards


def verify(card, page):
    """Return a list of problems with this Commons file for this card."""
    problems = []
    ii = (page.get('imageinfo') or [{}])[0]
    meta = ii.get('extmetadata', {})
    licence = strip_html(meta.get('LicenseShortName', {}).get('value'))
    artist = strip_html(meta.get('Artist', {}).get('value'))
    cats = {c['title'].removeprefix('Category:') for c in page.get('categories', [])}
    if 'Public domain' not in licence:
        problems.append(f'licence is "{licence}"')
    if 'Pamela Colman Smith' not in artist:
        problems.append(f'artist is "{artist}"')
    if CATEGORY.removeprefix('Category:') not in cats:
        problems.append('not in the TaionWC category')
    if card['arcana'] == 'major':
        want = MAJOR_FILE_NAME[card['number']]
        # Commons files II/V under the Marseille names (Popess / Pope) — same cards
        names = [want] + MAJOR_CATEGORY_ALIASES.get(card['number'], [])
        if not any(any(c.startswith(n) for n in names) and 'Major Arcana' in c for c in cats):
            problems.append(f'no "{want} (Major Arcana)" category: {sorted(cats)}')
    else:
        # A few files lack the suit category; the deck category + file name (e.g. File:Wands09.jpg) still identify them
        suit_word = SUIT_FILE_PREFIX[card['suit']]
        if not any(c in cats for c in SUIT_CATEGORY[card['suit']]) and suit_word not in page.get('title', ''):
            problems.append(f'suit category missing: {sorted(cats)}')
        rank = RANK_CATEGORY.get(card['number'])
        if rank and rank not in cats:
            problems.append(f'rank category "{rank}" missing: {sorted(cats)}')
    return problems, {
        'licence': licence,
        'artist': artist,
        'date': strip_html(meta.get('DateTimeOriginal', {}).get('value')),
        'credit': strip_html(meta.get('Credit', {}).get('value')),
        'width': ii.get('width'),
        'height': ii.get('height'),
        'url': ii.get('url', '').split('?')[0],
        # Standard 960px rendition — plenty for the 660×1140 output and much lighter than the originals
        'thumb': (ii.get('thumburl') or ii.get('url', '')).split('?')[0],
    }


def fit(im, size):
    """Cover-crop to the target aspect ratio (the scans are ~0.577, target 0.579 → sub-1% crop)."""
    return ImageOps.fit(im, size, method=Image.LANCZOS, centering=(0.5, 0.5))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'arcanum-tarot-rws-cache'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'tarot', 'rws'))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)

    cards = load_cards()

    # Category must contain exactly the files we map to
    members, cont = set(), {}
    while True:
        d = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': CATEGORY, 'cmtype': 'file', 'cmlimit': '500', **cont})
        members |= {m['title'] for m in d['query']['categorymembers']}
        if 'continue' not in d:
            break
        cont = d['continue']
    missing = [c['file'] for c in cards if c['file'] not in members]
    if missing:
        raise SystemExit(f'Files not found in {CATEGORY}: {missing}')

    # Metadata in batches of 25
    info = {}
    for i in range(0, len(cards), 25):
        batch = cards[i:i + 25]
        d = api({'action': 'query', 'titles': '|'.join(c['file'] for c in batch), 'prop': 'imageinfo|categories',
                 'iiprop': 'url|size|extmetadata', 'iiurlwidth': '960', 'cllimit': '500'})
        for p in d['query']['pages']:
            info[p['title']] = p
        time.sleep(1)

    credits, failures = [], []
    for c in cards:
        page = info.get(c['file'])
        if not page:
            failures.append(f"{c['id']}: no metadata for {c['file']}")
            continue
        problems, meta = verify(c, page)
        if problems:
            failures.append(f"{c['id']} ({c['file']}): " + '; '.join(problems))
            continue
        cached = os.path.join(args.cache, '960-' + c['file'].removeprefix('File:').replace(' ', '_'))
        if not os.path.exists(cached):
            print(f"download {c['file']}", flush=True)
            download(meta['thumb'], cached)
            time.sleep(1.2)
        with Image.open(cached) as im:
            im = im.convert('RGB')
            fit(im, FULL).save(os.path.join(args.out, f"{c['id']}.webp"), 'WEBP', quality=70, method=6)
            fit(im, SMALL).save(os.path.join(args.out, f"{c['id']}-sm.webp"), 'WEBP', quality=78, method=6)
        credits.append({
            'id': c['id'], 'nameEn': c['nameEn'], 'nameZh': c['nameZh'],
            'commonsFile': c['file'],
            'commonsPage': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(c['file'].replace(' ', '_')),
            'artist': 'Pamela Colman Smith', 'licence': meta['licence'], 'date': meta['date'],
            'scanSource': meta['credit'], 'originalSize': [meta['width'], meta['height']],
        })

    if failures:
        print('\n'.join(failures), file=sys.stderr)
        raise SystemExit(f'{len(failures)} card(s) failed verification — nothing overwritten for them.')

    json.dump({
        'deck': 'rws',
        'name': 'Rider–Waite–Smith（1909）',
        'artist': 'Pamela Colman Smith (1878–1951)',
        'licence': 'Public domain',
        'source': f'Wikimedia Commons — {CATEGORY}',
        'cards': credits,
    }, open(os.path.join(args.out, 'credits.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    lines = [
        '# Rider–Waite–Smith 牌组 · 来源与许可',
        '',
        '- 绘者：Pamela Colman Smith（1878–1951），1909 年由 Rider & Son 出版。',
        '- 扫描：Wikimedia Commons「Rider-Waite-Smith tarot deck (TaionWC)」分类，早期原版印刷的扫描（约 1910），'
        '扫描提供者见各文件页面（muzendo.jp）。',
        '- 许可：每个文件在 Commons 上标注为 Public domain（PD-old-80-expired / CC-PD-Mark）。原作在美国（1929 年前出版）'
        '与作者终生 +70 年的地区（2022 年起）均已进入公有领域。',
        '- 未使用 U.S. Games Systems 等后期重新上色或重绘的版本。',
        '- 处理：统一裁切为 11:19，转为 WebP（660×1140 与 264×456），未做其他修改。',
        '- 由 `scripts/gen-tarot-rws.py` 生成，脚本会逐张核对许可、作者与牌名分类。',
        '',
        '| 牌 | Commons 文件 | 许可 |',
        '|---|---|---|',
    ]
    for c in credits:
        lines.append(f"| {c['nameZh']}（{c['nameEn']}） | [{c['commonsFile'].removeprefix('File:')}]({c['commonsPage']}) | {c['licence']} |")
    open(os.path.join(args.out, 'CREDITS.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

    total = sum(os.path.getsize(os.path.join(args.out, f)) for f in os.listdir(args.out))
    print(f'OK: {len(credits)} cards → {args.out} ({total / 1024 / 1024:.2f} MB)')


if __name__ == '__main__':
    main()
