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
    check("NO CONCRETE button gone", pg.locator(".flag-btn[data-flag='noconcrete']").count()==0)
    check("install select defaults to concrete", pg.evaluate("document.getElementById('install').value")=="concrete")
    call="fetchBOM(document.getElementById('fam').value,[{kind:'fence',length:100}],6,2,0,0,0,0,[],0)"
    pg.evaluate(call); pg.wait_for_timeout(300)
    check("default sends install_method=concrete", sent[-1].get("install_method")=="concrete", sent[-1])
    check("no concrete:false field sent", "concrete" not in sent[-1], sent[-1])
    pg.select_option("#install","driven"); pg.evaluate(call); pg.wait_for_timeout(300)
    check("driven sends install_method=driven", sent[-1].get("install_method")=="driven")
    pg.select_option("#install","plated"); pg.evaluate(call); pg.wait_for_timeout(300)
    check("plated sends install_method=plated", sent[-1].get("install_method")=="plated")
    pg.select_option("#install","concrete"); h1=pg.evaluate("hardsawInputSig()")
    pg.select_option("#install","driven"); h2=pg.evaluate("hardsawInputSig()")
    check("install method changes the input signature (Spider 60e418d9)", h1!=h2, (h1,h2))
    check("no page errors", not errs, errs[:3])
    b.close()
print("FAILS:",fails); sys.exit(1 if fails else 0)
