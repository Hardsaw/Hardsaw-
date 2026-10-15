import json, sys, base64
from playwright.sync_api import sync_playwright
fails=[]
def check(n,c,i=""):
    print(("PASS " if c else "FAIL ")+n, i)
    if not c: fails.append(n)
PNG=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(**p.devices['iPhone 13'])
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.dismiss())
    calls=[]
    def route(r):
        u=r.request.url
        if "quote-photo-intake" in u:
            body=json.loads(r.request.post_data or "{}"); calls.append((body.get("action"), r.request.headers.get("x-upload-pin")))
            if body["action"]=="issue":
                return r.fulfill(status=200, content_type="application/json", body=json.dumps({"uploads":[{"signedUrl":"https://example.test/up","path":body["quote_no"]+"/"+body["quote_no"]+"_1.png"}]}))
            return r.fulfill(status=200, content_type="application/json", body=json.dumps({"results":[{"ok":True,"path":body["paths"][0],"sha256":"ab"*32}]}))
        if "example.test/up" in u:
            calls.append(("put",None)); return r.fulfill(status=200, body="")
        if u.startswith("file://"): return r.continue_()
        return r.fulfill(status=200, content_type="application/json", body="{}")
    pg.route("**/*", route)
    pg.goto("file:///home/claude/hardsaw-/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("localStorage.clear();document.getElementById('ev-kan').value='';document.getElementById('ev-pin').value='';")
    pg.set_input_files("#fi-cam", files=[{"name":"s1.png","mimeType":"image/png","buffer":PNG}]); pg.wait_for_timeout(600)
    pg.set_input_files("#fi-cam", files=[{"name":"s2.png","mimeType":"image/png","buffer":PNG}]); pg.wait_for_timeout(600)
    chip=pg.inner_text("#ev-store-chip")
    check("photos without KAN/PIN are held, not dropped", "NOT STORED" in chip and "2 waiting" in chip, chip)
    check("no upload attempted without KAN/PIN", not any(c[0]=="issue" for c in calls), calls)
    pg.fill("#ev-kan","KAN004659"); pg.wait_for_timeout(300)
    check("KAN alone does not upload", not any(c[0]=="issue" for c in calls))
    pg.fill("#ev-pin","testpin123"); pg.press("#ev-pin","Tab"); pg.wait_for_timeout(2000)
    issues=[c for c in calls if c[0]=="issue"]; fins=[c for c in calls if c[0]=="finalize"]
    check("both held photos stored once PIN entered", len(issues)==2 and len(fins)==2, calls)
    check("PIN sent as header only", all(c[1]=="testpin123" for c in issues))
    chip=pg.inner_text("#ev-store-chip")
    check("chip shows STORED with count + fingerprint", "STORED KAN004659" in chip and "2 photo(s)" in chip and "abababababab" in chip, chip)
    n=len(calls); pg.set_input_files("#fi-cam", files=[{"name":"s3.png","mimeType":"image/png","buffer":PNG}]); pg.wait_for_timeout(1500)
    check("next photo stores immediately", len([c for c in calls[n:] if c[0]=="finalize"])==1)
    check("no page errors", not errs, errs[:3])
    b.close()
print("FAILS:",fails); sys.exit(1 if fails else 0)
