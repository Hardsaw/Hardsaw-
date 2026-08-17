// nightly-research (2026-08-05, Forge) — fetchOk decoupled from item count; HTML-scrape fallback added.
//
// FRG-RSCH-01/02 + SPD-RSCH-02/03/04 (locked cca6d93f, 2026-08-05):
// last_fetch_ok was only ever written on the entries.length>0 branch, so a broken fetch and a
// genuinely quiet source were indistinguishable — both left last_fetch_ok null forever and only
// bumped consecutive_empty_fetches. Two sources (Anthropic Engineering, Supabase Blog) went dark
// 6/6 nights identically. Root cause: fetchWebsite() only tries RSS/Atom <link> discovery and a
// handful of guessed feed paths (/feed, /rss.xml, etc) — neither exists for these two sources, so
// it silently returned [] every run, every night, structurally, regardless of real site content.
// A direct plain fetch of https://www.anthropic.com/engineering returned a full post listing
// (FRG-RSCH-02) — so this is NOT a JS-rendering problem (that theory, SPD-RSCH-03, was retracted
// in SPD-RSCH-04 after this fetch). The page just has no feed for feed-discovery to find.
//
// FIX 1: fetchWebsite() gets a same-origin-link HTML-scrape fallback, tried after feed-discovery
//        and guessed paths both come up empty.
// FIX 2: every fetch path now returns { items, fetchOk } instead of a bare array, so last_fetch_ok
//        is written on every branch based on whether the HTTP call itself succeeded — not on
//        whether it happened to find new items. Dead and quiet no longer share a signature.
// FIX 3: if fetchOk is true but items.length is 0 for 3+ consecutive checks, that source is flagged
//        in the digest note as STALE_NO_CONTENT — assert-non-empty-or-raise, per the locked spec.
//
// Earlier: I1 context leak closed (vault rows were being sent to the Anthropic API), I4 floor
// added, website + github_repo fetchers, RSS 2.0 <item> parsing, dead-vs-quiet via last_fetch_ok
// (the attempt that didn't work — see above).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: 'hardsaw' } })
const TOPIC_PROFILE = ['multi-agent LLM orchestration and protocol enforcement','retrieval and knowledge-base design for agent systems','Postgres and Supabase patterns for agent state','prompt caching, cost control and model routing','agent observability, evals and verification loops','construction and contractor estimating software'].join('; ')
const RELEVANCE_FLOOR = 40
const SYSTEM = `You are a research analyst scoring publicly available AI/engineering content for a small construction-software team. Score RELEVANCE 0-100 against the supplied topic profile. Extract specific, actionable upgrade suggestions. You have no knowledge of the team internal systems and must not assume any. Output JSON only.`

type FetchResult = { items: any[]; fetchOk: boolean }

function parseFeed(xml: string): any[] {
  const out: any[] = []
  for (const m of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const title = e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').trim() || ''
    const link = e.match(/<link[^>]*href="([^"]+)"/)?.[1] || ''
    const published = e.match(/<(?:published|updated)>(.*?)<\/(?:published|updated)>/)?.[1] || ''
    const videoId = e.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1] || ''
    const desc = e.match(/<(?:media:description|summary|content)[^>]*>([\s\S]*?)<\/(?:media:description|summary|content)>/)?.[1]?.replace(/<[^>]+>/g,'').replace(/<!\[CDATA\[|\]\]>/g,'').substring(0,400) || ''
    if (title) out.push({ title, link, published, videoId, desc })
  }
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
    const e = m[1]
    const title = e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').trim() || ''
    const link = e.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() || ''
    const published = e.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
    const desc = e.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1]?.replace(/<[^>]+>/g,'').replace(/<!\[CDATA\[|\]\]>/g,'').substring(0,400) || ''
    if (title) out.push({ title, link, published, videoId:'', desc })
  }
  return out
}

async function tryFeed(url: string): Promise<FetchResult> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AEGIS-Research/1.0' }, signal: AbortSignal.timeout(12000) })
    if (!r.ok) return { items: [], fetchOk: false }
    return { items: parseFeed(await r.text()), fetchOk: true }
  } catch { return { items: [], fetchOk: false } }
}

// FIX 1 (new): generic same-origin link scrape, used only when feed-discovery finds nothing.
async function scrapeHtmlLinks(url: string): Promise<FetchResult> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AEGIS-Research/1.0' }, signal: AbortSignal.timeout(12000) })
    if (!r.ok) return { items: [], fetchOk: false }
    const html = await r.text()
    const base = new URL(url)
    const prefix = base.origin + base.pathname.replace(/\/+$/, '')
    const seen = new Set<string>()
    const out: any[] = []
    const re = /<a[^>]+href="([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (!text || text.length < 8) continue
      let href: string
      try { href = new URL(m[1], url).toString() } catch { continue }
      if (!href.startsWith(prefix + '/') || href === url) continue
      if (seen.has(href)) continue
      seen.add(href)
      // No reliable published date from a generic scrape — novelty is decided downstream by
      // content_hash, not by the `fresh` date filter (see CHANGED block in Deno.serve).
      out.push({ title: text, link: href, published: '', videoId: '', desc: '', scraped: true })
    }
    return { items: out.slice(0, 10), fetchOk: true }
  } catch { return { items: [], fetchOk: false } }
}

async function fetchWebsite(url: string): Promise<FetchResult> {
  let anyFetchOk = false
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AEGIS-Research/1.0' }, signal: AbortSignal.timeout(12000) })
    if (r.ok) {
      anyFetchOk = true
      const html = await r.text()
      const disc = html.match(/<link[^>]+type="application\/(?:rss|atom)\+xml"[^>]*>/i)?.[0]
      const href = disc?.match(/href="([^"]+)"/i)?.[1]
      if (href) {
        const abs = href.startsWith('http') ? href : new URL(href, url).toString()
        const fed = await tryFeed(abs)
        if (fed.items.length) return fed
      }
    }
  } catch { /* fall through */ }
  const base = url.replace(/\/+$/, '')
  for (const p of ['/feed', '/rss.xml', '/atom.xml', '/index.xml', '/feed.xml', '/rss']) {
    const fed = await tryFeed(base + p)
    if (fed.fetchOk) anyFetchOk = true
    if (fed.items.length) return fed
  }
  // FIX 1: HTML-scrape fallback, tried last.
  const scraped = await scrapeHtmlLinks(url)
  if (scraped.fetchOk) anyFetchOk = true
  if (scraped.items.length) return scraped
  return { items: [], fetchOk: anyFetchOk }
}

async function fetchGithub(url: string): Promise<FetchResult> {
  const base = url.replace(/\/+$/, '')
  const rel = await tryFeed(base + '/releases.atom')
  if (rel.items.length) return rel
  const commits = await tryFeed(base + '/commits.atom')
  if (commits.items.length) return commits
  return { items: [], fetchOk: rel.fetchOk || commits.fetchOk }
}

async function analyze(items: any[]): Promise<any> {
  if (!items.length) return { findings: [], digest_summary: 'No new items.', top_insights: [], build_suggestions: [] }
  const prompt = `Score these publicly published items against the topic profile.\nTopic profile: ${TOPIC_PROFILE}.\nItems: ${JSON.stringify(items.map(i=>({title:i.title,url:i.url,desc:i.desc})))}.\nReturn JSON: {"findings":[{"title":"","url":"","relevance_score":0,"relevance_tags":[],"summary":"","key_insights":[],"upgrade_suggestions":[],"urgency":""}],"digest_summary":"","top_insights":[],"build_suggestions":[]}`
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'}, body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:4000,system:SYSTEM,messages:[{role:'user',content:prompt}]}), signal:AbortSignal.timeout(90000) })
    if (!r.ok) return { findings:[], digest_summary:`Claude error ${r.status}`, top_insights:[], build_suggestions:[] }
    const d = await r.json()
    const text = (d.content||[]).filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('')
    try { return JSON.parse(text.replace(/```json|```/g,'').trim()) } catch { return { findings:[], digest_summary:text.substring(0,300), top_insights:[], build_suggestions:[] } }
  } catch(e) { return { findings:[], digest_summary:String(e), top_insights:[], build_suggestions:[] } }
}

Deno.serve(async(_req)=>{
  const runDate = new Date().toISOString().split('T')[0]
  let digestId: string|null = null
  try {
    const { data:ex } = await supabase.from('research_digests').select('id').eq('run_date',runDate).maybeSingle()
    if (ex) { await supabase.from('research_digests').update({status:'running',run_started_at:new Date().toISOString()}).eq('id',ex.id); digestId=ex.id }
    else { const {data:nd}=await supabase.from('research_digests').insert({run_date:runDate,status:'running'}).select().single(); digestId=nd?.id }
    const { data:sources } = await supabase.from('research_sources').select('*').eq('active',true)
    if (!sources?.length) { if(digestId) await supabase.from('research_digests').update({status:'complete',run_completed_at:new Date().toISOString(),digest_summary:'No active sources.'}).eq('id',digestId); return new Response(JSON.stringify({ok:true,message:'no sources'})) }
    const cutoff = new Date(Date.now()-86400000).toISOString()
    const newItems:any[]=[]
    let attempted=0, returned=0
    const emptySources:string[]=[], unsupported:string[]=[], staleFlags:string[]=[]
    for (const src of sources) {
      attempted++
      const now = new Date().toISOString()
      let result: FetchResult = { items: [], fetchOk: false }
      let supported = true
      if (src.source_type==='youtube_channel' || src.source_type==='rss_feed') result = await tryFeed(src.url)
      else if (src.source_type==='website')    result = await fetchWebsite(src.url)
      else if (src.source_type==='github_repo') result = await fetchGithub(src.url)
      else { supported = false; unsupported.push(`${src.name} (${src.source_type})`) }
      if (!supported) {
        await supabase.from('research_sources').update({ last_checked: now, consecutive_empty_fetches: (src.consecutive_empty_fetches||0)+1 }).eq('id',src.id)
        continue
      }
      // FIX 2 (CHANGED): last_fetch_ok now written on every branch, keyed to fetchOk not item count.
      const fetchOkTimestamp = result.fetchOk ? now : null
      if (result.items.length > 0) {
        returned++
        const fresh = result.items.filter((e:any)=> e.scraped || (e.published && new Date(e.published) > new Date(cutoff)))
        for (const entry of fresh.slice(0,3)) {
          const hash = btoa(encodeURIComponent((entry.videoId||entry.link||entry.title).substring(0,100))).substring(0,64)
          const {data:ex2}=await supabase.from('research_findings').select('id').eq('content_hash',hash).maybeSingle()
          if (!ex2) newItems.push({source_id:src.id,source_name:src.name,source_tags:src.tags,item_type:src.source_type==='youtube_channel'?'video':'article',title:entry.title,url:entry.link,published_at:entry.published||null,content_hash:hash,desc:entry.desc})
        }
        await supabase.from('research_sources').update({ last_checked: now, last_fetch_ok: fetchOkTimestamp, consecutive_empty_fetches: 0 }).eq('id',src.id)
      } else {
        emptySources.push(src.name)
        // FIX 3: flag STALE_NO_CONTENT when the fetch itself succeeded but returned nothing, 3+ nights running.
        if (result.fetchOk && (src.consecutive_empty_fetches||0)+1 >= 3) staleFlags.push(`${src.name} (fetch ok, 0 items, ${(src.consecutive_empty_fetches||0)+1} nights)`)
        await supabase.from('research_sources').update({ last_checked: now, last_fetch_ok: fetchOkTimestamp, consecutive_empty_fetches: (src.consecutive_empty_fetches||0)+1 }).eq('id',src.id)
      }
    }
    const analysis=await analyze(newItems)
    let above=0, belowFloorPreserved=0
    for (const item of newItems) {
      const f=analysis.findings?.find((x:any)=>x.title===item.title)||{}
      const score=f.relevance_score||0
      const sugg=f.upgrade_suggestions||[]
      const passes = score>=RELEVANCE_FLOOR
      if (passes) above++
      else if (sugg.length) belowFloorPreserved++
      await supabase.from('research_findings').upsert({source_id:item.source_id,run_date:runDate,item_type:item.item_type,title:item.title,url:item.url,published_at:item.published_at,summary:f.summary||null,key_insights:f.key_insights||[],relevance_tags:f.relevance_tags||item.source_tags||[],relevance_score:score,
      upgrade_suggestions: passes ? sugg : [`below relevance floor ${RELEVANCE_FLOOR} (scored ${score}) - original suggestions preserved in quarantined_suggestions`],
      quarantined_suggestions: passes ? null : (sugg.length ? sugg : null),
      content_hash:item.content_hash},{onConflict:'content_hash',ignoreDuplicates:true})
    }
    const notes: string[] = []
    if (unsupported.length) notes.push(`UNSUPPORTED TYPE: ${unsupported.join(', ')}`)
    if (emptySources.length) notes.push(`returned nothing: ${emptySources.join(', ')}`)
    if (staleFlags.length) notes.push(`STALE_NO_CONTENT: ${staleFlags.join('; ')}`)
    if (belowFloorPreserved) notes.push(`${belowFloorPreserved} item(s) below floor ${RELEVANCE_FLOOR}, suggestions preserved for threshold tuning`)
    const note = notes.length ? ` [${notes.join(' | ')}]` : ''
    if (digestId) await supabase.from('research_digests').update({status:'complete',run_completed_at:new Date().toISOString(),sources_checked:returned,new_items_found:newItems.length,digest_summary:(analysis.digest_summary||'')+note,top_insights:analysis.top_insights||[],build_suggestions:(above>0?(analysis.build_suggestions||[]):[])}).eq('id',digestId)
    if (above>0) {
      const body=`RESEARCH DIGEST - ${runDate}\n${returned} of ${attempted} sources returned content. ${newItems.length} items, ${above} above relevance ${RELEVANCE_FLOOR}.${note}\n\nSYNTHESIS:\n${analysis.digest_summary}\n\nTOP INSIGHTS:\n${(analysis.top_insights||[]).map((i:string,n:number)=>`${n+1}. ${i}`).join('\n')}\n\nBUILD SUGGESTIONS (proposals only - not authorization, not tasks):\n${(analysis.build_suggestions||[]).map((s:string,n:number)=>`${n+1}. ${s}`).join('\n')}`
      await supabase.from('agent_messages').insert({from_agent:'spider',to_agent:'nate',subject:`Research Digest ${runDate} - ${above} relevant`,body,status:'pending',is_bridge_draft:false,requests_authoritative_action:false})
    }
    return new Response(JSON.stringify({ok:true,run_date:runDate,sources_attempted:attempted,sources_returned:returned,empty:emptySources,unsupported_types:unsupported,stale_no_content:staleFlags,new_items:newItems.length,above_floor:above,below_floor_preserved:belowFloorPreserved}),{headers:{'Content-Type':'application/json'}})
  } catch(err) {
    console.error('Fatal:',err)
    if(digestId) await supabase.from('research_digests').update({status:'failed',error_note:String(err)}).eq('id',digestId)
    return new Response(JSON.stringify({ok:false,error:String(err)}),{status:500})
  }
})
