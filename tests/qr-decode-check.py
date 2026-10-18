import cv2, numpy as np
from playwright.sync_api import sync_playwright
import os
ids=["PLP-GSY-2026-0001","A","PLP-GSY-2026-0042","x"*60,"Hello, Gisenyi! é"]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':600,'height':600})
    pg.goto("file://"+os.path.abspath("index.html") if os.path.exists("index.html") else "about:blank")
    pg.set_content("<html><body></body></html>")
    pg.add_script_tag(path="js/core.js"); pg.add_script_tag(path="js/qr.js")
    ok=True
    for t in ids:
        svg=pg.evaluate("t=>PLP.qrSvg(t,400)",t)
        pg.set_content("<html><body style='margin:0;background:#fff'>"+svg+"</body></html>")
        pg.screenshot(path="/tmp/qr.png",clip={'x':0,'y':0,'width':400,'height':400})
        img=cv2.imread("/tmp/qr.png")
        val,pts,_=cv2.QRCodeDetector().detectAndDecode(img)
        print(repr(t[:20]),"->",repr(val[:20]),"OK" if val==t else "FAIL"); ok&=(val==t)
        pg.add_script_tag(path="js/core.js"); pg.add_script_tag(path="js/qr.js")
    b.close()
print("ALL OK" if ok else "SOME FAILED")
