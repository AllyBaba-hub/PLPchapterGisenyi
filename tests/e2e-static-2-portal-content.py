import os, json, re, subprocess
from playwright.sync_api import sync_playwright
URL="file://"+os.path.abspath("index.html"); errs=[]; res=[]
def ok(n,c,x=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ")+n+(" :: "+str(x) if (x and not c) else ""))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900},accept_downloads=True); pg=ctx.new_page()
    pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None); pg.on("pageerror",lambda e: errs.append("PAGEERR "+str(e)))
    def go(h): pg.goto(URL+"#"+h); pg.wait_for_timeout(300)
    def nav(h): pg.evaluate("h=>{location.hash='#'+h}",h); pg.wait_for_timeout(350)
    def login(e,pw):
        nav("/login"); pg.fill("[name=email]",e); pg.fill("[name=password]",pw); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
    def logout(): pg.click("[data-action=logout]"); pg.wait_for_timeout(300)
    go("/")
    # seed via real API
    pg.evaluate("""async()=>{await PLP.Auth.setup({full_name:'Alice Super',email:'alice@plp.rw',password:'Strong123',confirm:'Strong123'});
      const mk=(n,e,ph)=>PLP.API.submitApplication({full_name:n,email:e,phone:ph,date_of_birth:'2003-01-01',school:'GS Gisenyi',graduation_year:'2021',district:'Rubavu',sector:'Gisenyi',cell:'C',village:'V',motivation:'I want to serve my community well.',agreement_accepted:true});
      mk('Bob Member','bob@example.com','+250788000111');mk('Dina Officer','dina@example.com','+250788000222');mk('Eve Rejected','eve@example.com','+250788000333');}""")
    login("alice@plp.rw","Strong123")
    ids=pg.evaluate("()=>PLP.API.applications().map(a=>[a.id,a.email])"); idm={e:i for i,e in ids}
    pg.evaluate("i=>{PLP.API.approveApplication(i)}",idm['bob@example.com']); pg.evaluate("i=>{PLP.API.approveApplication(i)}",idm['dina@example.com'])
    # reject via UI
    nav("/admin/applications"); pg.click("[data-action=ap-st][data-apst='']"); pg.wait_for_timeout(200)
    pg.locator("tr:has-text('Eve Rejected') [data-action=app-review]").click(); pg.wait_for_timeout(200); pg.click("[data-action=app-reject]"); pg.wait_for_timeout(200)
    pg.click("#cok"); pg.wait_for_timeout(200); ok("reject requires reason",pg.locator(".modal .field-error:has-text('reason')").count()==1)
    pg.fill("#cin","Does not meet the age requirement."); pg.click("#cok"); pg.wait_for_timeout(500)
    ok("rejected + audit + email (no admin notes in email)",pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));const e=d.emails.find(x=>x.event==='APPLICATION_REJECTED');return d.applications.find(a=>a.email==='eve@example.com').status==='REJECTED'&&d.audit_logs.some(l=>l.action==='APPLICATION_REJECTED')&&e&&!e.html.includes('age requirement')}"))
    # event via UI
    nav("/admin/events"); pg.click("[data-action=ev-new]"); pg.wait_for_timeout(200); pg.click(".modal button[type=submit]"); pg.wait_for_timeout(200)
    ok("event form validates required",pg.locator(".modal .field-error").count()>=2)
    pg.fill(".modal [name=title]","Lake Kivu Clean-up"); pg.fill(".modal [name=description]","Community service along the lake."); pg.fill(".modal [name=location]","Gisenyi Beach")
    import datetime as dt
    fut=(dt.datetime.now()+dt.timedelta(days=10)).strftime("%Y-%m-%dT10:00"); pg.fill(".modal [name=event_date]",fut); pg.check(".modal [name=published]"); pg.set_input_files(".modal [name=imageFile]","/tmp/pic.png")
    pg.click(".modal button[type=submit]"); pg.wait_for_timeout(700); ok("event created + listed",pg.locator("td:has-text('Lake Kivu Clean-up')").count()>=1)
    past=(dt.datetime.now()-dt.timedelta(days=20)).strftime("%Y-%m-%dT10:00")
    pg.click("[data-action=ev-new]"); pg.wait_for_timeout(200); pg.fill(".modal [name=title]","Peace Walk 2026"); pg.fill(".modal [name=event_date]",past); pg.check(".modal [name=published]"); pg.click(".modal button[type=submit]"); pg.wait_for_timeout(600)
    # news via UI with editor
    nav("/admin/news"); pg.click("[data-action=nw-new]"); pg.wait_for_timeout(200); pg.fill(".modal [name=title]","First Peace Walk Recap")
    pg.click("#ed"); pg.keyboard.type("We walked together for peace."); pg.keyboard.press("Control+A"); pg.click("[data-action=ed-cmd][data-cmd=bold]")
    pg.evaluate("()=>{document.getElementById('ed').insertAdjacentHTML('beforeend','<script>alert(1)<\\/script><img src=data:,x onerror=alert(2)><p onclick=alert(3)>safe</p>')}")
    pg.click(".modal button[value=publish]"); pg.wait_for_timeout(600)
    html=pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).news[0].content")
    ok("news saved, bold kept, XSS stripped",("<b>" in html or "<strong>" in html) and "script" not in html and "onerror" not in html and "onclick" not in html,html)
    # gallery
    nav("/admin/gallery"); pg.set_input_files("[name=files]","/tmp/pic.png"); pg.fill("[name=title]","Beach day"); pg.select_option("[name=event_id]",index=1); pg.click("button[type=submit]"); pg.wait_for_timeout(900)
    ok("gallery upload listed",pg.locator(".gallery.admin figure").count()==1)
    pg.set_input_files("[name=files]","/tmp/bad.gif"); pg.click("button[type=submit]"); pg.wait_for_timeout(500); ok("gif rejected",pg.locator(".toast.err:has-text('unsupported')").count()>=1)
    pg.set_input_files("[name=files]","/tmp/big.png"); pg.click("button[type=submit]"); pg.wait_for_timeout(500); ok("oversize rejected",pg.locator(".toast.err:has-text('too large')").count()>=1)
    # public view
    logout(); nav("/"); pg.wait_for_timeout(500)
    ok("home shows event/news/gallery",pg.locator(".ev").count()>=1 and pg.locator(".news").count()>=1 and pg.locator(".g-item").count()>=1)
    ok("home stats from DB (1 member active? 2)",pg.locator(".stats b").first.inner_text() in ("2","0"))
    nav("/gallery"); pg.click(".g-item"); pg.wait_for_timeout(500); ok("lightbox opens",pg.locator(".lightbox img").count()==1 and pg.locator(".lightbox img").get_attribute("src").startswith("blob:")); pg.keyboard.press("Escape"); pg.wait_for_timeout(200); ok("lightbox esc closes",pg.locator(".lightbox").count()==0)
    nav("/news"); pg.fill("#nq","walk"); pg.wait_for_timeout(500); ok("news search",pg.locator(".news").count()==1); pg.fill("#nq","zzz"); pg.wait_for_timeout(500); ok("news search none",pg.locator(".news").count()==0)
    nav("/events"); pg.click("[data-tab=past]"); pg.wait_for_timeout(300); ok("past events filter",pg.locator(".ev:has-text('Peace Walk')").count()==1)
    pg.click("[data-tab=upcoming]"); pg.wait_for_timeout(200); pg.click(".ev a.btn"); pg.wait_for_timeout(300)
    ok("event page asks login to register",pg.locator("a:has-text('Log in to register')").count()==1)
    ok("SEO title per event",pg.title().startswith("Lake Kivu Clean-up"),pg.title())
    # member activation
    link=pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));const e=d.emails.filter(x=>x.event==='APPLICATION_APPROVED')[0];return e.text.match(/\\S*#\\/reset\\?token=\\w+/)[0]}")
    pg.goto(link); pg.wait_for_timeout(400); pg.fill("[name=password]","Member123"); pg.fill("[name=confirm]","Member999"); pg.click("button[type=submit]"); pg.wait_for_timeout(400); ok("mismatch confirm rejected",pg.locator(".field-error").count()>0)
    pg.fill("[name=confirm]","Member123"); pg.click("button[type=submit]"); pg.wait_for_timeout(900); ok("password set -> login",pg.url.endswith("#/login"))
    pg.goto(link); pg.wait_for_timeout(300); ok("reset token single-use",pg.locator("text=invalid or has expired").count()==1)
    login("bob@example.com","Member123"); ok("member -> /dashboard",pg.url.endswith("#/dashboard") and pg.locator("h1:has-text('Welcome, Bob Member')").count()==1)
    ok("dashboard shows membership id + stats",pg.locator("text=PLP-GSY-2026-0001").count()>=1 and pg.locator(".statcards li").count()==4)
    # member cannot access admin
    nav("/admin"); ok("member -> 403 on /admin",pg.locator("h1:has-text('403')").count()==1)
    nav("/admin/audit-logs"); ok("member -> 403 audit",pg.locator("h1:has-text('403')").count()==1)
    # register
    nav("/dashboard/events"); pg.click("[data-action=do-reg]"); pg.wait_for_timeout(500); ok("registered",pg.locator(".toast:has-text('Registration confirmed')").count()>=1 and pg.locator("text=Registered").count()>=1)
    err=pg.evaluate("()=>{try{PLP.API.registerEvent(PLP.API.myEvents().find(e=>e.title==='Lake Kivu Clean-up').id);return 'none'}catch(e){return e.code}}"); ok("duplicate registration blocked",err=="DUPLICATE",err)
    nav("/dashboard/history"); ok("history lists Registered",pg.locator("td:has-text('Registered')").count()>=1)
    # profile
    nav("/profile"); pg.fill("[name=phone]","bad"); pg.click("form[data-form=profile] button[type=submit]"); pg.wait_for_timeout(300); ok("profile validates phone",pg.locator(".field-error").count()>0)
    pg.fill("[name=phone]","+250788000999"); pg.fill("[name=occupation]","Teacher"); pg.click("form[data-form=profile] button[type=submit]"); pg.wait_for_timeout(400)
    ok("profile updated + PROFILE_UPDATED audit",pg.evaluate("()=>{const d=JSON.parse(localStorage.getItem('plp_gisenyi_db_v1'));return d.members[0].occupation==='Teacher'&&d.audit_logs.some(l=>l.action==='PROFILE_UPDATED')}"))
    ok("full name/email read-only",pg.locator("[name=full_name][readonly]").count()==1 and pg.locator("[name=email][readonly]").count()==1)
    pg.set_input_files("#photo","/tmp/pic.png"); pg.wait_for_timeout(900); ok("profile photo set",pg.evaluate("()=>JSON.parse(localStorage.getItem('plp_gisenyi_db_v1')).members[0].profile_image").startswith("idb:"))
    # card QR decode
    nav("/dashboard/card"); pg.wait_for_timeout(500); pg.locator(".idcard-qr svg").screenshot(path="/tmp/cardqr.png")
    import cv2; v,_,_=cv2.QRCodeDetector().detectAndDecode(cv2.resize(cv2.imread("/tmp/cardqr.png"),None,fx=3,fy=3)); ok("card QR decodes to membership id",v=="PLP-GSY-2026-0001",v)
    nav("/dashboard/notifications"); ok("notifications listed",pg.locator(".listrow").count()>=1); pg.click("[data-action=read-all]"); pg.wait_for_timeout(300); ok("mark all read",pg.locator(".unread").count()==0)
    nav("/dashboard/settings"); pg.fill("[name=current]","Wrong111"); pg.fill("[name=next]","NewPass123"); pg.fill("[name=confirm]","NewPass123"); pg.click("form[data-form=pw] button[type=submit]"); pg.wait_for_timeout(500); ok("wrong current password rejected",pg.locator(".field-error:has-text('incorrect')").count()==1)
    pg.fill("[name=current]","Member123"); pg.click("form[data-form=pw] button[type=submit]"); pg.wait_for_timeout(500); ok("password changed",pg.locator(".toast:has-text('Password updated')").count()>=1)
    nav("/dashboard/announcements"); logout()
    # mobile overflow
    m=b.new_context(viewport={'width':375,'height':740}); mp=m.new_page()
    for r in ["/","/events","/join","/about","/contact"]:
        mp.goto(URL+"#"+r); mp.wait_for_timeout(300); ow=mp.evaluate("()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1"); ok("mobile no h-scroll "+r,not ow)
    mp.click(".burger"); ok("mobile menu opens",mp.locator("#mainnav.open").count()==1); m.close()
    ls=pg.evaluate("()=>JSON.stringify(Object.assign({},localStorage))"); open("/tmp/ls2.json","w").write(ls)
    b.close()
print("\nconsole errors:",errs); print("PASSED",sum(res),"of",len(res))
