#!/usr/bin/env python3
"""Build the maintained QWEEPS technical report (ReportLab + Pillow).

Source: docs/technical-report.md. The supported Markdown subset is deliberately
small: headings, paragraphs, links, emphasis, tables, code, page breaks and the
three named diagram directives below. Run from any working directory.
"""
from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, PageBreak,
    PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
INK = colors.HexColor('#18372f')
GREEN = colors.HexColor('#356a59')
GOLD = colors.HexColor('#bd9145')
MUTED = colors.HexColor('#55685f')
PALE = colors.HexColor('#eff4f1')
LINE = colors.HexColor('#d5dfd9')
WIDTH = A4[0] - 96


def register_fonts(font_dir: Path | None = None):
    candidates = [font_dir] if font_dir else []
    candidates += [Path('/usr/share/fonts/liberation'),
                   Path('/usr/share/fonts/truetype/liberation2'),
                   Path('/usr/share/fonts/truetype/liberation')]
    folder = next((p for p in candidates if (p / 'LiberationSans-Regular.ttf').is_file()), None)
    if folder is None:
        raise SystemExit('Liberation fonts not found. Pass --font-dir with the Liberation TTF directory.')
    for name, file in [('Body', 'LiberationSans-Regular.ttf'),
                       ('Body-Bold', 'LiberationSans-Bold.ttf'),
                       ('Body-Italic', 'LiberationSans-Italic.ttf'),
                       ('Body-BoldItalic', 'LiberationSans-BoldItalic.ttf'),
                       ('Mono', 'LiberationMono-Regular.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(folder / file)))
    pdfmetrics.registerFontFamily('Body', normal='Body', bold='Body-Bold',
                                 italic='Body-Italic', boldItalic='Body-BoldItalic')


def inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r'\[([^]]+)\]\((https?://[^\s)]+)\)',
                  r'<link href="\2" color="#356a59"><u>\1</u></link>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    text = re.sub(r'`([^`]+)`', r'<font name="Mono">\1</font>', text)
    return text


def styles():
    common = dict(fontName='Body', textColor=INK, alignment=TA_LEFT)
    return {
        'body': ParagraphStyle('ReportBody', fontSize=10.2, leading=14.25, spaceAfter=9, **common),
        'cover': ParagraphStyle('Cover', fontName='Body-Bold', textColor=INK,
                                fontSize=36, leading=39, spaceBefore=25, spaceAfter=17),
        'h2': ParagraphStyle('H2Report', fontName='Body-Bold', textColor=INK,
                             fontSize=23, leading=27, spaceBefore=2, spaceAfter=15, keepWithNext=True),
        'h3': ParagraphStyle('H3Report', fontName='Body-Bold', textColor=INK,
                             fontSize=12.2, leading=16, spaceBefore=7, spaceAfter=6, keepWithNext=True),
        'kicker': ParagraphStyle('Kicker', fontName='Body-Bold', textColor=GREEN,
                                 fontSize=9, leading=12, spaceBefore=4, spaceAfter=10, keepWithNext=True),
        'caption': ParagraphStyle('CaptionReport', fontName='Body', textColor=MUTED,
                                  fontSize=8.4, leading=11.4, spaceBefore=5, spaceAfter=11),
        'cell': ParagraphStyle('Cell', fontSize=9.1, leading=12.2, **common),
        'headcell': ParagraphStyle('HeadCell', fontName='Body-Bold', textColor=colors.white,
                                   fontSize=9, leading=12),
        'callout': ParagraphStyle('Callout', fontSize=10, leading=14, **common),
        'code': ParagraphStyle('CodeReport', fontName='Mono', fontSize=8.1, leading=12,
                               textColor=INK, spaceBefore=3, spaceAfter=5),
    }


class Pipeline(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = WIDTH, 170

    def draw(self):
        c = self.canv
        gap = 14
        w = (self.width - gap * 2) / 3
        boxes = [(0, 96, '01 / SOURCE', ['Question or document', 'Resolve source context']),
                 (w + gap, 96, '02 / PLAN', ['Connected reasoning beats', 'Method and visible evidence']),
                 (2 * (w + gap), 96, '03 / DIRECTION', ['SVG / GSAP scene data', 'Selected native Python']),
                 (2 * (w + gap), 15, '04 / VALIDATION', ['Contracts and content', 'Native measured speech']),
                 (w + gap, 15, '05 / FRAME REVIEW', ['Actual SVG + native frames', 'Reject unresolved findings']),
                 (0, 15, '06 / PUBLISH', ['Ready candidate only', 'Explore, ask and practice'])]
        for x, y, title, lines in boxes:
            c.setFillColor(PALE)
            c.setStrokeColor(LINE)
            c.rect(x, y, w, 61, fill=1, stroke=1)
            c.setFillColor(GREEN)
            c.setFont('Body-Bold', 8.8)
            c.drawString(x + 10, y + 44, title)
            c.setFillColor(INK)
            c.setFont('Body', 9)
            for i, line in enumerate(lines):
                c.drawString(x + 10, y + 28 - i * 13, line)
        c.setStrokeColor(GOLD)
        c.setFillColor(GOLD)
        c.setLineWidth(1.4)
        for x, y, direction in [(w + 2, 126, 1), (2 * w + gap + 2, 126, 1),
                                 (w + 12, 45, -1), (2 * w + gap + 12, 45, -1)]:
            end = x + direction * 10
            c.line(x, y, end, y)
            p = c.beginPath()
            p.moveTo(end, y)
            p.lineTo(end - direction * 4, y + 3)
            p.lineTo(end - direction * 4, y - 3)
            p.close()
            c.drawPath(p, fill=1, stroke=0)
        x = 2 * (w + gap) + w / 2
        c.line(x, 94, x, 78)
        p = c.beginPath()
        p.moveTo(x, 77)
        p.lineTo(x - 3, 82)
        p.lineTo(x + 3, 82)
        p.close()
        c.drawPath(p, fill=1, stroke=0)


class Timing(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = WIDTH, 88

    def draw(self):
        c = self.canv
        left, right = 9, self.width - 9
        point = lambda t: left + (t - 15.23) / (34.031 - 15.23) * (right - left)
        y = 48
        c.setFillColor(PALE)
        c.rect(left, y - 5, right - left, 10, fill=1, stroke=0)
        c.setFillColor(GOLD)
        c.rect(left, y - 5, point(18.86) - left, 10, fill=1, stroke=0)
        events = [(15.23, 'BRIDGE', 1, 0), (18.86, 'HANDOFF', -1, -24),
                  (19.44, 'SETUP', 1, 15), (23.42, 'OPERATION', -1, 0),
                  (29.56, 'RESULT', 1, 0), (34.031, 'END', -1, -5)]
        for t, label, side, dx in events:
            x = point(t)
            c.setStrokeColor(GREEN)
            c.line(x, y, x, y + side * 15)
            c.setFillColor(GREEN)
            c.circle(x, y, 3, fill=1, stroke=0)
            c.setFont('Body-Bold', 8)
            anchor = c.drawString if t == 15.23 else (c.drawRightString if label == 'END' else c.drawCentredString)
            anchor(x + dx, y + (30 if side > 0 else -29), label)
            c.setFont('Body', 8)
            anchor(x + dx, y + (19 if side > 0 else -40), f'{t:.2f}s')


class ArchitecturePipeline(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = WIDTH, 142

    def draw(self):
        c = self.canv
        gap = 16
        width = (self.width - gap * 3) / 4
        stages = [
            ('01 / SOURCE', ['Code + sample input', 'Preset / sampled repo']),
            ('02 / COMPILE', ['Graph, ports and beats', 'Deterministic skeleton']),
            ('03 / OPTIONAL AI', ['OpenCode Go text', 'Geometry stays intact']),
            ('04 / INSPECT', ['ELK + packet timeline', 'Nested function views']),
        ]
        for index, (title, lines) in enumerate(stages):
            x = index * (width + gap)
            c.setFillColor(PALE)
            c.setStrokeColor(LINE)
            c.rect(x, 65, width, 66, fill=1, stroke=1)
            c.setFillColor(GREEN)
            c.setFont('Body-Bold', 8)
            c.drawString(x + 7, 113, title)
            c.setFillColor(INK)
            c.setFont('Body', 8.1)
            for row, text in enumerate(lines):
                c.drawString(x + 7, 96 - row * 12, text)
            if index < 3:
                end = x + width + gap - 3
                c.setStrokeColor(GOLD)
                c.setFillColor(GOLD)
                c.line(x + width + 3, 98, end, 98)
                arrow = c.beginPath()
                arrow.moveTo(end, 98)
                arrow.lineTo(end - 4, 101)
                arrow.lineTo(end - 4, 95)
                arrow.close()
                c.drawPath(arrow, fill=1, stroke=0)
        c.setStrokeColor(GOLD)
        c.setDash(3, 3)
        c.rect(0, 5, self.width, 43, fill=0, stroke=1)
        c.setDash()
        c.setFillColor(GREEN)
        c.setFont('Body-Bold', 8.5)
        c.drawString(10, 33, 'PLANNED / VOICE EXPLANATION')
        c.setFillColor(MUTED)
        c.setFont('Body', 9)
        c.drawString(10, 17, 'Synthesis, measured cues and drill-down audio restoration are not integrated.')


class PhaseChart(Flowable):
    def __init__(self):
        super().__init__()
        self.width, self.height = WIDTH, 53

    def draw(self):
        c = self.canv
        values = [81.831, 283.884, 211.116, 10.602]
        shades = [GREEN, INK, GOLD, colors.HexColor('#8ba999')]
        x = 0
        for v, color in zip(values, shades):
            w = self.width * v / sum(values)
            c.setFillColor(color)
            c.rect(x, 25, w, 22, fill=1, stroke=0)
            x += w
        for x, name, color in zip([0, 113, 267, 402], ['Storyboard', 'Layout / artwork', 'Native scene', 'Fitting'], shades):
            c.setFillColor(color)
            c.rect(x, 8, 6, 6, fill=1, stroke=0)
            c.setFillColor(MUTED)
            c.setFont('Body', 8.3)
            c.drawString(x + 10, 8, name)


def build(source: Path, output: Path):
    st = styles()
    lines = source.read_text().splitlines()
    version = re.search(r'TECHNICAL REPORT (\d+\.\d+)', '\n'.join(lines)).group(1)
    report_date = next(line.split(' | ')[0] for line in lines
                       if re.match(r'^\d{1,2} [A-Z][a-z]+ \d{4} \|', line))
    story = []
    i = 0
    widths = None
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line == '---':
            story.append(PageBreak())
        elif line.startswith(':::widths '):
            widths = [float(v) for v in line.split(' ', 1)[1].split(',')]
        elif line == ':::pipeline':
            story.append(Pipeline())
        elif line == ':::architecture-pipeline':
            story.append(ArchitecturePipeline())
        elif line == ':::timing':
            story.append(Timing())
        elif line == ':::phase-chart':
            story.append(PhaseChart())
        elif line.startswith(':::pair '):
            paths = line.split(' ', 1)[1].split('|')
            cell_width = (WIDTH - 12) / 2
            images = []
            for path in paths:
                image = Image(str(ROOT / path))
                ratio = image.imageHeight / image.imageWidth
                image.drawWidth, image.drawHeight = cell_width, cell_width * ratio
                images.append(image)
            table = Table([[images[0], '', images[1]]], colWidths=[cell_width, 12, cell_width])
            table.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0),
                                       ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                                       ('TOPPADDING', (0, 0), (-1, -1), 4),
                                       ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
            story.append(table)
        elif line.startswith('```'):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                block.append(lines[i])
                i += 1
            table = Table([[Preformatted('\n'.join(block), st['code'])]], colWidths=[WIDTH])
            table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), PALE),
                                       ('BOX', (0, 0), (-1, -1), .5, LINE),
                                       ('LEFTPADDING', (0, 0), (-1, -1), 11),
                                       ('TOPPADDING', (0, 0), (-1, -1), 8),
                                       ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
            story.extend([table, Spacer(1, 9)])
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [v.strip() for v in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', v) for v in cells):
                    rows.append([Paragraph(inline(v), st['headcell'] if not rows else st['cell']) for v in cells])
                i += 1
            count = len(rows[0])
            if widths and len(widths) != count:
                raise ValueError('Table column widths do not match its cells')
            weights = widths or [1] * count
            widths = None
            table = Table(rows, colWidths=[WIDTH * v / sum(weights) for v in weights], repeatRows=1, hAlign='LEFT')
            commands = [('BACKGROUND', (0, 0), (-1, 0), INK),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 9),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
                        ('TOPPADDING', (0, 0), (-1, -1), 7),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                        ('LINEBELOW', (0, 0), (-1, 0), .5, INK)]
            for row in range(1, len(rows)):
                commands += [('BACKGROUND', (0, row), (-1, row), PALE if row % 2 else colors.white),
                             ('LINEBELOW', (0, row), (-1, row), .4, LINE)]
            table.setStyle(TableStyle(commands))
            story.extend([table, Spacer(1, 10)])
            continue
        elif line.startswith('#'):
            level = len(line) - len(line.lstrip('#'))
            key = {1: 'cover', 2: 'h2', 3: 'h3', 4: 'kicker'}[level]
            story.append(Paragraph(inline(line[level:].strip()), st[key]))
        elif line.startswith('> '):
            box = Table([[Paragraph(inline(line[2:]), st['callout'])]], colWidths=[WIDTH])
            box.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), PALE),
                                     ('LINEBEFORE', (0, 0), (0, 0), 3, GOLD),
                                     ('LEFTPADDING', (0, 0), (-1, -1), 12),
                                     ('RIGHTPADDING', (0, 0), (-1, -1), 12),
                                     ('TOPPADDING', (0, 0), (-1, -1), 10),
                                     ('BOTTOMPADDING', (0, 0), (-1, -1), 10)]))
            story.extend([box, Spacer(1, 10)])
        else:
            text = [line]
            while i + 1 < len(lines) and lines[i + 1].strip():
                # Authored paragraphs are kept separate by blank lines.
                i += 1
                text.append(lines[i].strip())
            key = 'caption' if line.startswith('*Figure ') else 'body'
            story.append(Paragraph(inline(' '.join(text)), st[key]))
        i += 1

    page_count = [0]

    def decorate(canvas, doc):
        page_count[0] = doc.page
        canvas.saveState()
        canvas.setFillColor(INK)
        canvas.setFont('Body-Bold', 8)
        canvas.drawString(48, A4[1] - 31, 'QWEEPS / TECHNICAL REPORT')
        canvas.setFillColor(MUTED)
        canvas.setFont('Body', 8)
        canvas.drawRightString(A4[0] - 48, A4[1] - 31, report_date.upper())
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.5)
        canvas.line(48, 43, A4[0] - 48, 43)
        canvas.drawString(48, 29, f'Rayven Pahignalo | Version {version} | CC BY-NC 4.0')
        canvas.setFillColor(INK)
        canvas.setFont('Body-Bold', 9)
        canvas.drawRightString(A4[0] - 48, 29, f'{doc.page:02d}')
        canvas.restoreState()

    output.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(output), pagesize=A4, leftMargin=48, rightMargin=48,
                          topMargin=57, bottomMargin=58, title=f'QWEEPS: Live Interactive Visual Teaching - Version {version}',
                          author='Rayven Pahignalo',
                          subject='Architecture preview, planned voice explanation, visual lessons, synchronization and evidence boundaries',
                          creator='QWEEPS maintained technical-report builder',
                          keywords='QWEEPS, visual teaching, architecture walkthrough, code tracing, OpenCode Go, planned narration, ManimGL, Android')
    frame = Frame(48, 58, WIDTH, A4[1] - 115, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id='Report', frames=frame, onPage=decorate))
    doc.build(story)
    expected = source.read_text().splitlines().count('---') + 1
    if page_count[0] != expected:
        raise SystemExit(f'Layout overflow: expected {expected} pages, produced {page_count[0]}; inspect and shorten the overflowing section.')
    print(f'Built {output} ({page_count[0]} pages)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'docs/technical-report.md')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/QWEEPS_Live_Visual_Teaching_Technical_Report.pdf')
    parser.add_argument('--font-dir', type=Path)
    args = parser.parse_args()
    register_fonts(args.font_dir)
    build(args.source, args.output)


if __name__ == '__main__':
    main()
