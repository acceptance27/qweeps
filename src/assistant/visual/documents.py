"""Local PDF library for source-grounded live teaching. Document text is data."""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from .plan import PlanError

ID=re.compile(r'^[0-9a-f]{32}$')

def extract_docx_sections(data: bytes) -> list[str]:
    """Read Word paragraphs/tables without running Word or guessing physical pages."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info = archive.getinfo('word/document.xml')
            if info.file_size > 10_000_000:
                raise PlanError('This Word document contains too much text. Use a smaller reviewer.')
            root = ET.fromstring(archive.read(info))
        ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        paragraphs = []
        for paragraph in root.iter(ns + 'p'):
            parts = []
            for node in paragraph.iter():
                if node.tag == ns + 't': parts.append(node.text or '')
                elif node.tag in {ns + 'br', ns + 'cr'}: parts.append('\n')
                elif node.tag == ns + 'tab': parts.append('\t')
            text = ''.join(parts).strip()
            if text: paragraphs.append(text)
        sections, block, size = [], [], 0
        for paragraph in paragraphs:
            if block and size + len(paragraph) > 6000:
                sections.append('\n'.join(block)); block, size = [], 0
            block.append(paragraph); size += len(paragraph)
        if block: sections.append('\n'.join(block))
        if not sections:
            raise PlanError('This Word document has no readable text. Images need OCR first.')
        return sections
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
        raise PlanError('Upload a valid Word .docx document.') from exc
def words(text):
    text=re.sub(r'\b(module|chapter)[_ -]*(\d+)\b',r'\1 \2',text.casefold())
    return set(re.findall(r'[a-z0-9]+',text))

def extract_pptx_slides(data_or_path: bytes | Path) -> list[str]:
    """Pure-python slide text extractor for PPTX presentations."""
    source = io.BytesIO(data_or_path) if isinstance(data_or_path, (bytes, bytearray)) else data_or_path
    try:
        with zipfile.ZipFile(source) as z:
            slide_names = [n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')]
            slide_names.sort(key=lambda x: int(''.join(filter(str.isdigit, x)) or 0))
            slides = []
            for s in slide_names:
                try:
                    tree = ET.fromstring(z.read(s))
                    texts = [elem.text for elem in tree.iter() if elem.tag.endswith('}t') and elem.text]
                    cleaned = ' '.join(texts).strip()
                    slides.append(cleaned if cleaned else f"Slide {len(slides) + 1}")
                except Exception:
                    slides.append(f"Slide {len(slides) + 1}")
            return slides if slides else ["Slide 1"]
    except Exception:
        return []

class DocumentLibrary:
    def __init__(self,folder=None):
        default_folder = (
            Path.home() / '.local/share/qweeps/visual-documents'
            if (Path.home() / '.local/share/qweeps/visual-documents').is_dir() or not (Path.home() / '.local/share/omarchy-assistant/visual-documents').is_dir()
            else Path.home() / '.local/share/omarchy-assistant/visual-documents'
        )
        self.folder=Path(folder or default_folder)
        self.folder.mkdir(parents=True,exist_ok=True)
    def get(self,doc_id):
        if not isinstance(doc_id,str) or not ID.fullmatch(doc_id):raise PlanError('Invalid document ID')
        try:return json.loads((self.folder/doc_id/'document.json').read_text())
        except FileNotFoundError as exc:raise PlanError('This document is not in the local lesson library.') from exc
    def catalog(self):
        return [{**{k:d[k] for k in ('id','title','filename','pageCount','aliases')}, 'pageLabel': d.get('pageLabel', 'pages')} for p in sorted(self.folder.glob('*/document.json')) for d in [json.loads(p.read_text())] if not d.get('isComposite')]
    def combine(self, doc_ids: list[str]) -> dict:
        """Combine multiple documents into a unified, source-attributed composite document."""
        if not doc_ids:
            raise PlanError('No documents provided to combine.')
        # Clean and deduplicate IDs preserving order
        unique_ids = [i.strip() for i in doc_ids if isinstance(i, str) and ID.fullmatch(i.strip())]
        unique_ids = list(dict.fromkeys(unique_ids))
        if not unique_ids:
            raise PlanError('No valid document IDs provided.')
        if len(unique_ids) == 1:
            return self.get(unique_ids[0])

        docs = [self.get(did) for did in unique_ids]
        source_fingerprints = {d['id']: hashlib.sha256(json.dumps(d.get('pages', []), sort_keys=True, ensure_ascii=False).encode()).hexdigest() for d in docs}
        combined_key = hashlib.sha256(",".join(sorted(unique_ids)).encode()).hexdigest()[:32]
        folder = self.folder / combined_key
        target = folder / 'document.json'
        if target.is_file():
            try:
                cached = json.loads(target.read_text())
                if cached.get('sourceFingerprints') == source_fingerprints:
                    return cached
            except Exception:
                pass

        titles = [d.get('title') or d.get('filename') or 'Document' for d in docs]
        combined_title = " + ".join(titles)[:300]
        combined_filename = ", ".join([d.get('filename') or 'doc.pdf' for d in docs])[:300]

        all_pages = []
        seq_page = 1
        for d in docs:
            d_title = d.get('title') or d.get('filename') or 'Source Document'
            d_id = d.get('id')
            for p in d.get('pages', []):
                orig_page = p.get('page', 1)
                orig_text = p.get('text', '')
                all_pages.append({
                    'page': seq_page,
                    'text': f"[{d_title} · Page {orig_page}]\n{orig_text}",
                    'sourceDoc': d_title,
                    'sourceDocId': d_id,
                    'sourcePage': orig_page,
                    **({'sourceLocator': p['label']} if p.get('label') else {}),
                })
                seq_page += 1

        all_aliases = []
        for d in docs:
            all_aliases.extend(d.get('aliases', []))
        all_aliases.append(combined_title)

        composite = {
            'id': combined_key,
            'title': combined_title,
            'filename': combined_filename,
            'pageCount': len(all_pages),
            'aliases': list(dict.fromkeys(all_aliases)),
            'documents': [{'id': d['id'], 'title': d.get('title'), 'filename': d.get('filename'), 'pageCount': d.get('pageCount', 0)} for d in docs],
            'pages': all_pages,
            'isComposite': True,
            'sourceFingerprints': source_fingerprints,
        }
        folder.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(composite, ensure_ascii=False))
        return composite

    def ingest(self,payload):
        if isinstance(payload, dict) and isinstance(payload.get('files'), list):
            results = [self.ingest(item) for item in payload['files'] if isinstance(item, dict)]
            if not results:
                raise PlanError('No files were provided to ingest.')
            return {'documents': results, 'count': len(results)}
        data = b''
        name = ''
        if payload.get('path'):
            path = Path(str(payload['path'])).expanduser()
            if not path.is_file():
                raise PlanError('Choose an existing document file.')
            name = path.name
            if path.stat().st_size > 100_000_000:
                raise PlanError('The file must be smaller than 100 MB.')
            data = path.read_bytes()
        else:
            name = Path(str(payload.get('filename', 'document.pdf'))).name
            try:
                data = base64.b64decode(payload.get('base64', ''), validate=True)
            except (ValueError, TypeError) as exc:
                raise PlanError('Invalid document upload data') from exc

        if not (10 < len(data) <= 100_000_000):
            raise PlanError('Upload a file smaller than 100 MB.')

        is_pdf = data.startswith(b'%PDF-')
        is_docx = name.casefold().endswith('.docx')
        is_pptx = not is_docx and (data.startswith(b'PK\x03\x04') or name.casefold().endswith(('.pptx', '.ppt')))

        if not is_pdf and not is_pptx and not is_docx:
            raise PlanError('Upload a valid PDF, Word document (.docx), or PowerPoint presentation (.pptx).')

        key = hashlib.sha256(data).hexdigest()[:32]
        folder = self.folder / key
        folder.mkdir(exist_ok=True)

        pages: list[str] = []
        title = Path(name).stem.replace('_', ' ')

        if is_docx:
            pages = extract_docx_sections(data)
            (folder / 'source.docx').write_bytes(data)
        elif is_pptx:
            pptx_target = folder / 'source.pptx'
            pptx_target.write_bytes(data)
            pdf_target = folder / 'source.pdf'

            # Try soffice conversion if available
            if shutil.which('soffice') and (not pdf_target.is_file() or pdf_target.stat().st_mtime < pptx_target.stat().st_mtime):
                try:
                    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', str(folder), str(pptx_target)], check=True, timeout=60)
                except Exception:
                    pass

            # Extract slides using pure-python ZIP+XML reader
            raw_slides = extract_pptx_slides(data)
            if raw_slides:
                pages = [s for s in raw_slides if s.strip()]

            # Fallback to PDF extraction if soffice converted it
            if not pages and pdf_target.is_file():
                if shutil.which('pdftotext'):
                    try:
                        proc = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', str(pdf_target), '-'], capture_output=True, text=True, timeout=25)
                        if proc.returncode == 0:
                            p_list = proc.stdout.split('\f')
                            pages = [p.strip() for p in (p_list[:-1] if p_list and not p_list[-1].strip() else p_list) if p.strip()]
                    except Exception:
                        pass

            if not pages:
                pages = [f"Slide 1 from {name}"]

            # Ensure a valid PDF exists at source.pdf for file download/preview endpoints
            if not pdf_target.is_file():
                pdf_target.write_bytes(b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n')
        else:
            target = folder / 'source.pdf'
            target.write_bytes(data)
            if os.environ.get('QWEEPS_PLATFORM') == 'android':
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(target)
                    if reader.is_encrypted and not reader.decrypt(''):
                        raise PlanError('This PDF is encrypted. Export an unlocked copy first.')
                    if not 1 <= len(reader.pages) <= 200:
                        raise PlanError('Use a PDF of at most 200 pages.')
                    pages = []
                    length = 0
                    for page in reader.pages:
                        text = page.extract_text() or ''
                        length += len(text)
                        if length > 1_000_000:
                            raise PlanError('Use a PDF of at most one million extracted characters.')
                        pages.append(text)
                    title = str((reader.metadata or {}).get('/Title') or name.removesuffix('.pdf').replace('_', ' '))
                except PlanError:
                    raise
                except Exception as exc:
                    raise PlanError('The PDF could not be read. Check whether it is encrypted or damaged.') from exc
                if sum(len(page.strip()) for page in pages) < 20:
                    raise PlanError('This PDF needs OCR; it has too little extractable text.')
            else:
                if not shutil.which('pdftotext'):
                    raise PlanError('PDF reading requires Poppler (pdftotext).')
                try:
                    proc = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', str(target), '-'], capture_output=True, text=True, timeout=25)
                    if proc.returncode:
                        raise PlanError('The PDF could not be read. Check whether it is encrypted.')
                    pages = proc.stdout.split('\f')
                    pages = pages[:-1] if pages and not pages[-1].strip() else pages
                    if not 1 <= len(pages) <= 200 or len(proc.stdout) > 1_000_000:
                        raise PlanError('Use a PDF of at most 200 pages / one million extracted characters.')
                    if sum(len(p.strip()) for p in pages) < 20:
                        raise PlanError('This PDF needs OCR; it has too little extractable text.')
                    title = name.removesuffix('.pdf').replace('_', ' ')
                    if shutil.which('pdfinfo'):
                        info = subprocess.run(['pdfinfo', str(target)], capture_output=True, text=True, timeout=10).stdout
                        match = re.search(r'^Title:\s+(.+)', info, re.M)
                        if match:
                            title = match[1].strip()
                except subprocess.TimeoutExpired as exc:
                    raise PlanError('PDF extraction timed out.') from exc

        aliases = [title, name.removesuffix('.pdf').removesuffix('.pptx').removesuffix('.ppt').replace('_', ' ')]
        module = re.search(r'\bmodule[\s_-]*(\d+)\b', name + ' ' + title, re.I)
        if module:
            aliases.append('Module ' + module[1])
        chapter = re.search(r'\bchapter[\s_-]*(\d+)\b', name + ' ' + title, re.I)
        if chapter:
            aliases.append('Chapter ' + chapter[1])

        out = {
            'id': key,
            'title': title[:300],
            'filename': name,
            'pageCount': len(pages),
            'aliases': list(dict.fromkeys(aliases)),
            'pageLabel': 'sections' if is_docx else 'pages',
            'pages': [{'page': i + 1, 'text': page.strip(), **({'label': f'Section {i + 1}'} if is_docx else {})} for i, page in enumerate(pages)]
        }
        (folder / 'document.json').write_text(json.dumps(out, ensure_ascii=False))
        return {k: out[k] for k in ('id', 'title', 'filename', 'pageCount', 'aliases', 'pageLabel')}
    def resolve(self,question,doc_id=None):
        if doc_id:
            if isinstance(doc_id, list):
                return self.combine(doc_id)
            if isinstance(doc_id, str):
                if ',' in doc_id:
                    ids = [p.strip() for p in doc_id.split(',') if p.strip()]
                    return self.combine(ids)
                return self.get(doc_id)
        if not question:return None
        # Match quoted or unquoted absolute or home file paths
        path_matches = re.findall(r'''(?:^|[\s\'\":])(/[^\n\'\"]*?\.(?:pdf|pptx|docx))''', question, re.I)
        valid_paths = [Path(p.strip()) for p in path_matches if Path(p.strip()).is_file()]
        if len(valid_paths) > 1:
            ids = [self.ingest({'path': str(p)})['id'] for p in valid_paths]
            return self.combine(ids)
        elif len(valid_paths) == 1:
            return self.get(self.ingest({'path': str(valid_paths[0])})['id'])

        # Match by registered document filename
        fname_matches = []
        for meta in self.catalog():
            fname = meta.get('filename') or ''
            if fname and fname.lower() in question.lower():
                fname_matches.append(meta['id'])
        if len(fname_matches) > 1:
            return self.combine(fname_matches)
        elif len(fname_matches) == 1:
            return self.get(fname_matches[0])

        matched=[];query=words(question)
        for meta in self.catalog():
            if any(words(alias)<=query for alias in meta['aliases'] if words(alias)):matched.append(meta)
        if len(matched)>1:
            matched_aliases = {tuple(sorted(words(a))) for m in matched for a in m.get('aliases', []) if words(a) and words(a) <= query}
            if len(matched_aliases) > 1:
                return self.combine([m['id'] for m in matched])
            raise PlanError('More than one document matches. Select the PDF in the lesson window.')
        if matched:return self.get(matched[0]['id'])
        if re.search(r'\bmodule\s*\d+\b',question,re.I):raise PlanError('Attach or import that module PDF first; QWEEPS will not invent its contents.')
        return None
    def evidence(self,document,question,preferred=(),limit=7):
        if not document:return []
        query=words(question)
        ranked=sorted(document['pages'],key=lambda p:len(query&words(p['text']))+(.25 if p['page'] in preferred else 0),reverse=True)
        return [{'page':p['page'],'text':p['text'][:6500],'sourceDocId':p.get('sourceDocId',document['id']),'sourcePage':p.get('sourcePage',p['page']),'sourceDoc':p.get('sourceDoc',document.get('title',''))} for p in ranked[:limit]]
