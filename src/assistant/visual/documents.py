"""Local PDF library for source-grounded live teaching. Document text is data."""
from __future__ import annotations
import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
from .plan import PlanError

ID=re.compile(r'^[0-9a-f]{32}$')
def words(text):
    text=re.sub(r'\bmodule[_ -]*(\d+)\b',r'module \1',text.casefold())
    return set(re.findall(r'[a-z0-9]+',text))

class DocumentLibrary:
    def __init__(self,folder=None):
        self.folder=Path(folder or Path.home()/'.local/share/omarchy-assistant/visual-documents')
        self.folder.mkdir(parents=True,exist_ok=True)
    def get(self,doc_id):
        if not isinstance(doc_id,str) or not ID.fullmatch(doc_id):raise PlanError('Invalid document ID')
        try:return json.loads((self.folder/doc_id/'document.json').read_text())
        except FileNotFoundError as exc:raise PlanError('This document is not in the local lesson library.') from exc
    def catalog(self):
        return [{k:d[k] for k in ('id','title','filename','pageCount','aliases')} for p in sorted(self.folder.glob('*/document.json')) for d in [json.loads(p.read_text())]]
    def ingest(self,payload):
        if payload.get('path'):
            path=Path(str(payload['path'])).expanduser()
            if path.suffix.casefold()!='.pdf' or not path.is_file():raise PlanError('Choose an existing PDF file.')
            if path.stat().st_size>25_000_000:raise PlanError('The PDF must be smaller than 25 MB.')
            data=path.read_bytes();name=path.name
        else:
            name=Path(str(payload.get('filename','document.pdf'))).name
            try:data=base64.b64decode(payload.get('base64',''),validate=True)
            except (ValueError,TypeError) as exc:raise PlanError('Invalid PDF upload') from exc
        if not data.startswith(b'%PDF-') or not 10<len(data)<=25_000_000:raise PlanError('Upload a PDF smaller than 25 MB.')
        if not shutil.which('pdftotext'):raise PlanError('PDF reading requires Poppler (pdftotext).')
        key=hashlib.sha256(data).hexdigest()[:32];folder=self.folder/key;folder.mkdir(exist_ok=True)
        target=folder/'source.pdf';target.write_bytes(data)
        try:
            proc=subprocess.run(['pdftotext','-layout','-enc','UTF-8',str(target),'-'],capture_output=True,text=True,timeout=25)
            if proc.returncode:raise PlanError('The PDF could not be read. Check whether it is encrypted.')
            pages=proc.stdout.split('\f');pages=pages[:-1] if pages and not pages[-1].strip() else pages
            if not 1<=len(pages)<=200 or len(proc.stdout)>1_000_000:raise PlanError('Use a PDF of at most 200 pages / one million extracted characters.')
            if sum(len(p.strip()) for p in pages)<100:raise PlanError('This PDF needs OCR; it has too little extractable text.')
            title=name.removesuffix('.pdf').replace('_',' ')
            if shutil.which('pdfinfo'):
                info=subprocess.run(['pdfinfo',str(target)],capture_output=True,text=True,timeout=10).stdout
                match=re.search(r'^Title:\s+(.+)',info,re.M)
                if match:title=match[1].strip()
        except subprocess.TimeoutExpired as exc:raise PlanError('PDF extraction timed out.') from exc
        aliases=[title,name.removesuffix('.pdf').replace('_',' ')]
        module=re.search(r'\bmodule[\s_-]*(\d+)\b',name+' '+title,re.I)
        if module:aliases.append('Module '+module[1])
        out={'id':key,'title':title[:300],'filename':name,'pageCount':len(pages),'aliases':list(dict.fromkeys(aliases)),
             'pages':[{'page':i+1,'text':page.strip()} for i,page in enumerate(pages)]}
        (folder/'document.json').write_text(json.dumps(out,ensure_ascii=False));return {k:out[k] for k in ('id','title','filename','pageCount','aliases')}
    def resolve(self,question,doc_id=None):
        if doc_id:return self.get(doc_id)
        path=re.search(r'(/[^\n]*?\.pdf)(?=$|[\s\"\'])',question,re.I)
        if path and Path(path[1]).is_file():return self.get(self.ingest({'path':path[1]})['id'])
        matched=[];query=words(question)
        for meta in self.catalog():
            if any(words(alias)<=query for alias in meta['aliases'] if words(alias)):matched.append(meta)
        if len(matched)>1:raise PlanError('More than one document matches. Select the PDF in the lesson window.')
        if matched:return self.get(matched[0]['id'])
        if re.search(r'\bmodule\s*\d+\b',question,re.I):raise PlanError('Attach or import that module PDF first; QWEEPS will not invent its contents.')
        return None
    def evidence(self,document,question,preferred=(),limit=7):
        if not document:return []
        query=words(question)
        ranked=sorted(document['pages'],key=lambda p:len(query&words(p['text']))+(.25 if p['page'] in preferred else 0),reverse=True)
        return [{'page':p['page'],'text':p['text'][:6500]} for p in ranked[:limit]]
