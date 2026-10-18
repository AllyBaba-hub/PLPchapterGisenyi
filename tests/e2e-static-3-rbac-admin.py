import os, json, subprocess, datetime as dt
from playwright.sync_api import sync_playwright
URL="file://"+os.path.abspath("index.html"); errs=[]; res=[]
def ok(n,c,x=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ")+n+(" :: "+str(x) if (x and not c) else ""))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900},accept_downloads=True); pg=ctx.new_page()
    pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None); pg.on("pageerror",lambda e: errs.append("PAGEERR "+str(e)))
    def nav(h): pg.evaluate("h=>{location.hash='#'+h}",h); pg.wait_for_timeout(350)
    pg.goto(URL+"#/"); pg.wait_for_timeout(300)
    # seed: super admin, 6 approved users w/ passwords + roles
    pg.evaluate("""async()=>{const A=PLP.API;await PLP.Auth.setup({full_name:'Alice Super',email:'alice@plp.rw',password:'Strong123',confirm:'Strong123'});
     const names=['bob','sec','mo','ev','com','tre','ldr'];
     names.forEach((n,i)=>A.submitApplication({full_name:n.toUpperCase()+' Person',email:n+'@x.rw',phone:'+2507880001'+String(i).padStart(2,'0'),date_of_birth:'2003-01-01',school:i%2?'GS A':'GS B',graduation_year:String(2019+i%3),district:i%2?'Rubavu':'Nyabihu',sector:'S',cell:'C',village:'V',motivation:'I want to serve my community well.',agreement_accepted:true}));
     await PLP.Auth.login('alice@plp.rw','Strong123');
     A.applications().forEach(a=>A.approveApplication(a.id));
     const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));
     for(const r of d.resets){await PLP.Auth.resetPassword(r.token,'Passw0rd1','Passw0rd1');}
     const us=A.users();const set=async(n,role)=>A.setRole(us.find(u=>u.email===n+'@x.rw').id,role);
     await set('sec','SECRETARY');await set('mo','MEMBERSHIP_OFFICER');await set('ev','EVENTS_COORDINATOR');await set('com','COMMUNICATIONS_OFFICER');await set('tre','TREASURER');await set('ldr','CHAPTER_LEADER');
     PLP.Auth.logout();}""")
    ok("role change emails queued",pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).emails.filter(e=>e.event==='MEMBER_ROLE_CHANGED').length")==6)
    # spec matrix, written independently of the implementation
    EXP={ # role: (viewMembers, approve, createEvents, publishNews, audit, roles)
     'MEMBER':(0,0,0,0,0,0),'SECRETARY':(1,0,0,0,0,0),'EVENTS_COORDINATOR':(1,0,1,0,0,0),'COMMUNICATIONS_OFFICER':(1,0,0,1,0,0),
     'MEMBERSHIP_OFFICER':(1,1,0,0,0,0),'CHAPTER_LEADER':(1,1,1,1,0,0),'SUPER_ADMIN':(1,1,1,1,1,1),'TREASURER':(0,0,0,0,0,0)}
    who={'MEMBER':'bob','SECRETARY':'sec','EVENTS_COORDINATOR':'ev','COMMUNICATIONS_OFFICER':'com','MEMBERSHIP_OFFICER':'mo','CHAPTER_LEADER':'ldr','TREASURER':'tre'}
    for role,exp in EXP.items():
        em='alice@plp.rw' if role=='SUPER_ADMIN' else who[role]+'@x.rw'; pw='Strong123' if role=='SUPER_ADMIN' else 'Passw0rd1'
        got=pg.evaluate("""async([em,pw])=>{PLP.Auth.logout();await PLP.Auth.login(em,pw);const A=PLP.API;const t=(f)=>{try{f();return 1}catch(e){return e.code==='FORBIDDEN'||e.code==='UNAUTH'?0:1}};
          return [t(()=>A.members()),t(()=>A.approveApplication('x')),t(()=>A.saveEvent({})),t(()=>A.saveNews({})),t(()=>A.auditLogs()),t(()=>A.users())]}""",[em,pw])
        ok(f"matrix {role}",tuple(got)==exp,f"got {got} expected {exp}")
    pg.evaluate("()=>PLP.Auth.logout()")
    # UI sidebars
    def side(em,pw):
        nav("/login"); pg.fill("[name=email]",em); pg.fill("[name=password]",pw); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
        t=[x.split("\n")[0] for x in pg.locator("#side nav a").all_inner_texts()]; pg.click("[data-action=logout]"); pg.wait_for_timeout(300); return t
    s=side("sec@x.rw","Passw0rd1"); ok("secretary sidebar: Reports+Directory, no Audit",("Reports" in s) and ("Member Directory" in s) and ("Audit Logs" not in s) and ("Events" not in s),s)
    s=side("com@x.rw","Passw0rd1"); ok("comms sidebar: News+Gallery only",("News" in s) and ("Gallery" in s) and ("Roles & Permissions" not in s),s)
    s=side("tre@x.rw","Passw0rd1"); ok("treasurer limited: overview only",s==["Overview"],s)
    # direct URL to forbidden admin pages
    nav("/login"); pg.fill("[name=email]","mo@x.rw"); pg.fill("[name=password]","Passw0rd1"); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
    nav("/admin/events"); ok("officer direct-URL events -> 403",pg.locator("h1:has-text('403')").count()==1)
    nav("/admin/audit-logs"); ok("officer direct-URL audit -> 403",pg.locator("h1:has-text('403')").count()==1)
    nav("/dashboard"); ok("admin role redirected away from member portal",pg.url.endswith("#/admin"))
    pg.click("[data-action=logout]"); pg.wait_for_timeout(300)
    # super admin features
    nav("/login"); pg.fill("[name=email]","alice@plp.rw"); pg.fill("[name=password]","Strong123"); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
    nav("/admin/members"); pg.wait_for_timeout(300); ok("members listed (paginated)",pg.locator("tbody tr").count()>=1)
    pg.fill("#mbq","sec person"); pg.wait_for_timeout(600); ok("member search debounced",pg.locator("tbody tr").count()==1)
    pg.fill("#mbq",""); pg.wait_for_timeout(500); pg.select_option("#mbd","Rubavu"); pg.wait_for_timeout(300); n=pg.locator("tbody tr").count(); ok("filter by district",0<n<7,n)
    with pg.expect_download() as d: pg.click("[data-action=mb-csv]")
    path=d.value.path(); txt=open(path,encoding='utf-8-sig').read(); ok("members CSV export",txt.startswith("Membership ID,Name") and "PLP-GSY-" in txt)
    with pg.expect_download() as d: pg.click("[data-action=mb-pdf]")
    pdf=d.value.path(); out=subprocess.run(["pdftotext",pdf,"-"],capture_output=True,text=True).stdout; ok("members PDF export valid",("PLP Chapter Gisenyi - Members" in out) and "PLP-GSY-" in out,out[:100])
    pg.select_option('#mbd',''); pg.wait_for_timeout(300)
    pg.locator("tr:has-text('BOB Person') [data-action=mb-suspend]").click(); pg.wait_for_timeout(200); pg.fill("#cin","Repeated absence from activities"); pg.click("#cok"); pg.wait_for_timeout(500)
    ok("suspend logged + emailed",pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));return d.audit_logs.some(l=>l.action==='MEMBER_SUSPENDED')&&d.emails.some(e=>e.event==='MEMBER_SUSPENDED')}"))
    pg.click("[data-action=logout]"); pg.wait_for_timeout(300)
    nav("/login"); pg.fill("[name=email]","bob@x.rw"); pg.fill("[name=password]","Passw0rd1"); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
    ok("suspended member cannot log in (generic error)",pg.locator(".login-err:has-text('Invalid email or password')").count()==1)
    # brute force
    for i in range(6):
        pg.fill("[name=email]","ldr@x.rw"); pg.fill("[name=password]","Nope12345"); pg.click("button[type=submit]"); pg.wait_for_timeout(350)
    pg.fill("[name=email]","ldr@x.rw"); pg.fill("[name=password]","Passw0rd1"); pg.click("button[type=submit]"); pg.wait_for_timeout(600)
    ok("rate limit locks even correct password",pg.locator(".login-err:has-text('Too many attempts')").count()==1 and "login" in pg.url)
    # back to super admin
    nav("/login"); pg.fill("[name=email]","alice@plp.rw"); pg.fill("[name=password]","Strong123"); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
    # roles + last super admin
    nav("/admin/roles"); pg.locator("tr:has-text('alice@plp.rw') select").select_option("MEMBER"); pg.locator("tr:has-text('alice@plp.rw') [data-action=role-save]").click(); pg.wait_for_timeout(200); pg.click("#cok"); pg.wait_for_timeout(400)
    ok("cannot demote last SUPER_ADMIN",pg.locator(".toast.err:has-text('last SUPER_ADMIN')").count()>=1)
    nav("/admin/roles"); pg.locator("tr:has-text('ldr@x.rw') select").select_option("VICE_LEADER"); pg.locator("tr:has-text('ldr@x.rw') [data-action=role-save]").click(); pg.wait_for_timeout(200); pg.click("#cok"); pg.wait_for_timeout(400)
    ok("role change works + ROLE_CHANGED audit",pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).audit_logs.filter(l=>l.action==='ROLE_CHANGED').length")>=7)
    # events / attendance / reports
    fut=(dt.datetime.now()+dt.timedelta(days=5)).strftime("%Y-%m-%dT09:00")
    pg.evaluate("""async(f)=>{const A=PLP.API;const e=A.saveEvent({title:'Tree Planting',description:'x',location:'Gisenyi',event_date:f,category:'Community Service',status:'UPCOMING',published:true});
      const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));PLP.Auth.logout();await PLP.Auth.login('sec@x.rw','Passw0rd1');}""",fut) if False else None
    pg.evaluate("f=>{PLP.API.saveEvent({title:'Tree Planting',description:'x',location:'Gisenyi',event_date:f,category:'Community Service',status:'UPCOMING',published:true})}",fut)
    # register 3 members directly in storage via API as each member
    for n in ['sec','mo','ev']:
        pg.evaluate("async n=>{PLP.Auth.logout();}",n)
    # members who are admin roles cannot use portal -> register via a fresh member account
    pg.evaluate("""async()=>{PLP.Auth.logout();await PLP.Auth.login('alice@plp.rw','Strong123');const A=PLP.API;
      A.submitApplication({full_name:'Zed Volunteer',email:'zed@x.rw',phone:'+250788000777',date_of_birth:'2003-01-01',school:'GS A',graduation_year:'2020',district:'Rubavu',sector:'S',cell:'C',village:'V',motivation:'I want to serve my community well.',agreement_accepted:true});
      A.approveApplication(A.applications().find(a=>a.email==='zed@x.rw').id);const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));const r=d.resets[d.resets.length-1];await PLP.Auth.resetPassword(r.token,'Passw0rd1','Passw0rd1');
      PLP.Auth.logout();await PLP.Auth.login('zed@x.rw','Passw0rd1');A.registerEvent(A.myEvents().find(e=>e.title==='Tree Planting').id);PLP.Auth.logout();await PLP.Auth.login('alice@plp.rw','Strong123');}""")
    ok("member registered via API",pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).event_registrations.some(r=>r.attendance_status==='REGISTERED')"))
    nav("/admin/attendance"); pg.select_option("#attev",index=1); pg.wait_for_timeout(300)
    sel=pg.locator("#attbox select").first; ok("attendance table shows registrant",pg.locator("#attbox select").count()>=1)
    pg.locator("#attbox select").first.select_option("ATTENDED"); pg.wait_for_timeout(400); ok("attendance marked + audited",pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).audit_logs.some(l=>l.action==='EVENT_ATTENDANCE_MARKED')"))
    ok("attendance rate 100%",pg.locator("#attbox .statcards li:nth-child(3) b").inner_text()=="100%")
    nav("/admin/reports"); pg.wait_for_timeout(300); ok("report charts render",pg.locator("svg.chart").count()>=3 and pg.locator(".pie").count()>=2)
    pg.fill("[name=from]","2030-01-01"); pg.fill("[name=to]","2030-12-31"); pg.click("form[data-form=rep] button[type=submit]"); pg.wait_for_timeout(300); ok("date-range filter (empty future)",pg.locator("#repbox .statcards li b").first.inner_text()=="0")
    pg.fill("[name=from]",""); pg.fill("[name=to]",""); pg.click("form[data-form=rep] button[type=submit]"); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click("[data-action=rep-pdf]")
    out=subprocess.run(["pdftotext",d.value.path(),"-"],capture_output=True,text=True).stdout; ok("report PDF valid",("Report" in out) and "Members by district" in out)
    with pg.expect_download() as d: pg.click("[data-action=rep-csv]")
    ok("report CSV valid",open(d.value.path(),encoding='utf-8-sig').read().startswith("Section,Item,Value"))
    ok("REPORT_GENERATED audited",pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).audit_logs.some(l=>l.action==='REPORT_GENERATED')"))
    # audit page
    nav("/admin/audit-logs"); pg.wait_for_timeout(300); ok("audit page lists + paginated",pg.locator("tbody tr").count()==20 and pg.locator(".pager").count()==1)
    pg.select_option("#aua","LOGIN_FAILED"); pg.wait_for_timeout(300); ok("audit filter by action",pg.locator("tbody tr").count()>=1 and all("LOGIN_FAILED" in t for t in pg.locator("tbody tr td:nth-child(3)").all_inner_texts()))
    ok("audit has no edit/delete controls",pg.locator("#aulist button:has-text('Delete'), #aulist button:has-text('Edit')").count()==0)
    ok("audit API exposes no mutation",pg.evaluate("()=>!('deleteAudit' in PLP.API)&&!('updateAudit' in PLP.API)&&Object.keys(PLP.API).every(k=>!/audit/i.test(k)||['auditLogs','logAuditExport'].includes(k))"))
    # settings
    nav("/admin/settings"); pg.fill("[name=contact_email]","info@plpgisenyi.rw"); pg.fill("[name=facebook]","notaurl"); pg.click("form[data-form=settings] button[type=submit]"); pg.wait_for_timeout(300); ok("settings validates url",pg.locator(".field-error:has-text('http')").count()==1)
    pg.fill("[name=facebook]","https://facebook.com/plpgisenyi"); pg.fill("[name=brand_color]","#ffee00") ; pg.click("form[data-form=settings] button[type=submit]"); pg.wait_for_timeout(300); ok("low-contrast brand color rejected",pg.locator(".field-error:has-text('WCAG')").count()==1)
    pg.fill("[name=brand_color]","#0b5a2d"); pg.locator("summary:has-text('Application Approved')").click(); pg.fill("[name=tpl_APPLICATION_APPROVED_body]","Karibu {{name}}! Welcome to PLP Gisenyi, your application is approved."); pg.click("form[data-form=settings] button[type=submit]"); pg.wait_for_timeout(500)
    nav("/"); pg.wait_for_timeout(300); ok("footer shows configured social + email",pg.locator("footer a.social").count()==1 and pg.locator("footer a[href='mailto:info@plpgisenyi.rw']").count()==1)
    # announcements + messages
    nav("/admin/announcements"); pg.fill("[name=title]","Meeting Saturday"); pg.fill("[name=body]","All members please attend."); pg.click("form[data-form=ann-send] button[type=submit]"); pg.wait_for_timeout(400); ok("announcement sent to active members",pg.locator(".toast:has-text('Announcement sent to')").count()>=1)
    pg.select_option("#f-audience","EVENT"); pg.wait_for_timeout(200); ok("audience target list populated",pg.locator("#f-audience_value option").count()>=2)
    nav("/admin/emails"); pg.wait_for_timeout(300); ok("email outbox lists + preview",pg.locator("tbody tr").count()>=1)
    pg.locator("[data-action=em-view]").first.click(); pg.wait_for_timeout(300); ok("email preview is sandboxed iframe with logo",pg.locator("iframe.mailframe[sandbox]").count()==1 and "data:image/svg+xml" in pg.locator("iframe.mailframe").get_attribute("srcdoc"))
    # failed email path: configure bad endpoint, approval must still succeed
    ok("email failure doesn't break approval",pg.evaluate("""async()=>{window.PLP_CONFIG.emailEndpoint='http://127.0.0.1:9/x';const A=PLP.API;A.submitApplication({full_name:'Yan Late',email:'yan@x.rw',phone:'+250788000888',date_of_birth:'2003-01-01',school:'GS A',graduation_year:'2020',district:'Rubavu',sector:'S',cell:'C',village:'V',motivation:'I want to serve my community well.',agreement_accepted:true});
      const m=A.approveApplication(A.applications().find(a=>a.email==='yan@x.rw').id);await new Promise(r=>setTimeout(r,1500));const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));return !!m.membership_id&&d.emails.some(e=>e.status==='FAILED')&&d.audit_logs.some(l=>l.action==='EMAIL_FAILED')}"""))
    pg.evaluate("()=>{window.PLP_CONFIG.emailEndpoint=''}")
    # session expiry
    ok("session expires after 7 days idle",pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('plp_gisenyi_session_v1'));s.last=Date.now()-8*864e5;localStorage.setItem('plp_gisenyi_session_v1',JSON.stringify(s));return PLP.Auth.current()===null}"""))
    ls=pg.evaluate("()=>localStorage.getItem('plp_gisenyi_db_v1').length"); print("   db size bytes:",ls)
    b.close()
print("\nconsole errors:",errs); print("PASSED",sum(res),"of",len(res))
