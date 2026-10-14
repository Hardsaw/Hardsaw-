import json, sys
from playwright.sync_api import sync_playwright
fails=[]
def check(n,c,i=""):
    print(("PASS " if c else "FAIL ")+n, i)
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(**p.devices['iPhone 13'])
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.dismiss())
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
    check("hidden on default (wood)", not pg.is_visible("#cl-com-flags"))
    pg.evaluate("document.getElementById('fam').value='chain_link.commercial.galvanized'; onStyleChange()")
    check("visible on CL commercial galv", pg.is_visible("#cl-com-flags"))
    pg.click(".cl-com-flag[data-flag='tension_wire']"); pg.click(".cl-com-flag[data-flag='barb_wire']")
    flags=pg.evaluate("Array.from(document.querySelectorAll('.flag-btn.on')).map(b=>b.dataset.flag)")
    check("flags collected", sorted(flags)==['barb_wire','tension_wire'], flags)
    pg.evaluate("fetchBOM('chain_link.commercial.galvanized',[{kind:'fence',length:100}],8,2,0,0,0,0,Array.from(document.querySelectorAll('.flag-btn.on')).map(b=>b.dataset.flag),0)"); pg.wait_for_timeout(300)
    check("engine receives flags", sent and sorted(sent[-1].get('flags',[]))==['barb_wire','tension_wire'], sent[-1].get('flags') if sent else None)
    pg.evaluate("document.getElementById('fam').value='chain_link.commercial.black'; onStyleChange()")
    check("stays on for CL commercial black", pg.is_visible("#cl-com-flags") and pg.evaluate("document.querySelectorAll('.cl-com-flag.on').length")==2)
    pg.evaluate("document.getElementById('fam').value='wood.privacy.tight_cedar'; onStyleChange()")
    check("hidden on wood", not pg.is_visible("#cl-com-flags"))
    check("switched off on wood", pg.evaluate("document.querySelectorAll('.cl-com-flag.on').length")==0)
    check("wood sends none of them", pg.evaluate("Array.from(document.querySelectorAll('.flag-btn.on')).map(b=>b.dataset.flag)")==[])
    check("no page errors", not errs, errs[:3])
    b.close()
print("FAILS:",fails); sys.exit(1 if fails else 0)
