"""Bounded, source-backed retrieval for lesson follow-up questions.

Fetch only the lesson's configured public HTTPS sources; private questions and
workspace context are not sent to any search service. Returned text is evidence,
never executable instructions.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import re
import threading
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

_ALLOWED={'intramuros.gov.ph','dapitancity.gov.ph','philhistoricsites.nhcp.gov.ph','ncca.gov.ph','ldr.senate.gov.ph'}
_STOP=set('about after before could did does from have how into jose more rizal that the their them they this what when where which who why will with would you your was were'.split())
_WORD=re.compile(r"[a-z0-9]{3,}")
_CACHE={};_LOCK=threading.Lock();_TTL=1800

class _SourceRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        target=urlsplit(newurl)
        if target.scheme!='https' or target.hostname not in _ALLOWED or target.username or target.password:
            raise URLError('Source redirected outside the approved source set')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

class _Readable(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.blocks=[];self.bits=[];self.active=0;self.blocked=0;self.heading=''
    def handle_starttag(self,tag,attrs):
        tag=tag.lower()
        if tag in {'script','style','nav','footer','header','noscript'}:self.blocked+=1
        if self.blocked:return
        if tag in {'p','h1','h2','h3','h4'}:
            if self.active:self._finish()
            self.active=1;self.bits=[];self.tag=tag
    def handle_endtag(self,tag):
        tag=tag.lower()
        if tag in {'script','style','nav','footer','header','noscript'} and self.blocked:self.blocked-=1;return
        if not self.blocked and self.active and tag in {'p','h1','h2','h3','h4'}:self._finish()
    def handle_data(self,data):
        if self.active and not self.blocked:self.bits.append(data)
    def _finish(self):
        text=' '.join(' '.join(self.bits).split())
        if self.tag.startswith('h') and text:self.heading=text[:140]
        elif len(text)>=55:self.blocks.append((self.heading,text[:1400]))
        self.active=0;self.bits=[]

def _fetch(source):
    url=source.get('url','');parts=urlsplit(url)
    if parts.scheme!='https' or parts.hostname not in _ALLOWED or parts.username or parts.password:return None
    with _LOCK:
        cached=_CACHE.get(url)
        if cached and time.monotonic()-cached[0]<(_TTL if cached[1] is not None else 120):return cached[1]
    try:
        request=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; QWEEPS-Visual/1.0)'})
        with build_opener(_SourceRedirect()).open(request,timeout=6) as response:
            # Do not follow a trusted source to an unapproved destination.
            final=urlsplit(response.geturl())
            if final.scheme!='https' or final.hostname not in _ALLOWED:return None
            if 'html' not in response.headers.get_content_type():return None
            raw=response.read(1_500_001)
            if len(raw)>1_500_000:return None
            html=raw.decode(response.headers.get_content_charset() or 'utf-8',errors='replace')
        parser=_Readable();parser.feed(html)
        value={'title':source.get('title','Source'),'url':url,'blocks':parser.blocks[:250]}
        with _LOCK:_CACHE[url]=(time.monotonic(),value)
        return value
    except (OSError,URLError,ValueError):
        with _LOCK:_CACHE[url]=(time.monotonic(),None)
        return None

def _terms(value):
    result=set()
    for word in _WORD.findall(value.lower()):
        if word in _STOP:continue
        for suffix in ('ation','ments','ment','ing','ed','es','s'):
            if word.endswith(suffix) and len(word)-len(suffix)>=4:word=word[:-len(suffix)];break
        result.add(word)
    if result & {'execut','execution','sentenc','trial','convict'}:result.update({'execut','trial','sentenc','convict','court','rebellion'})
    return result

def gather(question,sources):
    """Rank actual source passages for this question, without sending it online."""
    public=[s for s in sources if urlsplit(s.get('url','')).hostname in _ALLOWED][:5]
    with ThreadPoolExecutor(max_workers=5) as pool:pages=list(pool.map(_fetch,public))
    query=_terms(question);ranked=[]
    for page in filter(None,pages):
        for heading,block in page['blocks']:
            terms=_terms(heading+' '+block);matches=query&terms
            if matches:ranked.append((len(matches),page,heading,block))
    ranked.sort(key=lambda item:item[0],reverse=True)
    items=[];counts={}
    for score,page,heading,block in ranked:
        key=page['url']
        if counts.get(key,0)>=3:continue
        counts[key]=counts.get(key,0)+1
        items.append({'title':page['title'],'url':key,'heading':heading,'excerpt':block[:600]})
        if len(items)>=3:break
    return items
