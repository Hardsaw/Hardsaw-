import json, sys
from playwright.sync_api import sync_playwright
VP = {"resp": None}
fails = []
def check(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name, info); 
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(**p.devices['iPhone 13'])
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.dismiss())
    photo_calls = []
    def route(r):
        u = r.request.url
        if "vision-parse-v2" in u:
            return r.fulfill(status=200, content_type="application/json", body=json.dumps(VP["resp"]))
        if "quote-photo-intake" in u:
            body = json.loads(r.request.post_data or "{}"); photo_calls.append(body)
            if body["action"] == "issue":
                return r.fulfill(status=200, content_type="application/json", body=json.dumps({"ok":True,"uploads":[{"path":body["quote_no"]+"/"+body["quote_no"]+"_1.jpg","token":"t","signedUrl":"https://upload.test/x"}]}))
            res = {"path":body["paths"][0],"ok":True,"id":"i","sha256":"c0ffee"*10+"abcd","bytes":9,"loop_run_id":None,"link_error":VP.get("link_error")}
            return r.fulfill(status=200, content_type="application/json", body=json.dumps({"ok":True,"results":[res]}))
        if "upload.test" in u:
            return r.fulfill(status=200, body="{}")
        if u.startswith("file://"): return r.continue_()
        return r.fulfill(status=200, content_type="application/json", body="{}")
    pg.route("**/*", route)
    pg.goto("file:///home/claude/hardsaw-/index.html")
    pg.wait_for_timeout(800)
    check("no page errors on load", not errs, errs[:3])
    # ensure one edge exists and TYPE 490 like a user
    n = pg.evaluate("document.querySelectorAll('#edges-container .edge-len').length")
    if n == 0: pg.evaluate("addEdge('fence','','')")
    inp = pg.locator("#edges-container .edge-len").first
    inp.fill(""); inp.type("490")
    # A: reader returns 0 / undefined
    VP["resp"] = {"form_params":{"edges":[{"kind":"fence","length":0}],"height_ft":None,"walks":0,"drives":0,"ends":0},"extraction":{"total_lf":{"value":None}},"summary":{"missing":["lf","height"],"needs_confirmation":[]}}
    pg.evaluate("window._sketchBase64='eA=='; window._sketchMime='image/jpeg'")
    pg.evaluate("extractMeasurements()"); pg.wait_for_timeout(600)
    vals = pg.evaluate("[...document.querySelectorAll('#edges-container .edge-len')].map(i=>i.value)")
    check("A typed 490 survives reader 0/undefined", vals[:1] == ["490"] and len(vals) == 1, vals)
    # B: reader returns a different positive run
    VP["resp"] = {"form_params":{"edges":[{"kind":"fence","length":480}],"height_ft":6,"walks":1},"extraction":{},"summary":{"missing":[],"needs_confirmation":[]}}
    pg.evaluate("extractMeasurements()"); pg.wait_for_timeout(600)
    vals = pg.evaluate("[...document.querySelectorAll('#edges-container .edge-len')].map(i=>i.value)")
    check("B typed 490 survives reader 480", vals == ["490"], vals)
    check("B untyped walk gates filled from reader", pg.evaluate("document.getElementById('wg').value") == "1")
    # B2: typed field kept
    pg.locator("#wg").fill(""); pg.locator("#wg").type("2")
    VP["resp"]["form_params"]["walks"] = 3
    pg.evaluate("extractMeasurements()"); pg.wait_for_timeout(600)
    check("B2 typed walk gates 2 survives reader 3", pg.evaluate("document.getElementById('wg').value") == "2")
    # C: no runs -> reader fills
    pg.evaluate("document.getElementById('edges-container').innerHTML=''; edgeN=0;")
    VP["resp"] = {"form_params":{"edges":[{"kind":"fence","length":490}]},"extraction":{},"summary":{"missing":[],"needs_confirmation":[]}}
    pg.evaluate("extractMeasurements()"); pg.wait_for_timeout(600)
    vals = pg.evaluate("[...document.querySelectorAll('#edges-container .edge-len')].map(i=>i.value)")
    check("C empty form gets reader 490", vals == ["490"], vals)
    # D: photo store needs KAN + PIN
    pg.evaluate("document.getElementById('ev-kan').value=''; document.getElementById('ev-pin').value='';")
    pg.evaluate("storeEvidencePhoto(new File([new Uint8Array([255,216,255])],'s.jpg',{type:'image/jpeg'}))"); pg.wait_for_timeout(300)
    st = pg.inner_text("#ev-store-st")
    check("D no KAN -> not stored + button", "Not stored yet" in st and pg.is_visible("#ev-store-btn"), st)
    pg.fill("#ev-kan", "kan004659"); pg.fill("#ev-pin", "Abc12345xy")
    pg.evaluate("storeEvidencePhoto(new File([new Uint8Array([255,216,255])],'s.jpg',{type:'image/jpeg'}))"); pg.wait_for_timeout(600)
    st = pg.inner_text("#ev-store-st")
    check("D stored with fingerprint", st.startswith("✓ Stored KAN004659/KAN004659_1.jpg"), st)
    check("D calls issue->finalize", [c["action"] for c in photo_calls][-2:] == ["issue","finalize"])
    # E: link_error surfaced
    VP["link_error"] = "no loop run 1234"
    pg.evaluate("window.HS_LOOP_RUN_ID='00000000-0000-0000-0000-000000000000'; storeEvidencePhoto(new File([new Uint8Array([255,216,255])],'s.jpg',{type:'image/jpeg'}))"); pg.wait_for_timeout(600)
    st = pg.inner_text("#ev-store-st")
    check("E link_error shown", "NOT linked to run" in st, st)
    check("E finalize carried loop_run_id", photo_calls[-1].get("loop_run_id") == "00000000-0000-0000-0000-000000000000")
    # F: PDF refused politely
    pg.evaluate("storeEvidencePhoto(new File(['x'],'q.pdf',{type:'application/pdf'}))"); pg.wait_for_timeout(200)
    check("F pdf not sent", "images only" in pg.inner_text("#ev-store-st"))
    # H: family not overwritten once chosen (old APPLY TO JOB path)
    before_untouched = pg.evaluate("document.getElementById('fam').value")
    pg.evaluate("extracted={styleHint:'chain_link'}; applyExtracted()")
    after_untouched = pg.evaluate("document.getElementById('fam').value")
    check("H untouched family can be set by reader", after_untouched != before_untouched, (before_untouched, after_untouched))
    pg.locator(".fam-tab[data-fam='ornamental']").click(); pg.wait_for_timeout(200)
    chosen = pg.evaluate("document.getElementById('fam').value")
    pg.evaluate("extracted={styleId:'chain_link.commercial.black'}; applyExtracted()")
    check("H chosen family kept", pg.evaluate("document.getElementById('fam').value") == chosen, chosen)
    # G: handleImg never blocks: store failing does not stop upload status
    check("G no page errors overall", not errs, errs[:3])
    pg.screenshot(path="calc_store.png", full_page=False)
    b.close()
print("FAILS:", fails); sys.exit(1 if fails else 0)
