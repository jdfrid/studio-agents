"""Hebrew Word guide for the growth console, styled like the Reelmino user guide.

    python apps/growth/build_connection_guide.py
"""

import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = Path(__file__).resolve().parent / "Reelmino-מדריך-חיבור-חשבונות.docx"
FONT = "Arial"
GREEN = RGBColor(0x17, 0x3D, 0x35)
GREEN2 = RGBColor(0x1F, 0x6B, 0x4F)
GRAY = RGBColor(0x5F, 0x6B, 0x66)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
TIP_FILL = "EAF3EE"
NOTE_FILL = "FFF6E0"
HEAD_FILL = "173D35"
CODE_FILL = "F6F7F2"
LATIN = re.compile(r"[A-Za-z0-9$#@][A-Za-z0-9 .,:/@\-_'&+%$#|]*[A-Za-z0-9%$)]|[A-Za-z0-9$#@%]")

SCHEMA_ORDER = {
    "pPr": "pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs "
    "suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd "
    "snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment "
    "textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange",
    "rPr": "rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid "
    "vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em "
    "lang eastAsianLayout specVanish oMath",
    "sectPr": "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType "
    "pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange",
    "tblPr": "tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing "
    "tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription",
    "tcPr": "cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark",
}
SCHEMA_ORDER = {qn(f"w:{k}"): {qn(f"w:{t}"): i for i, t in enumerate(v.split())} for k, v in SCHEMA_ORDER.items()}


def set_cs_props(rpr, size=None, bold=None, italic=None, color=None, font=FONT):
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        fonts.set(qn(attr), font)
    if bold is not None:
        for tag in ("w:b", "w:bCs"):
            el = rpr.find(qn(tag))
            if el is None:
                el = OxmlElement(tag)
                rpr.append(el)
            el.set(qn("w:val"), "1" if bold else "0")
    if italic is not None:
        for tag in ("w:i", "w:iCs"):
            el = rpr.find(qn(tag))
            if el is None:
                el = OxmlElement(tag)
                rpr.append(el)
            el.set(qn("w:val"), "1" if italic else "0")
    if color is not None:
        el = rpr.find(qn("w:color"))
        if el is None:
            el = OxmlElement("w:color")
            rpr.append(el)
        el.set(qn("w:val"), str(color))
    if size is not None:
        for tag in ("w:sz", "w:szCs"):
            el = rpr.find(qn(tag))
            if el is None:
                el = OxmlElement(tag)
                rpr.append(el)
            el.set(qn("w:val"), str(int(size * 2)))


def set_bidi(paragraph):
    ppr = paragraph._p.get_or_add_pPr()
    if ppr.find(qn("w:bidi")) is None:
        ppr.insert(0, OxmlElement("w:bidi"))


def add_run(paragraph, text, *, bold=False, italic=False, size=None, color=None):
    pos = 0
    pieces = []
    for match in LATIN.finditer(text):
        if match.start() > pos:
            pieces.append((text[pos:match.start()], True))
        pieces.append((match.group(0), False))
        pos = match.end()
    if pos < len(text):
        pieces.append((text[pos:], True))
    for chunk, rtl in pieces:
        run = paragraph.add_run(chunk)
        rpr = run._r.get_or_add_rPr()
        set_cs_props(rpr, size=size, bold=bold, italic=italic, color=color)
        if rtl:
            rpr.append(OxmlElement("w:rtl"))
    return paragraph


def add_rich(paragraph, text, **kw):
    for part in re.split(r"(\*\*[^*]+\*\*)", text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            add_run(paragraph, part[2:-2], bold=True, **{k: v for k, v in kw.items() if k != "bold"})
        else:
            add_run(paragraph, part, **kw)
    return paragraph


def shade(cell, fill):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcpr.append(shd)


def cell_borders(cell, color="D5DCD6"):
    tcpr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), color)
        borders.append(el)
    tcpr.append(borders)


def table_rtl(table):
    table._tbl.tblPr.append(OxmlElement("w:bidiVisual"))


def normalize(root):
    for tag, order in SCHEMA_ORDER.items():
        for el in root.iter(tag):
            children = list(el)
            seen = set()
            unique = []
            for child in children:
                key = child.tag
                if key in seen and key not in (qn("w:headerReference"), qn("w:footerReference")):
                    el.remove(child)
                    continue
                seen.add(key)
                unique.append(child)
            unique.sort(key=lambda c: order.get(c.tag, len(order)))
            for child in unique:
                el.remove(child)
                el.append(child)


doc = Document()
sec = doc.sections[0]
sec.page_height = Cm(29.7)
sec.page_width = Cm(21.0)
sec.left_margin = sec.right_margin = Cm(2.0)
sec.top_margin = Cm(2.0)
sec.bottom_margin = Cm(2.0)
sec._sectPr.append(OxmlElement("w:bidi"))

styles = doc.styles
normal = styles["Normal"]
normal.font.name = FONT
normal.font.size = Pt(11)
set_cs_props(normal.element.get_or_add_rPr(), size=11)
lang = OxmlElement("w:lang")
lang.set(qn("w:val"), "he-IL")
lang.set(qn("w:bidi"), "he-IL")
normal.element.get_or_add_rPr().append(lang)
normal_ppr = normal.element.get_or_add_pPr()
normal_ppr.insert(0, OxmlElement("w:bidi"))
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.15

for name, size, color, before, after in (
    ("Heading 1", 20, "173D35", 6, 10),
    ("Heading 2", 14.5, "1F6B4F", 14, 6),
    ("Heading 3", 12, "173D35", 10, 4),
):
    st = styles[name]
    st.font.name = FONT
    set_cs_props(st.element.get_or_add_rPr(), size=size, bold=True, italic=False, color=color)
    ppr = st.element.get_or_add_pPr()
    ppr.insert(0, OxmlElement("w:bidi"))
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True


def para(text="", *, bold=False, size=None, color=None, align=None, after=None):
    p = doc.add_paragraph()
    set_bidi(p)
    if text:
        add_rich(p, text, bold=bold, size=size, color=color)
    if align is not None:
        p.alignment = align
    if after is not None:
        p.paragraph_format.space_after = Pt(after)
    return p


def h1(text, new_page=True):
    p = doc.add_paragraph(style="Heading 1")
    set_bidi(p)
    p.paragraph_format.page_break_before = new_page
    add_run(p, text, bold=True, size=20, color=GREEN)
    return p


def h2(text):
    p = doc.add_paragraph(style="Heading 2")
    set_bidi(p)
    add_run(p, text, bold=True, size=14.5, color=GREEN2)
    return p


def steps(items):
    for n, item in enumerate(items, start=1):
        p = doc.add_paragraph()
        set_bidi(p)
        p.paragraph_format.left_indent = Cm(0.9)
        p.paragraph_format.first_line_indent = Cm(-0.6)
        p.paragraph_format.space_after = Pt(3)
        add_run(p, f"{n}.  ", bold=True, color=GREEN)
        add_rich(p, item)


def box(title, lines, fill):
    t = doc.add_table(rows=1, cols=1)
    table_rtl(t)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0)
    shade(c, fill)
    cell_borders(c, "C9D9CF" if fill == TIP_FILL else "EED9A8")
    p = c.paragraphs[0]
    set_bidi(p)
    add_run(p, title, bold=True, size=11, color=GREEN)
    p.paragraph_format.space_after = Pt(3)
    for line in lines:
        q = c.add_paragraph()
        set_bidi(q)
        q.paragraph_format.space_after = Pt(2)
        add_rich(q, line, size=10.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def note(*lines):
    box("שימו לב", lines, NOTE_FILL)


def tip(*lines):
    box("טיפ", lines, TIP_FILL)


def table(headers, rows, widths=None):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table_rtl(t)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, header in enumerate(headers):
        c = t.cell(0, i)
        shade(c, HEAD_FILL)
        cell_borders(c, HEAD_FILL)
        p = c.paragraphs[0]
        set_bidi(p)
        add_run(p, header, bold=True, size=10.5, color=WHITE)
    for r, row in enumerate(rows, start=1):
        for i, value in enumerate(row):
            c = t.cell(r, i)
            cell_borders(c)
            if r % 2 == 0:
                shade(c, "F4F7F4")
            p = c.paragraphs[0]
            set_bidi(p)
            p.paragraph_format.space_after = Pt(1)
            add_rich(p, value, size=10.5)
    if widths:
        for row in t.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Cm(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def code(lines):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.cell(0, 0)
    shade(c, CODE_FILL)
    cell_borders(c, "D5DCD6")
    for i, line in enumerate(lines):
        p = c.paragraphs[0] if i == 0 else c.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(1)
        run = p.add_run(line)
        rpr = run._r.get_or_add_rPr()
        set_cs_props(rpr, size=10, font="Consolas", color="173D35")
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


def add_field(paragraph, instr):
    run = paragraph.add_run()
    for kind, text in (("begin", None), (None, instr), ("separate", None), (None, "1"), ("end", None)):
        if kind:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), kind)
            run._r.append(el)
        elif text == instr:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = instr
            run._r.append(el)
        else:
            el = OxmlElement("w:t")
            el.text = text
            run._r.append(el)


# Cover
for _ in range(6):
    para()
para("מדריך חיבור חשבונות", bold=True, size=30, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER, after=6)
para("כלי השיווק האורגני של Reelmino", size=16, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER, after=18)
para("https://growth.reelmino.com", size=14, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER, after=28)
para("פרסום לערוצים שהחשבון מנהל, מכמה מחשבים, בלי תלות במחשב הפיתוח", size=12, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER)
for _ in range(8):
    para()
para("reelmino.com", size=11, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER, after=2)
para("אוקטובר 2026", size=10, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER)

new_sec = doc.add_section(WD_SECTION.NEW_PAGE)
new_sec._sectPr.append(OxmlElement("w:bidi"))
new_sec.header.is_linked_to_previous = False
new_sec.footer.is_linked_to_previous = False
hp = new_sec.header.paragraphs[0]
set_bidi(hp)
hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
add_run(hp, "Reelmino — מדריך חיבור חשבונות", size=9, color=GRAY)
fp = new_sec.footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
add_run(fp, "עמוד ", size=9, color=GRAY)
add_field(fp, "PAGE")

h1("תוכן העניינים", new_page=False)
CHAPTERS = [
    "איפה הכלי רץ",
    "כניסה ואנשים",
    "איפה שמים מפתח",
    "איך נראה חיבור שעבד",
    "כתובות החזרה",
    "YouTube",
    "פייסבוק ואינסטגרם",
    "TikTok",
    "לינקדאין",
    "טלגרם",
    "מה מעלים ידנית",
    "הפצה לקבוצות",
    "אחרי החיבור",
]
for i, name in enumerate(CHAPTERS, start=1):
    p = para(after=4)
    add_run(p, f"{i}.  ", bold=True, size=12, color=GREEN)
    add_run(p, name, size=12)

h1("1. איפה הכלי רץ")
para("הכלי רץ על שרת Reelmino, בכתובת **https://growth.reelmino.com**. הוא נשאר פעיל כשמחשב הפיתוח כבוי. כמה אנשים נכנסים אליו מכל מחשב, וכולם רואים את אותו תוכן, אותם חשבונות ואותו לוח.")
para("הוא מפרסם רק לחשבון אמיתי, ורק למקום שהחשבון מנהל: ערוץ יוטיוב, עמוד פייסבוק, אינסטגרם מקצועי שמקושר לעמוד, פרופיל טיקטוק, פרופיל לינקדאין, או ערוץ טלגרם.")
h2("שני דברים לכל רשת")
steps([
    "**החשבון.** שם הגולשים רואים את הסרטון. פותחים אותו באתר של הרשת, כמו כל משתמש.",
    "**המפתח.** זוג קודים שאפליקציית המפתחים נותנת. מדביקים אותו בשרת. בלי המפתח לכלי אין רשות לפרסם.",
])
para("אחרי שני אלה לוחצים בכלי על **חיבור** ומאשרים את החשבון בדפדפן. המפתח לבד לא מפרסם כלום.")
note("X, וואטסאפ, פינטרסט ו-Threads בלי מפתח ובלי חיבור. מהם רק מייצאים טקסט וקובץ, ומעלים ידנית.")

h1("2. כניסה ואנשים")
para("פותחים **https://growth.reelmino.com**.")
para("הסיסמה הראשונה היא הסיסמה שנכתבה בשרת בשורה **GROWTH_OPERATOR_PASSWORD**. זו סיסמת הכלי, לא סיסמה של גוגל, פייסבוק או של לקוח ב-Reelmino. בכניסה הראשונה אפשר להשאיר את שדה השם ריק.")
note("אחרי הכניסה הראשונה הסיסמה נשמרת במסד על השרת. שינוי השורה בקובץ לא מחליף מפעיל שכבר קיים.")
h2("הוספת אדם")
steps([
    "נכנסים לכרטיסייה **מפעילים**.",
    "כותבים שם, וסיסמה של 8 תווים לפחות.",
    "לוחצים **הוספת מפעיל**.",
])
para("האדם נכנס אחר כך מכל מחשב עם השם והסיסמה שלו. אי אפשר למחוק את המפעיל האחרון.")

h1("3. איפה שמים מפתח")
para("מתחברים לשרת ועורכים את הקובץ:")
code(["~/studio-agents/infra/hetzner/.env"])
para("אחרי כל שינוי בקובץ, מתוך התיקייה studio-agents, מריצים:")
code(["docker compose -f infra/hetzner/docker-compose.yml --env-file infra/hetzner/.env up -d growth"])
para("הכלי קורא את המפתחות רק בהפעלה. הנתונים, הסרטונים והסיסמאות נשמרים בנפח **growth_data** על השרת.")
tip("כתובת הכלי כבר https://growth.reelmino.com. אין צורך במנהרה ואין צורך בכתובת 127.0.0.1.")

h1("4. איך נראה חיבור שעבד")
para("בכרטיסייה **חשבונות**:")
steps([
    "ליד הרשת כתוב **מוגדר**, לא **חסר**.",
    "לוחצים **חיבור**. נפתח האתר של הרשת. מאשרים עם החשבון שלך.",
    "חוזרים לכלי. מופיע שם החשבון, ואחרי **רענון יעדים** מופיעה שורה עם שם הערוץ או העמוד.",
    "העמודה **פעיל** מסומנת. **אוטומטי** נשאר כבוי עד שמחליטים אחרת.",
])
h2("פרסום ראשון")
steps([
    "**תוכן**, ואז **ייבוא ערכת פרומו**, או **פריט ידני** עם כותרת.",
    "מעלים קובץ mp4 אם אין עדיין סרטון.",
    "בוחרים יעד ולוחצים **פרסום עכשיו**.",
    "בכרטיסייה **תוצאות** מופיעים סטטוס, קישור לפוסט, או השגיאה.",
])
para("**אוטומטי** אומר שחריץ בלוח 90 הימים יתפרסם לבד כשמגיע הזמן. בלי הסימון, החריץ מחכה לכפתור **אישור ופרסום**.")

h1("5. כתובות החזרה")
para("רושמים את הכתובות בדיוק, כולל https, ובלי סלאש בסוף. אם כבר רשומות כתובות אחרות למוצר, מוסיפים את אלה לידן ולא מוחקים את הקיימות.")
code([
    "https://growth.reelmino.com/oauth/youtube/callback",
    "https://growth.reelmino.com/oauth/facebook/callback",
    "https://growth.reelmino.com/oauth/instagram/callback",
    "https://growth.reelmino.com/oauth/tiktok/callback",
    "https://growth.reelmino.com/oauth/linkedin/callback",
])

h1("6. YouTube")
para("**החשבון:** נכנסים ל-studio.youtube.com עם גוגל ופותחים ערוץ, אם עוד אין.")
h2("המפתח")
steps([
    "נכנסים ל-console.cloud.google.com ופותחים פרויקט, למשל reelmino-growth.",
    "ב-**APIs & Services**, ואז **Library**, מחפשים YouTube Data API v3 ולוחצים **Enable**.",
    "ב-**OAuth consent screen** בוחרים External, ממלאים שם ומייל, ומוסיפים את המשתמש שלך כ-Test user.",
    "ב-**Credentials** יוצרים **OAuth client ID** מסוג **Web application**.",
    "ב-**Authorized redirect URIs** מדביקים את כתובת היוטיוב מהפרק הקודם.",
    "מעתיקים את המזהה ואת הסוד אל קובץ השרת.",
])
code(["YOUTUBE_CLIENT_ID=המזהה", "YOUTUBE_CLIENT_SECRET=הסוד"])
para("מפעילים מחדש את מיכל growth, נכנסים ל**חשבונות**, ולוחצים **חיבור** ליד youtube. מאשרים את חשבון הגוגל של הערוץ. היעד שמופיע הוא הערוץ.")

h1("7. פייסבוק ואינסטגרם")
para("שתי הרשתות משתמשות באותו מפתח של מטא. בכלי לוחצים **חיבור** פעמיים: פעם לפייסבוק ופעם לאינסטגרם.")
h2("החשבונות")
steps([
    "עמוד פייסבוק שאתה מנהל. לא פרופיל פרטי ולא קבוצה.",
    "אינסטגרם שהוא חשבון מקצועי, עסק או יוצר, ומקושר לאותו עמוד.",
])
h2("המפתח")
steps([
    "נכנסים ל-developers.facebook.com/apps ויוצרים אפליקציה מסוג Business.",
    "מוסיפים את **Facebook Login**.",
    "ב-**Valid OAuth Redirect URIs** מדביקים את שתי הכתובות של פייסבוק ואינסטגרם.",
    "ב-**App settings**, ואז **Basic**, מעתיקים את המזהה ואת הסוד.",
    "כל עוד האפליקציה במצב Development, מוסיפים את המשתמש שלך תחת **App roles**.",
])
code(["META_APP_ID=המזהה", "META_APP_SECRET=הסוד"])
para("מפעילים מחדש. **חיבור** ליד facebook, ואחר כך **חיבור** ליד instagram. בשניהם מאשרים את אותו חשבון פייסבוק ונותנים גישה לעמוד.")
para("יופיעו העמוד והאינסטגרם המקושר. קבוצה שרק הצטרפת אליה לא תופיע. פייסבוק ואינסטגרם מורידים את הווידאו מהכתובת הציבורית, והיא כבר כתובת הכלי, אז אין צורך במנהרה.")
note("פרסום לאנשים מחוץ לתפקידי האפליקציה דורש אישור של מטא. לחשבון שלך, בזמן שהאפליקציה בפיתוח ואתה רשום בה, אפשר לבדוק בלי האישור הזה.")

h1("8. TikTok")
para("**החשבון:** פרופיל טיקטוק שלך.")
para("בשרת כבר מולאים **TIKTOK_CLIENT_KEY** ו-**TIKTOK_CLIENT_SECRET**. אם פותחים אפליקציה חדשה, מעדכנים את שתי השורות ומפעילים מחדש.")
steps([
    "נכנסים ל-developers.tiktok.com לאפליקציה הקיימת.",
    "מוודאים שיש **Login Kit** ו-**Content Posting API**.",
    "ב-Redirect URI מדביקים את כתובת הטיקטוק. לא מוחקים כתובת שכבר רשומה.",
    "לוחצים **חיבור** ליד tiktok.",
])
note("TIKTOK_DIRECT_POST בשרת הוא 0. הסרטון נכנס לטיוטות בחשבון, ומשם מסיימים את הפרסום באפליקציית טיקטוק.")
para("אחרי שטיקטוק מאשרים פרסום ישיר, משנים את השורה ומפעילים מחדש, ואז מחברים את החשבון שוב:")
code(["TIKTOK_DIRECT_POST=1"])

h1("9. לינקדאין")
para("**החשבון:** הפרופיל האישי. זה היעד של ההגדרה הרגילה. עדיין אין מפתח לינקדאין בשרת.")
steps([
    "נכנסים ל-linkedin.com/developers/apps ויוצרים אפליקציה.",
    "מבקשים את המוצר **Share on LinkedIn**. בלי האישור החיבור נכשל.",
    "ב-**Auth**, תחת Redirect URLs, מדביקים את כתובת הלינקדאין.",
    "מעתיקים את המזהה ואת הסוד אל קובץ השרת.",
])
code([
    "LINKEDIN_CLIENT_ID=המזהה",
    "LINKEDIN_CLIENT_SECRET=הסוד",
    "LINKEDIN_SCOPES=openid profile w_member_social",
])
para("מפעילים מחדש ולוחצים **חיבור** ליד linkedin.")

h1("10. טלגרם")
para("אין אפליקציית מפתחים ואין שורות בקובץ.")
steps([
    "בטלגרם פותחים שיחה עם **@BotFather**, שולחים /newbot, ומעתיקים את הטוקן.",
    "יוצרים ערוץ, או משתמשים בערוץ קיים, ומוסיפים את הבוט כמנהל עם הרשאת פרסום.",
    "ב**חשבונות** מדביקים את הטוקן, ובשדה המזהה כותבים @שם-הערוץ.",
    "לוחצים **חיבור טלגרם**.",
])
tip("אם הערוץ לא הופיע, לוחצים רענון יעדים אחרי שהבוט כבר מנהל.")

h1("11. מה מעלים ידנית")
para("בפריט תוכן יש כפתורי **ייצוא** עבור x, whatsapp, pinterest ו-threads. הכפתור מציג את הטקסט וקישור לקובץ. מעלים אותם בעצמך באותה רשת. אין שם מפתח ואין כפתור חיבור.")

h1("12. הפצה לקבוצות")
para("בכרטיסייה **קבוצות** רושמים קבוצות שאתם כבר חברים בהן ויש לכם בהן הרשאת כתיבה. כל פריט תוכן שמתפרסם יוצר משימה אחת לכל קבוצה פעילה. אותו פריט לא נשלח לאותה קבוצה פעמיים.")
table(
    ["רשת", "איך זה יוצא", "מה מדביקים בהוספה"],
    [
        ["טלגרם", "אוטומטי, דרך הבוט המחובר", "@שם-הקבוצה, או המזהה המספרי שלה"],
        ["דיסקורד", "אוטומטי, דרך Webhook", "כתובת ה-Webhook של הערוץ"],
        ["פייסבוק", "העתקה ופתיחת הקבוצה", "https://www.facebook.com/groups/..."],
        ["לינקדאין", "העתקה ופתיחת הקבוצה", "https://www.linkedin.com/groups/..."],
        ["וואטסאפ", "העתקה ופתיחת הקבוצה באפליקציה", "קישור ההזמנה https://chat.whatsapp.com/..."],
        ["Reddit", "טופס פרסום שכבר מולא", "https://www.reddit.com/r/..."],
        ["X קהילות", "העתקה ופתיחת הקהילה", "https://x.com/i/communities/..."],
    ],
    [2.6, 5.4, 7.7],
)
note(
    "פייסבוק, לינקדאין, וואטסאפ, Reddit ו-X לא מאפשרים לתוכנה לפרסם בקבוצה. בפייסבוק זה נסגר באפריל 2024.",
    "כלי שלוחץ במקומכם בחשבון האישי מפר את תנאי השימוש ומסכן את החשבון ואת העמוד. לכן בחמש הרשתות האלה הלחיצה האחרונה היא שלכם.",
)
h2("טלגרם")
steps([
    "מוסיפים את הבוט שכבר מחובר בכלי לקבוצה. בערוץ נוסף הבוט צריך להיות מנהל עם הרשאת פרסום.",
    "ב**קבוצות** בוחרים טלגרם וכותבים @שם-הקבוצה. אם הבוט כבר ראה את הקבוצה, אפשר לבחור אותה מהרשימה.",
    "הכלי בודק שהבוט נמצא בקבוצה ומורשה לכתוב. אם לא, יופיע הסבר במקום הוספה.",
])
tip("בקבוצה פרטית בלי @שם: כותבים בקבוצה הודעה, לוחצים **רענון יעדים** ליד הבוט ב**חשבונות**, והקבוצה תופיע ברשימה.")
h2("דיסקורד")
steps([
    "בשרת הדיסקורד שלכם: הגדרות הערוץ, ואז Integrations, Webhooks, New Webhook.",
    "לוחצים **Copy Webhook URL**.",
    "ב**קבוצות** בוחרים דיסקורד ומדביקים. הכתובת נשמרת מוצפנת ולא מוצגת שוב.",
])
h2("המשימות")
steps([
    "**העתקה ופתיחת הקבוצה**: הטקסט מועתק והקבוצה נפתחת בלשונית חדשה. פותחים פוסט, מדביקים ומצרפים את הסרטון.",
    "בפייסבוק יש גם קישור **שיתוף הפוסט מהעמוד לקבוצה**, בתנאי שהפריט כבר פורסם בעמוד.",
    "חוזרים לכלי ולוחצים **פורסם**. אפשר להדביק את קישור הפוסט. אם הפוסט לא מתאים לקבוצה, לוחצים **דילוג**.",
    "בטלגרם ובדיסקורד לוחצים **שליחה עכשיו**. אם מסמנים **טייס אוטומטי**, הכלי שולח לבד.",
])
table(
    ["הגדרה", "מה היא עושה"],
    [
        ["מרווח בימים", "מינימום ימים בין פרסומים באותה קבוצה. ברירת המחדל 7. הטייס האוטומטי מחכה, וידני מקבל אזהרה"],
        ["מתי ליצור משימה", "אחרי כל פרסום של הפריט, או רק אחרי פרסום ברשת מסוימת. בפייסבוק ברירת המחדל היא אחרי פרסום בעמוד"],
        ["כללי הקבוצה", "תזכורת שמופיעה ליד כל משימה"],
        ["פעילה", "כיבוי עוצר משימות חדשות לקבוצה בלי למחוק אותה"],
        ["משימות לכל הקבוצות", "כפתור בעורך התוכן. יוצר משימות לפריט גם בלי פרסום רגיל"],
        ["לקבוצות", "כפתור ב**תוצאות**, ליד פוסט שכבר פורסם"],
    ],
    [4.2, 11.5],
)
para("הקישור בכל טקסט מסומן **utm_medium=community**, ושם הקבוצה נכתב ב-**utm_term**. כך רואים ב-Google Analytics כמה כניסות הגיעו מכל קבוצה.")

h1("13. אחרי החיבור")
table(
    ["פעולה", "מה קורה"],
    [
        ["ייבוא ערכת פרומו", "18 סרטוני ההסבר, עם טקסט לכל רשת"],
        ["ייבוא לוח 90 יום", "לוח פרסום. בלי אוטומטי הוא רק ממתין לאישור"],
        ["פרסום עכשיו", "שולח את הפריט ליעד שנבחר"],
        ["תזמון מאושר", "שולח בזמן שנבחר, גם אם אוטומטי כבוי"],
        ["אוטומטי על יעד", "חריצי הלוח של אותה רשת יוצאים לבד"],
        ["מפעילים", "מוסיף אדם עם שם וסיסמה לאותו כלי"],
        ["קבוצות", "משימה לכל קבוצה אחרי כל פרסום. טלגרם ודיסקורד נשלחים לבד"],
        ["תוצאות", "קישור, סטטוס, או השגיאה"],
    ],
    [4.2, 11.5],
)
para("כיבוי **פעיל** על יעד עוצר רק אותו. שאר הרשתות ממשיכות.")
h2("סדר עבודה")
steps([
    "כניסה לכתובת הכלי, והוספת שאר האנשים ב**מפעילים**.",
    "יוטיוב וטלגרם.",
    "פייסבוק, ואז אינסטגרם, אחרי שיש עמוד ואינסטגרם מקצועי מקושר.",
    "לינקדאין.",
    "טיקטוק. המפתח כבר בשרת. נשארת כתובת החזרה, והסרטון יישב בטיוטות עד האישור.",
    "פרסום ידני אחד לכל יעד, ובדיקה ב**תוצאות**, לפני שמסמנים אוטומטי.",
])
note("pnpm dev:growth במחשב הפיתוח הוא עותק נפרד. הוא נעצר כשהמחשב כבוי. העבודה השוטפת היא בכתובת שעל השרת.")

normalize(doc.element)
normalize(doc.styles.element)
for section in doc.sections:
    for part in (section.header, section.footer):
        normalize(part._element)

doc.core_properties.title = "Reelmino — מדריך חיבור חשבונות"
doc.core_properties.author = "Reelmino"
doc.core_properties.language = "he-IL"
try:
    doc.save(OUT)
except PermissionError:
    OUT = OUT.with_name(OUT.stem + "-חדש.docx")
    doc.save(OUT)
print(OUT.name.encode("ascii", "backslashreplace").decode())
