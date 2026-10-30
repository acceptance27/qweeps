"""AI questions and semantic branches for the live SVG Rizal lesson."""
from .rizal import reply as grounded_reply


def reply(llm, question, context, history, manifest, mode, research=None):
    result=grounded_reply(llm,question,context,history,manifest,mode,research)
    branch=result.pop('nativeBranch',None)
    if branch:
        result['browserBranch']={
            'lessonId':'rizal_live','chapter':branch['chapter'],
            'focus':branch['focus'],'visualReason':branch['visualReason']}
    return result
