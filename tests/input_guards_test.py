import json, sys
from playwright.sync_api import sync_playwright
fails=[]
def check(n,c,i=""):
    print(("PASS " if c else "FAIL ")+n, i)
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(**p.devices['iPhone 13'])
    errs=[]; dialogs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    def on_dialog(d):
        dialogs.append(d.message); d.dismiss()   # dismiss = Cancel
    pg.on("dialog", on_dialog)
    sent=[]
    def route(r):
        u=r.request.url
        if "bom-calc" in u:
            sent.append(json.loads(r.request.post_data or "{}"))
            return r.fulfill(status=200, content_type="application/json", body=json.dumps({"bom":[],"engine_version":"mock","decision_hash":"X","concrete_bags":0}))
        if u.startswith("file://"): return r.continue_()
        return r.fulfill(status=200, content_type="application/json", body="{}")
    pg.route("**/*", route)
    pg.goto("file:///home/claude/hardsaw-/index.html"); pg.wait_for_timeout(700)
    def fresh(): pg.evaluate("document.getElementById('edges-container').innerHTML='';edgeN=0;window.__readerConf=undefined;['wg','dg','og'].forEach(function(i){document.getElementById(i).value='0'})")
    # A clean job: no dialog, engine called
    fresh(); pg.evaluate("addEdge('fence',100)"); n0=len(sent); d0=len(dialogs)
    pg.evaluate("runJob()"); pg.wait_for_timeout(1500)
    check("clean job builds with no warning", len(sent)==n0+1 and len(dialogs)==d0, dialogs[d0:])
    # Opening with no gate count -> warning, Cancel stops the build
    pg.evaluate("reset()"); fresh(); pg.evaluate("addEdge('fence',100);addEdge('opening',4)"); n0=len(sent); d0=len(dialogs)
    pg.evaluate("runJob()"); pg.wait_for_timeout(800)
    check("opening with 0 gates warns", len(dialogs)==d0+1 and 'gate opening(s) entered' in dialogs[-1], dialogs[d0:])
    check("Cancel stops the build", len(sent)==n0)
    # Inches typed as feet
    fresh(); pg.evaluate("addEdge('fence',100);addEdge('opening',59);document.getElementById('wg').value='1'"); d0=len(dialogs)
    pg.evaluate("runJob()"); pg.wait_for_timeout(800)
    check("59 ft opening asks about inches", len(dialogs)==d0+1 and 'typed in inches' in dialogs[-1], dialogs[d0:])
    # Reader-filled run, low confidence, unedited -> warn; after edit -> no warn
    fresh(); pg.evaluate("addEdge('fence',300);markReaderEdges('low')")
    w=pg.evaluate("inputGuards()"); check("unedited low-confidence reader run warns", any('sketch reader' in x for x in w), w)
    pg.fill("#edges-container .edge-len","342")
    w=pg.evaluate("inputGuards()"); check("edited reader run clears the warning", not any('sketch reader' in x for x in w), w)
    fresh(); pg.evaluate("addEdge('fence',300);markReaderEdges('high')")
    w=pg.evaluate("inputGuards()"); check("high-confidence reader run does not warn", w==[], w)
    # Accept = build anyway
    fresh(); pg.evaluate("addEdge('fence',100);addEdge('opening',4)"); n0=len(sent)
    pg.remove_listener("dialog", on_dialog); pg.on("dialog", lambda d: d.accept())
    pg.evaluate("runJob()"); pg.wait_for_timeout(1500)
    check("OK builds anyway", len(sent)==n0+1)
    check("no page errors", not errs, errs[:3])
    b.close()
print("FAILS:",fails); sys.exit(1 if fails else 0)
