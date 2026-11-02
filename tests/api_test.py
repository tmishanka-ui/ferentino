import json, os, sys, threading, urllib.request, urllib.parse, urllib.error, http.cookiejar, hashlib, time
BASE=os.environ.get('BASE','http://localhost:3110')
ok_n=fail_n=0
def check(name,cond,extra=''):
    global ok_n,fail_n
    if cond: ok_n+=1; print('PASS',name,extra)
    else: fail_n+=1; print('FAIL',name,extra)
class Client:
    def __init__(self): self.jar=http.cookiejar.CookieJar(); self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def req(self,method,path,body=None,headers=None,raw=False,csrf=True):
        h=dict(headers or {})
        if method!='GET' and csrf: h['X-FIT-Request']='1'
        data=None
        if body is not None:
            if isinstance(body,(bytes,bytearray)): data=bytes(body)
            elif isinstance(body,str): data=body.encode('utf-8'); h.setdefault('Content-Type','text/plain; charset=utf-8')
            else: data=json.dumps(body).encode(); h['Content-Type']='application/json'
        r=urllib.request.Request(BASE+path,data=data,method=method,headers=h)
        try: resp=self.op.open(r); code=resp.status; b=resp.read(); hd=resp.headers
        except urllib.error.HTTPError as e: code=e.code; b=e.read(); hd=e.headers
        if raw: return code,b,hd
        try: j=json.loads(b.decode('utf-8')) if b else {}
        except Exception: j={'_text':b.decode('utf-8','replace')}
        return code,j,hd
A=Client(); ADMIN='admin@ferentino.test'; PW='Start123pw'
# ---------- sign-in rules ----------
c,j,_=A.req('POST','/api/login',{'email':ADMIN,'password':'x'},csrf=False); check('state-changing call without the custom header is refused',c==400)
c,j,_=A.req('POST','/api/login',{'email':'nobody@x.com','password':'Whatever12'}); check('unknown e-mail: same wrong e-mail or password',c==401 and 'Wrong e-mail or password' in j['error'])
c,j,_=A.req('GET','/api/data/fitl_dc'); check('records need a sign-in',c==401)
c,j,_=A.req('POST','/api/login',{'email':ADMIN,'password':PW}); check('administrator signs in',c==200 and j['user']['mustChange']==True and j['user']['role']=='admin')
c,j,_=A.req('GET','/api/me'); check('/api/me knows the person and the data store',c==200 and j['user']['email']==ADMIN and j['data']==True and j['server']==True)
c,j,_=A.req('POST','/api/sign',{'purpose':'Revise','ref':'FIT/Q/QM-01','contentHash':'abc','password':PW}); check('cannot sign with a temporary password',c==403)
c,j,_=A.req('POST','/api/password',{'current':PW,'next':'short'}); check('password rule: too short',c==400 and '8 characters' in j['error'])
c,j,_=A.req('POST','/api/password',{'current':PW,'next':'onlyletters'}); check('password rule: needs a number',c==400)
c,j,_=A.req('POST','/api/password',{'current':'Wrong1234','next':'Better5678'}); check('wrong current password refused',c==401)
PW2='Better5678'
c,j,_=A.req('POST','/api/password',{'current':PW,'next':PW2}); check('password changed',c==200)
c,j,_=A.req('GET','/api/me'); check('no longer has to change it',j['user']['mustChange']==False)
# ---------- people ----------
c,j,_=A.req('POST','/api/users',{'email':'mgr1@ferentino.test','name':'Nimal Perera','designation':'QA Manager','department':'Quality','role':'manager'}); check('add a person',c==200 and len(j['tempPassword'])==12,j.get('tempPassword'))
TEMP=j['tempPassword']; UID=j['user']['id']
c,j,_=A.req('POST','/api/users',{'email':'mgr1@ferentino.test','name':'Dup','role':'manager'}); check('duplicate e-mail refused',c==409)
c,j,_=A.req('POST','/api/users',{'email':'bad','name':'x','role':'manager'}); check('invalid e-mail refused',c==400)
c,j,_=A.req('POST','/api/users',{'email':'e@x.com','name':'x','role':'boss'}); check('unknown role refused',c==400)
c,j,_=A.req('GET','/api/users'); check('list people',c==200 and len(j['users'])==2)
B=Client(); c,j,_=B.req('POST','/api/login',{'email':'mgr1@ferentino.test','password':TEMP}); check('new person signs in with the temporary password',c==200 and j['user']['mustChange'])
c,j,_=B.req('GET','/api/users'); check('a manager cannot list people',c==403)
c,j,_=B.req('POST','/api/password',{'current':TEMP,'next':'Manager2026'}); check('manager changes the password',c==200)
c,j,_=B.req('POST','/api/sign',{'purpose':'Approve revision','ref':'FIT/Q/QM-01 rev 01','contentHash':'f'*64,'password':'Wrongpass1'}); check('signing with a wrong password refused',c==401)
c,j,_=B.req('POST','/api/sign',{'purpose':'Approve revision','ref':'FIT/Q/QM-01 rev 01','contentHash':'f'*64,'password':'Manager2026'}); check('electronic signature recorded',c==200 and j['signature']['name']=='Nimal Perera' and j['signature']['contentHash']=='f'*64)
SID=j['signature']['id']
c,j,_=A.req('GET','/api/signatures?ref='+urllib.parse.quote('FIT/Q/QM-01 rev 01')); check('signatures found by reference',c==200 and len(j['signatures'])==1)
c,j,_=A.req('GET','/api/signatures/%d'%SID); check('signature fetched by number',c==200 and j['signature']['id']==SID)
c,j,_=A.req('PUT','/api/users/%d'%UID,{'role':'executive','designation':'Quality Executive'}); check('edit a person',c==200 and j['user']['role']=='executive')
c,j,_=A.req('PUT','/api/users/1',{'active':False}); check('the last administrator cannot be switched off',c==400 and 'administrator' in j['error'])
c,j,_=A.req('POST','/api/users/%d/reset'%UID); check('one-time reset code issued',c==200 and len(j['code'])==8,j.get('code')); CODE=j['code']
C=Client(); c,j,_=C.req('POST','/api/reset',{'email':'mgr1@ferentino.test','code':CODE.lower(),'next':'Reset12345'}); check('reset code sets a new password',c==200)
c,j,_=C.req('POST','/api/reset',{'email':'mgr1@ferentino.test','code':CODE,'next':'Reset12345x'}); check('a reset code works only once',c==400)
c,j,_=B.req('GET','/api/me'); check('old sessions were ended by the reset',j['user'] is None)
c,j,_=C.req('POST','/api/login',{'email':'mgr1@ferentino.test','password':'Reset12345'}); check('signs in with the reset password',c==200)
c,j,_=A.req('POST','/api/users/%d/temp'%UID); check('administrator sets a temporary password',c==200 and len(j['tempPassword'])==12)
c,j,_=Client().req('POST','/api/forgot',{'email':'mgr1@ferentino.test'}); check('forgot: answer names the administrator',c==200 and j['adminEmail']==ADMIN)
c,j,_=Client().req('POST','/api/forgot',{'email':'ghost@x.com'}); check('forgot: same answer for an unknown address',c==200 and j['ok'])
# ---------- lock-out ----------
c,j,_=A.req('POST','/api/users',{'email':'lock@ferentino.test','name':'Lock Test','role':'manager'}); LT=j['tempPassword']
L=Client(); codes=[L.req('POST','/api/login',{'email':'lock@ferentino.test','password':'Wrong12345'})[0] for _ in range(5)]
check('five wrong passwords lock the account',codes==[401,401,401,401,423],str(codes))
c,j,_=L.req('POST','/api/login',{'email':'lock@ferentino.test','password':LT}); check('even the right password is refused while locked',c==423 and 'locked' in j['error'])
c,j,_=A.req('GET','/api/audit-log'); check('audit log records it',c==200 and any(x['action']=='locked' for x in j['log']))
# ---------- the records of every page ----------
K='fitl_dc'; V1=json.dumps({'docs':[{'no':'FIT/Q/QM-01','title':'Quality Manual — පරීක්ෂා ✓'}]},ensure_ascii=False)
c,j,_=A.req('PUT','/api/data/'+urllib.parse.quote(K,safe=''),V1); check('first save creates version 1',c==200 and j['version']==1)
c,b,h=A.req('GET','/api/data/'+K,raw=True); check('value comes back unchanged, with its version',c==200 and b.decode('utf-8')==V1 and h['X-Version']=='1')
c,j,_=A.req('PUT','/api/data/'+K,V1+' ',headers={'X-Base-Version':'1'}); check('next save with the right base is version 2',c==200 and j['version']==2)
c,j,_=B.req('POST','/api/login',{'email':'mgr1@ferentino.test','password':'Reset12345'}) ; 
D=Client(); c,j,_=D.req('POST','/api/login',{'email':'mgr1@ferentino.test','password':'Reset12345'})
# D was given a temp password by the admin step above -> use the admin to restore a known password
c,j,_=A.req('POST','/api/users/%d/temp'%UID); TP=j['tempPassword']; c,j,_=D.req('POST','/api/login',{'email':'mgr1@ferentino.test','password':TP}); c,j,_=D.req('POST','/api/password',{'current':TP,'next':'Manager2027'})
c,j,_=D.req('PUT','/api/data/'+K,'someone else',headers={'X-Base-Version':'1'}); check('a stale save is refused with 409 and says who saved newer',c==409 and j['current']['version']==2 and j['current']['by'],str(j.get('current')))
c,j,_=D.req('PUT','/api/data/'+K,'mine',headers={'X-Base-Version':'1','X-Force':'1'}); check('keep mine (force) overwrites',c==200 and j['version']==3)
c,j,_=A.req('PUT','/api/data/'+K,'x',headers={'X-Base-Version':'0'}); check('creating with base 0 over an existing item is a conflict',c==409)
# two people save at the same moment from the same version: exactly one wins
res=[]; 
def race(cl,val): res.append(cl.req('PUT','/api/data/race_key',val,headers={'X-Base-Version':'0'})[0])
c0,_,_=A.req('PUT','/api/data/race_key','start'); 
ths=[threading.Thread(target=race,args=(cl,'v-%d'%i)) for i,cl in enumerate([A,D,A,D,A,D])]
res.clear(); A.req('DELETE','/api/data/race_key',headers={'X-Force':'1'}); 
[t.start() for t in ths]; [t.join() for t in ths]
check('simultaneous first saves: one succeeds, the others are told',sorted(res)==[200]+[409]*5,str(sorted(res)))
# delete, tombstones, pull and changes
c,b,h=A.req('GET','/api/data/race_key',raw=True); cur=h['X-Version']
c,j,_=A.req('DELETE','/api/data/race_key',headers={'X-Base-Version':'1' if cur!='1' else '9'}); check('delete with an old version is refused',c==409)
c,j,_=A.req('DELETE','/api/data/race_key',headers={'X-Base-Version':cur}); check('delete with the right version',c==200)
c,b,_=A.req('GET','/api/data/race_key',raw=True); check('deleted item gives 404',c==404)
c,j,_=A.req('PUT','/api/data/race_key','again',headers={'X-Base-Version':'0'}); check('can be created again after deletion',c==200)
c,j,_=A.req('GET','/api/sync/pull?since=0&maxMB=8'); items={i['key']:i for i in j['items']}; check('pull returns every item with value, version and change number',c==200 and K in items and items[K]['value']=='mine' and items[K]['version']==3 and not j['more'],str(sorted(items)))
top=j['seq']
c,j,_=A.req('GET','/api/sync/changes?since=%d'%top); check('nothing changed since the last pull',c==200 and j['changed']==[] and j['seq']==top)
D.req('PUT','/api/data/fitl_waste_v1',json.dumps({'collectors':[1,2,3]}),headers={'X-Base-Version':'0'})
c,j,_=A.req('GET','/api/sync/changes?since=%d'%top); check('changes show the new item and who saved it',len(j['changed'])==1 and j['changed'][0]['key']=='fitl_waste_v1' and j['changed'][0]['by']=='Nimal Perera' and j['seq']>top,str(j['changed']))
# big values and paging
BIG='x'*(3*1024*1024)+'é'
for n in range(3): A.req('PUT','/api/data/big_%d'%n,BIG+str(n))
c,j,_=A.req('GET','/api/sync/pull?since=0&maxMB=4'); got=len(j['items']); more=j['more']; seq=j['seq']; allk=[i['key'] for i in j['items']]
guard=0
while more and guard<20:
    c,j,_=A.req('GET','/api/sync/pull?since=%d&maxMB=4'%seq); allk+= [i['key'] for i in j['items']]; more=j['more']; seq=j['seq']; guard+=1
check('large items arrive in pages and none is lost',all(('big_%d'%n) in allk for n in range(3)) and len(set(allk))==len(allk),str(len(allk))+' items, pages ok')
c,b,_=A.req('GET','/api/data/big_2',raw=True); check('a 3 MB item survives intact',b.decode('utf-8')==BIG+'2')
# special keys, as the pages name them
for k in ['fitl-firewood::lorries','d1793582208756atpu|01|00','a b/c?d&e=f%']:
    c,j,_=A.req('PUT','/api/data/'+urllib.parse.quote(k,safe=''),'val of '+k); c2,b,_=A.req('GET','/api/data/'+urllib.parse.quote(k,safe=''),raw=True)
    check('key %r round-trips'%k,c==200 and b.decode()=='val of '+k)
# history and restore
c,j,_=A.req('PUT','/api/data/'+K,'third',headers={'X-Base-Version':'3'}); c,j,_=A.req('GET','/api/history/'+K); check('an earlier copy is kept',c==200 and len(j['versions'])>=1,str(j['versions'][:1]))
hid=j['versions'][-1]['id']; c,j,_=A.req('POST','/api/history/%s/%d/restore'%(K,hid)); c2,b,_=A.req('GET','/api/data/'+K,raw=True); check('administrator brings an earlier copy back',c==200 and b.decode()!='third',b.decode()[:40])
c,j,_=D.req('GET','/api/history/'+K); check('history is for the administrator',c==403)
# ---------- files ----------
FB=os.urandom(3*1024*1024); name='පරීක්ෂණ report ✓.pdf'
c,j,_=A.req('PUT','/api/files/'+urllib.parse.quote('d1|01|00',safe=''),FB,headers={'Content-Type':'application/pdf','X-File-Name':urllib.parse.quote(name)}); check('file stored',c==200 and j['size']==len(FB))
c,b,h=D.req('GET','/api/files/'+urllib.parse.quote('d1|01|00',safe=''),raw=True); check('another person downloads the same bytes, type and name',c==200 and b==FB and h['Content-Type']=='application/pdf' and urllib.parse.unquote(h['X-File-Name'])==name)
c,j,_=D.req('GET','/api/files'); check('file list',c==200 and any(f['key']=='d1|01|00' and f['size']==len(FB) for f in j['files']))
c,j,_=A.req('DELETE','/api/files/'+urllib.parse.quote('d1|01|00',safe='')); c2,b,_=A.req('GET','/api/files/'+urllib.parse.quote('d1|01|00',safe=''),raw=True); check('file deleted',c==200 and c2==404)
c,j,_=Client().req('GET','/api/files'); check('files need a sign-in',c==401)
# pages
c,b,h=Client().req('GET','/',raw=True); check('the management system page is served',c==200 and b'Ferentino' in b[:400000] or c==200)
c,b,h=Client().req('GET','/../etc/passwd',raw=True); check('no path traversal',c in (404,400))
c,j,_=A.req('POST','/api/logout'); c,j,_=A.req('GET','/api/me'); check('sign-out ends the session',j['user'] is None)
print('\n%d passed, %d failed'%(ok_n,fail_n)); sys.exit(1 if fail_n else 0)
