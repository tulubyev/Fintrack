"""Генератор SVG логотипов и иконок FinTrack. Запуск: python3 -I gen_logos.py <out_dir> <fonts_dir>"""
import os, sys, json
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT, FONTS = sys.argv[1], sys.argv[2]
TOK = json.load(open(os.path.join(OUT, "tokens.json")))
P = TOK["color"]["base"]["petrol"]
N = TOK["color"]["base"]["neutral"]

INK = N["ink"]
PAPER = N["dark-fg"]


def text_path(text, font_file, size, x0, baseline, tracking=0.0):
    """Текст -> SVG path d (y вниз), с кернингом через HarfBuzz. Возвращает (d, width)."""
    blob = hb.Blob.from_file_path(font_file)
    face = hb.Face(blob)
    font = hb.Font(face)
    upem = face.upem
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    tt = TTFont(font_file)
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    scale = size / upem
    pen = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        tp = TransformPen(pen, (scale, 0, 0, -scale, x0 + (x + pos.x_offset) * scale, baseline))
        gs[name].draw(tp)
        x += pos.x_advance + tracking * upem
    width = (x - tracking * upem) * scale
    return pen.getCommands(), width


def cap_height(font_file):
    tt = TTFont(font_file)
    return tt["OS/2"].sCapHeight / tt["head"].unitsPerEm


# ---------- знаки в сетке 48x48 ----------

def rr(x, y, w, h, r, fill):
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r:g}" fill="{fill}"/>'


def mark_kladka(top, base):
    """A «Кладка»: верхний сплошной слой (обзор) поверх двух рядов «кирпичей» (счета в разных банках)."""
    return "".join([
        rr(6, 8, 36, 8, 3, top),
        rr(6, 20, 20, 8, 3, base), rr(30, 20, 12, 8, 3, base),
        rr(6, 32, 10, 8, 3, base), rr(20, 32, 22, 8, 3, base),
    ])


def mark_horizon(top, base):
    """B «Горизонт»: полукруг над линией горизонта и две полосы-отражения, вписанные в общий круг."""
    return "".join([
        f'<path d="M6 24a18 18 0 0 1 36 0z" fill="{top}"/>',
        # полосы — хорды круга r=18 с центром (24,24), у каждой свои скруглённые концы
        rr(7.4, 28, 33.2, 4.5, 2.25, base),
        rr(12.4, 35.5, 23.2, 4.5, 2.25, base),
    ])


def mark_fbal(top, base):
    """C «Ф-баланс»: кириллическая Ф из двух полудисков и стержня — баланс доходов и расходов."""
    return "".join([
        f'<path d="M21 11.5a12.5 12.5 0 0 0 0 25z" fill="{base}"/>',
        f'<path d="M27 11.5a12.5 12.5 0 0 1 0 25z" fill="{top}"/>',
        rr(21.5, 4, 5, 40, 2.5, base),
    ])


def mark_gran(top, base, mid=None):
    """D «Грань» (выбран владельцем): алмаз. Корона — общий обзор, три грани павильона — потоки со всех счетов,
    они сходятся в одну точку. Средняя грань светлее боковых; без mid (одноцветная версия) грани разделяют просветы."""
    mid = mid or base
    return "".join([
        f'<path d="M14 8h20l9 11H5z" fill="{top}"/>',
        f'<path d="M5 21h11.5L24 40z" fill="{base}"/>',
        f'<path d="M18.5 21h11L24 40z" fill="{mid}"/>',
        f'<path d="M31.5 21H43L24 40z" fill="{base}"/>',
    ])


CONCEPTS = {
    "d-gran": (mark_gran, "Грань"),
    "a-kladka": (mark_kladka, "Кладка"),
    "b-gorizont": (mark_horizon, "Горизонт"),
    "c-f-balans": (mark_fbal, "Ф-баланс"),
}

# цвета знака: (верх/акцентная часть, основная часть, цвет слова, средняя грань «Грани»)
CREAM = TOK["color"]["cream"]
THEMES = {
    "light": (P["400"], P["700"], INK, P["500"]),
    "dark": (P["300"], P["100"], PAPER, P["200"]),
    "cream": (CREAM["logo-top"], CREAM["logo-base"], CREAM["foreground"], CREAM["logo-mid"]),
}
# знак, который идёт в иконки, favicon и сплэш
MARK = mark_gran
# для «Горизонта» и «Ф-баланса» яркая часть — верх; для «Кладки» верхний слой подсвечен


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}" viewBox="0 0 {w:g} {h:g}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(content)
    return path


font_bold = os.path.join(FONTS, "Onest-700.ttf")
font_semi = os.path.join(FONTS, "Onest-600.ttf")


def paint(mark_fn, top, base, mid):
    return mark_fn(top, base, mid) if mark_fn is mark_gran else mark_fn(top, base)


def lockup(mark_fn, theme, word):
    top, base, ink, mid = THEMES[theme]
    H = 48
    size = 30  # кегль слова
    ch = cap_height(font_semi) * size
    baseline = 24 + ch / 2
    d, w = text_path(word, font_semi, size, 60, baseline, tracking=-0.01)
    body = f'<g>{paint(mark_fn, top, base, mid)}</g><path d="{d}" fill="{ink}"/>'
    return svg(60 + w + 4, H, body, word)


made = []
for key, (fn, label) in CONCEPTS.items():
    # кремовая тема появилась после выбора знака — её варианты есть только у «Грани»
    for theme in THEMES if fn is mark_gran else ("light", "dark"):
        top, base, _, mid = THEMES[theme]
        made.append(write(f"logos/{key}/mark-{theme}.svg", svg(48, 48, paint(fn, top, base, mid), f"FinTrack — знак «{label}»")))
        made.append(write(f"logos/{key}/logo-{theme}.svg", lockup(fn, theme, "FinTrack")))
    # одноцветная версия (печать, штампы, водяные знаки)
    made.append(write(f"logos/{key}/mark-mono.svg", svg(48, 48, fn("currentColor", "currentColor"), f"FinTrack — знак «{label}», одноцветный")))

# «Кладка» с именем Finwall — сравнение из первой версии
for theme in ("light", "dark"):
    made.append(write(f"logos/a-kladka/logo-finwall-{theme}.svg", lockup(mark_kladka, theme, "Finwall")))

# ---------- favicon: следует системной теме ----------
fav = (f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48">'
       f'<style>.t{{fill:{P["400"]}}}.m{{fill:{P["600"]}}}.b{{fill:{P["800"]}}}.bg{{fill:{N["0"]}}}'
       f'@media (prefers-color-scheme:dark){{.t{{fill:{P["300"]}}}.m{{fill:{P["200"]}}}.b{{fill:{P["100"]}}}.bg{{fill:{N["950"]}}}}}</style>'
       f'<rect class="bg" width="48" height="48" rx="11"/>'
       + MARK("X", "Y", "Z").replace('fill="X"', 'class="t"').replace('fill="Y"', 'class="b"').replace('fill="Z"', 'class="m"')
       + '</svg>\n')
made.append(write("app-icon/favicon.svg", fav))

# ---------- Android adaptive icon 108x108 dp, безопасная зона — круг 66 dp ----------
# «Грань» 38x32 (в сетке 48: x 5..43, y 8..40); масштаб 1.25 -> 47.5 x 40, диагональ 62.1 dp — внутри круга 66 dp
S = 1.25
cx, cy = 54, 54
tx = cx - 24 * S
ty = cy - 24 * S
fg_body = f'<g transform="translate({tx:g} {ty:g}) scale({S:g})">{MARK(P["200"], N["0"], P["100"])}</g>'
made.append(write("app-icon/android/ic_launcher_foreground.svg", svg(108, 108, fg_body, "FinTrack — передний план иконки")))
bg_body = (f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
           f'<stop offset="0" stop-color="{P["600"]}"/><stop offset="1" stop-color="{P["800"]}"/></linearGradient></defs>'
           f'<rect width="108" height="108" fill="url(#g)"/>')
made.append(write("app-icon/android/ic_launcher_background.svg", svg(108, 108, bg_body, "FinTrack — фон иконки")))
# сплошной фон — для app.config (android.adaptiveIcon.backgroundColor), если градиент не нужен
mono_body = f'<g transform="translate({tx:g} {ty:g}) scale({S:g})">{MARK("#000000", "#000000")}</g>'
made.append(write("app-icon/android/ic_launcher_monochrome.svg", svg(108, 108, mono_body, "FinTrack — монохромная иконка (Android 13+)")))
# служебная схема безопасной зоны
guide = (bg_body + fg_body +
         '<circle cx="54" cy="54" r="33" fill="none" stroke="#FF3B30" stroke-width="0.6" stroke-dasharray="2 1.5"/>'
         '<rect x="18" y="18" width="72" height="72" fill="none" stroke="#FFD60A" stroke-width="0.5" stroke-dasharray="1.5 1.5"/>')
made.append(write("app-icon/android/safe-zone-guide.svg", svg(108, 108, guide, "Схема: круг 66 dp — безопасная зона, квадрат 72 dp — видимая область")))
# сплэш: знак на прозрачном фоне, цвет фона задаётся в app.config
splash_body = f'<g transform="translate(16 16) scale(4)">{MARK(P["400"], P["700"], P["500"])}</g>'
made.append(write("app-icon/splash-icon-light.svg", svg(224, 224, splash_body, "FinTrack — сплэш, светлая тема")))
splash_dark = f'<g transform="translate(16 16) scale(4)">{MARK(P["300"], P["100"], P["200"])}</g>'
made.append(write("app-icon/splash-icon-dark.svg", svg(224, 224, splash_dark, "FinTrack — сплэш, тёмная тема")))
# иконка для PWA manifest / apple-touch: полный квадрат с фоном (маскируемая — знак в зоне 80%)
pwa_body = (f'<rect width="512" height="512" fill="{P["700"]}"/>'
            f'<g transform="translate({256 - 24 * 6:g} {256 - 24 * 6:g}) scale(6)">{MARK(P["200"], N["0"], P["100"])}</g>')
made.append(write("app-icon/pwa-maskable-512.svg", svg(512, 512, pwa_body, "FinTrack — иконка PWA (maskable)")))

print("\n".join(os.path.relpath(p, OUT) for p in made))
