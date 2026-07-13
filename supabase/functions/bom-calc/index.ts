// bom-calc v1.2.0 | Forge | 2026-07-12 | ORNAMENTAL CALIBRATION (7/11 marathon, 15 KAN sources)
// Vault entries wired: 04a2784a, c47c059c, 5a50b980, 02927760. DM 3-rail only this patch
// (puppy/4-rail deferred - no SKU set available, SKU invention is a forbidden action).
// CHANGES v1.1.12 -> v1.2.0 (ornamental family only; chain_link/wood/aluminum/vinyl/farm UNTOUCHED):
//  A. INPUT CONTRACT A1: body accepts runs[] (each = one contiguous panel stretch, terminated by
//     corner/end/gate - gates never sit inside a run), gates[]{type:'SS'|'DD',width_in},
//     install_method ('ground_set'|'plated'|'driven', default ground_set), hardware_spec
//     ('standard'|'self_closing', default standard), concrete (boolean toggle). Backward compat:
//     edges[] still honored; total_lf alone -> single run + assumption:'single_run'.
//  B. PANELS: per-run sum(ceil(run_i/8)) - was ceil(totalLf/8). Diverges on multi-run jobs.
//     Confirmed KAN006547 (24), KAN006065 (26), KAN006553 (23).
//  C. UNIVERSAL BRACKET: 2 x runs.length x rails (algebraically == hookups x rails, hookups=2*runs).
//  D. CAPS: = posts on ALL install methods, no exceptions (Nate 2026-07-12). LINE BRACKET unchanged.
//  E. INSTALL METHOD (v1.2.1 corrections):
//     - driven: post steps UP to the next fence-height tier's real product_skus post (ht+2, then
//       ht+3/ht+4). 4ft->6ft=8W12P93. No invented length/offset. DRIVEN_POST_LENGTH_UNVERIFIED removed.
//     - plated: stock post + plate + weld_labor. Plate 20089 (4x4) default, 20090 (6x6) via plate_sku.
//       20089/20090 selection rule UNMAPPED -> plated line-items provisional:true +
//       PLATED_PLATE_SELECTION_UNMAPPED finding (no longer silently READY).
//  F. CONCRETE: independent boolean toggle, decoupled from install_method (Nate 2026-07-12).
//     qty = posts, provisional:true (n=2). Default ON when unspecified.
//  G. GATE HW (standard) unchanged - already matches doctrine (8HB403=SS+2DD, 8HB404=2SS+6DD,
//     8HB301=gates, 8HB402=SS fork, 8HB401=DD fork, 8HB316=DD cane). self_closing REPLACES that
//     block with 50383(PR)xgates + 50139xgates.
// ---- prior header (v1.1.11/12) retained below for provenance ----
// FIX: bracing decoupled from truss_spec (3 sources: KAN005646, KAN002574, KAN002429-isolated).
// Default braced_hookups = ALL hookups now, independent of truss flag. truss_spec only adds the
// rod/bracket items on top. Real jobs with partial bracing need explicit braced_hookups override -
// this default is the best single number absent that info, not a claim every job braces 100%.
// FLAGGED NOT FIXED: 're' (rail end) formula is unchanged and NOT re-validated against this new
// default. Needs a fresh loop-testing pass next session before trusting re output on braced jobs.
// SCOPE DISCIPLINE: only shipping the cleanly-evidenced piece (bracing itself) tonight, not
// guessing at the interconnected re formula on incomplete data - same lesson as the v1.1.9/10 cycle.
// CORRECTION to v1.1.9 #19: universal bracket REVERTED to hookups*rails. The v1.1.9 change
// (ends*3+corners*6+gateposts*6) was algebraically IDENTICAL to hookups*rails for every open-
// chain test case used to "solve" it (ends=2, no gates) - the formulas only diverge on gates
// (3x vs 6x per gatepost) or fully closed loops (ends=0), NEITHER of which was ever cleanly
// tested. The v1.1.9 fix was unfalsified but also unfalsifiable given the data available.
// Nate's own handwritten source note on KAN004867 confirms the SIMPLER original directly:
// "hookup x 3Rail = 42 UNV" (7-segment real job, 14 hookups x 3 = 42 exact). Reverting to the
// safer, source-confirmed formula. Gate-inclusive and closed-loop cases remain genuinely open -
// if a future KAN shows a gate-heavy or closed-loop job where hookups*rails is wrong, revisit.
// LESSON: two "confirming" isolated tests aren't independent evidence if they can't algebraically
// distinguish the hypothesis from its alternative - check the math structure, not just the fit.

function H(s:string):string{let h=0xDEADBEEF;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),2654435761);return((h>>>0)^(h>>>16)).toString(16).toUpperCase().padStart(8,'0');}
interface Edge{kind:'fence'|'opening';length:number;}
interface BomItem{sku:string|null;unit:string;label:string;qty:number;group:string;formula:string;provisional?:boolean;sku_status?:'confirmed'|'unconfirmed';}
interface Gate{type:string;width_in?:number;}
interface CalcInput{style_id?:string;family?:string;rails?:number;pool_code?:boolean;edges:Edge[];height_ft:number;ends:number;corners:number;walks:number;drives:number;others:number;flags:string[];lp_override?:number;hookup_override?:number;braced_hookups?:number;runs?:number[];gates?:Gate[];install_method?:string;hardware_spec?:string;concrete?:boolean;plate_sku?:string;total_lf?:number;}
const ST:Record<string,any>={
'ornamental.steel.flat_top_3rail':{family:'ornamental',label:'Ornamental Steel Flat Top 3-Rail (DM)',rp:{S:8,rails:3,con_line:1,con_term:2,bracket_system:'integrated'},skus:{panel:{s:'8W14X83FT',u:'each',d:'DM Blk Flat Top 3 Rail Panel 4x8'},post:{s:'8W12P69',u:'each',d:'Blk Sq Post 2in x 69in'},post_ht:{4:{s:'8W12P69',u:'each',d:'Blk Sq Post 2in x 69in (4ft)'},5:{s:'8W12P81',u:'each',d:'Blk Sq Post 2in x 81in (5ft)'},6:{s:'8W12P93',u:'each',d:'Blk Sq Post 2in x 93in (6ft)'}},cap:{s:'8AB506',u:'each',d:'Blk Flat Cap 2in'},bracket_univ:{s:'8BB102IWI',u:'each',d:'Blk Universal Bracket'},bracket_line:{s:'8BFLINE00',u:'each',d:'AFS Beta Blk Line Bracket'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},wg:{s:'DM4X4BLKFT',u:'each',d:'DM Gate Single Swing Black'},dg:{s:'DM4X4BLKFT-DD',u:'each',d:'DM Gate DD Black'},hinge:{s:'8HB403',u:'each',d:'Hinge Male 2in'},hingef:{s:'8HB404',u:'each',d:'Hinge Female 1-1/4in'},latch:{s:'8HB402',u:'each',d:'Latch Fork SS 2in'},latch_dd:{s:'8HB401',u:'each',d:'Latch Fork DD Center 1-1/4in'},cane_bolt:{s:'8HB316',u:'each',d:'Cane Bolt 48in'},lhanger:{s:'8HB301',u:'each',d:'Latch Hanger'}}},
'ornamental.steel.spear_top_3rail':{family:'ornamental',label:'Ornamental Steel Spear Top 3-Rail (DM)',rp:{S:8,rails:3,con_line:1,con_term:2,bracket_system:'integrated'},skus:{panel:{s:'8W15X83SP',u:'each',d:'DM Blk Spear Top 3 Rail Panel 5x8'},post:{s:'8W12P93',u:'each',d:'Blk Sq Post 2in x 96in'},cap:{s:'8AB506',u:'each',d:'Blk Flat Cap 2in'},bracket_univ:{s:'8BB102IWI',u:'each',d:'Blk Universal Bracket'},bracket_line:{s:'8BFLINE00',u:'each',d:'AFS Beta Blk Line Bracket'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},wg:{s:'DM5X5BLKFT',u:'each',d:'DM Gate 5W x 5H Spear Top Black'},dg:{s:'DM5X5BLKFT-DD',u:'each',d:'DM Gate DD Spear Top Black'},hinge:{s:'8HB403',u:'each',d:'Hinge Male 2in'},hingef:{s:'8HB404',u:'each',d:'Hinge Female 1-1/4in'},latch:{s:'8HB402',u:'each',d:'Latch Fork SS 2in'},latch_dd:{s:'8HB401',u:'each',d:'Latch Fork DD Center 1-1/4in'},cane_bolt:{s:'8HB316',u:'each',d:'Cane Bolt 48in'},lhanger:{s:'8HB301',u:'each',d:'Latch Hanger'}}},
'ornamental.steel.flat_top_pool':{family:'ornamental_pool',label:'Ornamental Steel Flat Top Pool (DM)',rp:{S:8,rails:3,con_line:1,con_term:2,pool:true,bracket_system:'integrated'},skus:{panel:{s:'8W14X83FT',u:'each',d:'DM Blk Flat Top 3 Rail Panel 4x8'},post:{s:'8W12P69',u:'each',d:'Blk Sq Post 2in x 69in'},post_ht:{4:{s:'8W12P69',u:'each',d:'Blk Sq Post 2in x 69in (4ft)'},5:{s:'8W12P81',u:'each',d:'Blk Sq Post 2in x 81in (5ft)'},6:{s:'8W12P93',u:'each',d:'Blk Sq Post 2in x 93in (6ft)'}},cap:{s:'8AB506',u:'each',d:'Blk Flat Cap 2in'},bracket_univ:{s:'8BB102IWI',u:'each',d:'Blk Universal Bracket'},bracket_line:{s:'8BFLINE00',u:'each',d:'AFS Beta Blk Line Bracket'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},wg:{s:'DM4X4BLKFT',u:'each',d:'DM Gate Single Swing Black'},hinge:{s:'50383',u:'pair',d:'Hinge Fully Adjustable Self Closing'},latch:{s:'50139',u:'each',d:'Blk Latch Magna Top Pullback'}}},
'chain_link.residential.galvanized':{family:'chain_link',label:'Chain Link Res. Galvanized',rp:{S:10,fab_roll:50,rail_stick:21,con_line:1,con_term:1},skus:{tp:{s:'AF-TP-6-237',u:'each',d:'Terminal Post 2-1/2in Galv'},lp:{s:'AF-LP-6-162',u:'each',d:'Line Post 1-5/8in Galv'},lp2:{s:'AF-LP-2IN',u:'each',d:'Line Post 2in Galv (Resi 5-6ft)'},lt:{s:'10201',u:'each',d:'Loop Cap 1-3/8in Alum'},lt2:{s:'10214',u:'each',d:'Line Top 2in x 1-5/8in Steel'},fab:{s:'AF-FAB-6-50',u:'roll',d:'Fabric 50ft Roll Galv'},rail:{s:'AF-TR-21',u:'each',d:'Top Rail 21ft'},tw:{s:'20081',u:'ft',d:'Tension Wire 7Ga Crimped'},hog:{s:'11143',u:'lb',d:'Hog Rings 9Ga'},tie:{s:'AF-TIE-250',u:'bag',d:'Tie Wire Bag'},tb:{s:'10406',u:'each',d:'Tension Band 2-1/2in'},eb:{s:'10456',u:'each',d:'End Band 2-1/2in'},re:{s:'10703',u:'each',d:'Rail End 1-3/8in Alum'},tb4:{s:'11003',u:'each',d:'Tension Bar 4ft'},tb5:{s:'11004',u:'each',d:'Tension Bar 5ft 60in'},tb6:{s:'11015',u:'each',d:'Tension Bar 6ft'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},cb:{s:'11170',u:'each',d:'Carriage Bolt 5/16in'},wg:{s:'AF-WG-4',u:'each',d:'Walk Gate'},dg:{s:'AF-DG-12',u:'each',d:'Drive Gate'}}},
'chain_link.residential.black':{family:'chain_link',label:'Chain Link Res. Black',rp:{S:10,fab_roll:50,rail_stick:21,con_line:1,con_term:1},skus:{tp:{s:'AF-TP-6-BK',u:'each',d:'Terminal Post Black'},lp:{s:'AF-LP-6-BK',u:'each',d:'Line Post 1-5/8in Black'},lp2:{s:'AF-LP-2IN-BK',u:'each',d:'Line Post 2in Black (Resi 5-6ft)'},lt:{s:'10201B',u:'each',d:'Loop Cap 1-3/8in Alum Black'},lt2:{s:'10214B',u:'each',d:'Line Top 2in x 1-5/8in Steel Black'},fab:{s:'AF-FAB-6-BK-50',u:'roll',d:'Fabric Black 50ft'},rail:{s:'AF-TR-21-BK',u:'each',d:'Top Rail Black 21ft'},tw:{s:'20081B',u:'ft',d:'Tension Wire 7Ga Black'},hog:{s:'11143B',u:'lb',d:'Hog Rings 9Ga Black'},tie:{s:'AF-TIE-BK',u:'bag',d:'Tie Wire Black'},tb:{s:'10406-BK',u:'each',d:'Tension Band Black'},eb:{s:'10456-BK',u:'each',d:'End Band Black'},re:{s:'10703-BK',u:'each',d:'Rail End Black'},tb4:{s:'11003-BK',u:'each',d:'Tension Bar 4ft Black'},tb5:{s:'11004-BK',u:'each',d:'Tension Bar 5ft 60in Black'},tb6:{s:'11015-BK',u:'each',d:'Tension Bar 6ft Black'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},cb:{s:'11170B',u:'each',d:'Carriage Bolt Black'},wg:{s:'AF-WG-4-BK',u:'each',d:'Walk Gate Black'},dg:{s:'AF-DG-12-BK',u:'each',d:'Drive Gate Black'}}},
'chain_link.commercial.galvanized':{family:'chain_link_commercial',label:'Chain Link Comm. Galv',rp:{S:10,fab_roll:50,rail_stick:21,con_per_post:0},skus:{fab:{s:'CL-COM-FAB-6-9GA',u:'ft',d:'Fabric 9ga Galv'},rail:{s:'CL-COM-TR-158-21',u:'ft',d:'Top Rail Galv (ft)'},tp3:{s:'CL-COM-TP-3IN',u:'each',d:'Terminal Post 3in Corner Galv'},tc3:{s:'CL-COM-CAP-3',u:'each',d:'Terminal Cap 3in Galv'},tp4:{s:'CL-COM-TP-4IN',u:'each',d:'Terminal Post 4in End/Gate Galv'},tc4:{s:'CL-COM-CAP-4',u:'each',d:'Terminal Cap 4in Galv'},lp:{s:'CL-COM-LP-2',u:'each',d:'Line Post 2-1/2in Commercial Galv'},lp2:{s:'CL-COM-LP-2IN',u:'each',d:'Line Post 2in Commercial Galv (<5ft)'},lt:{s:'CL-COM-LT-212',u:'each',d:'Line Top 2-1/2in Galv'},lt2:{s:'10214',u:'each',d:'Line Top 2in x 1-5/8in Steel'},bar:{s:'11015',u:'each',d:'Tension Bar 6ft Galv'},bar8:{s:'11017',u:'each',d:'Tension Bar 8ft Galv'},tb3:{s:'10417',u:'each',d:'Tension Band 3in Galv'},tb4:{s:'10419',u:'each',d:'Tension Band 4in Galv'},eb3:{s:'10467',u:'each',d:'End Band 3in Galv'},eb25:{s:'10456',u:'each',d:'End Band 2-1/2in Galv'},re:{s:'10709',u:'each',d:'Rail End 1-5/8in Steel Combo'},tie:{s:'11132',u:'ea',d:'Ties 9Ga Alum'},tw:{s:'20081',u:'ft',d:'Tension Wire 7Ga'},hog:{s:'11143',u:'lb',d:'Hog Rings 9Ga'},bb:{s:'10996',u:'each',d:'Truss Rod Brace'},trt:{s:'10997',u:'each',d:'Truss Rod 12ft'},barb:{s:'20074',u:'ft',d:'Barb Wire 4pt'},arm:{s:'10309',u:'each',d:'Barb Wire Arm 3-Strand 45Deg'},bolt:{s:'11170',u:'each',d:'Carriage Bolt'},hinge:{s:'10833',u:'each',d:'Bulldog Hinge Galv'},latch:{s:'10901',u:'each',d:'Commercial Latch Galv'},drop:{s:'10923',u:'each',d:'Drop Rod Galv'},cgate:{s:'CANT-GATE',u:'each',d:'Cantilever Gate (opening+counterbalance)'},croll:{s:'10957',u:'each',d:'Cantilever Roller 4in (covers integrated)'},crecv:{s:'10969',u:'each',d:'Cantilever Receiver American 4in'},wg:{s:'CL-COM-WG',u:'each',d:'Walk Gate Commercial Galv'},dg:{s:'CL-COM-DG',u:'each',d:'Drive Gate Commercial Galv'}}},
'chain_link.commercial.black':{family:'chain_link_commercial',label:'Chain Link Comm. Black',rp:{S:10,fab_roll:50,rail_stick:21,con_per_post:0},skus:{fab:{s:'CL-COM-FAB-6-9GA-BK',u:'ft',d:'Fabric 9ga Black'},rail:{s:'CL-COM-TR-158-21-BK',u:'ft',d:'Top Rail Black (ft)'},tp3:{s:'CL-COM-TP-3IN-BK',u:'each',d:'Terminal Post 3in Corner Black'},tc3:{s:'CL-COM-CAP-3-BK',u:'each',d:'Terminal Cap 3in Black'},tp4:{s:'CL-COM-TP-4IN-BK',u:'each',d:'Terminal Post 4in End/Gate Black'},tc4:{s:'CL-COM-CAP-4-BK',u:'each',d:'Terminal Cap 4in Black'},lp:{s:'CL-COM-LP-2-BK',u:'each',d:'Line Post 2-1/2in Commercial Black'},lp2:{s:'CL-COM-LP-2IN-BK',u:'each',d:'Line Post 2in Commercial Black (<5ft)'},lt:{s:'CL-COM-LT-212-BK',u:'each',d:'Line Top 2-1/2in Black'},lt2:{s:'10214B',u:'each',d:'Line Top 2in x 1-5/8in Steel Black'},bar:{s:'11015-BK',u:'each',d:'Tension Bar 6ft Black'},bar8:{s:'11017-BK',u:'each',d:'Tension Bar 8ft Black'},tb3:{s:'10417-BK',u:'each',d:'Tension Band 3in Black'},tb4:{s:'10419-BK',u:'each',d:'Tension Band 4in Black'},eb3:{s:'10467-BK',u:'each',d:'End Band 3in Black'},eb25:{s:'10456-BK',u:'each',d:'End Band 2-1/2in Black'},re:{s:'10709-BK',u:'each',d:'Rail End Black'},tie:{s:'11132-BK',u:'ea',d:'Ties 9Ga Black'},tw:{s:'20081B',u:'ft',d:'Tension Wire 7Ga Black'},hog:{s:'11143B',u:'lb',d:'Hog Rings 9Ga Black'},bb:{s:'10996-BK',u:'each',d:'Truss Rod Brace Black'},trt:{s:'10997-BK',u:'each',d:'Truss Rod 12ft Black'},barb:{s:'20074-BK',u:'ft',d:'Barb Wire 4pt Black'},arm:{s:'10309-BK',u:'each',d:'Barb Wire Arm 3-Strand Black'},bolt:{s:'11170B',u:'each',d:'Carriage Bolt Black'},hinge:{s:'10835-BK',u:'each',d:'Bulldog Hinge Black'},latch:{s:'10888-BK',u:'each',d:'Commercial Latch Black'},drop:{s:'10922-BK',u:'each',d:'Drop Rod Black'},cgate:{s:'CANT-GATE-BK',u:'each',d:'Cantilever Gate Black'},croll:{s:'10957',u:'each',d:'Cantilever Roller 4in (covers integrated)'},crecv:{s:'10969',u:'each',d:'Cantilever Receiver American 4in'},wg:{s:'CL-COM-WG-BK',u:'each',d:'Walk Gate Commercial Black'},dg:{s:'CL-COM-DG-BK',u:'each',d:'Drive Gate Commercial Black'}}},
'wood.privacy.tight_cedar':{family:'wood',label:'Wood Solid Privacy 6ft',rp:{S:8,picket_pitch:5.5,waste_lo:1.05,waste_hi:1.08,rails_sec:3,walk_rb:2,drive_rb:3,con_line:1,con_term:1},skus:{picket:{s:'61563',u:'each',d:'Cedar Picket 5/8x5-1/2x6'},post:{s:'64489',u:'each',d:'4x4x8 Green Treated Post'},rail:{s:'62486',u:'each',d:'2x4x8 Wrc Rail'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},hinge:{s:'10910',u:'pair',d:'Gate Strap Hinge Pair'},latch:{s:'10914',u:'each',d:'Gate Paddle Latch'},rod:{s:'10918',u:'each',d:'Gate Drop Rod 48in'},frame:{s:'CHAINLINK-WGF',u:'each',d:'Metal Wood-Gate Frame'},wg:{s:'63978',u:'each',d:'Walk Gate'},dg:{s:'63979',u:'each',d:'Drive Gate'}}},
'wood.privacy.shadowbox':{family:'wood',label:'Wood Shadowbox 6ft',rp:{S:8,picket_pitch:3.5,waste_lo:1.02,waste_hi:1.02,waste_mode:'flat',rails_sec:3,walk_rb:2,drive_rb:3,con_line:1,con_term:1},skus:{picket:{s:'61563',u:'each',d:'Cedar Picket 5/8x5-1/2x6'},post:{s:'64489',u:'each',d:'4x4x8 Green Treated Post'},rail:{s:'62486',u:'each',d:'2x4x8 Wrc Rail'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},hinge:{s:'10910',u:'pair',d:'Gate Strap Hinge Pair'},latch:{s:'10914',u:'each',d:'Gate Paddle Latch'},rod:{s:'10918',u:'each',d:'Gate Drop Rod 48in'},frame:{s:'CHAINLINK-WGF',u:'each',d:'Metal Wood-Gate Frame'},wg:{s:'63978',u:'each',d:'Walk Gate'},dg:{s:'63979',u:'each',d:'Drive Gate'}}},
'wood.privacy.french_gothic':{family:'wood',label:'Wood French Gothic 6ft',rp:{S:6,picket_pitch:4,waste_lo:1.02,waste_hi:1.02,waste_mode:'flat',rails_sec:3,walk_rb:2,drive_rb:3,con_line:1,con_term:1},skus:{picket:{s:'WOODSALES-FG',u:'each',d:'French Gothic Picket 1x4x6'},post:{s:'WOODSALES-FGPOST',u:'each',d:'4x4x8 French Gothic Post'},rail:{s:'62486',u:'each',d:'2x4x8 Wrc Rail'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},hinge:{s:'10910',u:'pair',d:'Gate Strap Hinge Pair'},latch:{s:'10914',u:'each',d:'Gate Paddle Latch'},rod:{s:'10918',u:'each',d:'Gate Drop Rod 48in'},wg:{s:'63978',u:'each',d:'Walk Gate'},dg:{s:'63979',u:'each',d:'Drive Gate'}}},
'wood.privacy.spaced':{family:'wood',label:'Wood Spaced Picket 6ft',rp:{S:8,picket_pitch:5.5,waste_lo:1.05,waste_hi:1.08,rails_sec:3,walk_rb:2,drive_rb:3,con_line:1,con_term:1},skus:{picket:{s:'61564',u:'each',d:'Cedar Picket 3.5in Spaced'},post:{s:'64489',u:'each',d:'4x4x8 Green Treated Post'},rail:{s:'62486',u:'each',d:'2x4x8 Wrc Rail'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'},hinge:{s:'10910',u:'pair',d:'Gate Strap Hinge Pair'},latch:{s:'10914',u:'each',d:'Gate Paddle Latch'},rod:{s:'10918',u:'each',d:'Gate Drop Rod 48in'},frame:{s:'CHAINLINK-WGF',u:'each',d:'Metal Wood-Gate Frame'},wg:{s:'63978',u:'each',d:'Walk Gate'},dg:{s:'63979',u:'each',d:'Drive Gate'}}}
};
// v1.3.0 ORNAMENTAL FAMILY DECOMPOSITION (Nate architecture correction 2026-07-12):
// rail count (2/3/4) and pool-code are ORTHOGONAL inputs, not baked style_ids. A "family" carries
// only the silhouette (flat_top/spear_top) + rail/height-independent shared SKUs. Panel/post SKUs
// are a function of (family, rails, height): confirmed where a real vaulted quote exists, else
// sku:null + generic description + sku_status:'unconfirmed' — quantity is STILL computed by the
// existing formulas (bracket=2*runs*rails, panels=Sum ceil(run/S)); SKU is not a build blocker.
// This layer only REORGANIZES data + resolves an effective style object; it re-derives no formula.
const FAM:Record<string,any>={
'ornamental.steel.flat_top':{base_family:'ornamental',silhouette:'Flat Top',label:'Ornamental Steel Flat Top (DM)',
  rp:{S:8,con_line:1,con_term:2,bracket_system:'integrated'},
  confirmed_rails:[3],confirmed_heights:[4,5,6],
  panel_conf:{s:'8W14X83FT',u:'each',d:'DM Blk Flat Top 3 Rail Panel 4x8'},
  post_conf:{s:'8W12P69',u:'each',d:'Blk Sq Post 2in x 69in'},
  post_ht_conf:{4:{s:'8W12P69',u:'each',d:'Blk Sq Post 2in x 69in (4ft)'},5:{s:'8W12P81',u:'each',d:'Blk Sq Post 2in x 81in (5ft)'},6:{s:'8W12P93',u:'each',d:'Blk Sq Post 2in x 93in (6ft)'}},
  shared:{cap:{s:'8AB506',u:'each',d:'Blk Flat Cap 2in'},bracket_univ:{s:'8BB102IWI',u:'each',d:'Blk Universal Bracket'},bracket_line:{s:'8BFLINE00',u:'each',d:'AFS Beta Blk Line Bracket'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'}},
  gate_std:{wg:{s:'DM4X4BLKFT',u:'each',d:'DM Gate Single Swing Black'},dg:{s:'DM4X4BLKFT-DD',u:'each',d:'DM Gate DD Black'},hinge:{s:'8HB403',u:'each',d:'Hinge Male 2in'},hingef:{s:'8HB404',u:'each',d:'Hinge Female 1-1/4in'},latch:{s:'8HB402',u:'each',d:'Latch Fork SS 2in'},latch_dd:{s:'8HB401',u:'each',d:'Latch Fork DD Center 1-1/4in'},cane_bolt:{s:'8HB316',u:'each',d:'Cane Bolt 48in'},lhanger:{s:'8HB301',u:'each',d:'Latch Hanger'}},
  gate_pool:{wg:{s:'DM4X4BLKFT',u:'each',d:'DM Gate Single Swing Black'},hinge:{s:'50383',u:'pair',d:'Hinge Fully Adjustable Self Closing'},latch:{s:'50139',u:'each',d:'Blk Latch Magna Top Pullback'}}},
'ornamental.steel.spear_top':{base_family:'ornamental',silhouette:'Spear Top',label:'Ornamental Steel Spear Top (DM)',
  rp:{S:8,con_line:1,con_term:2,bracket_system:'integrated'},
  confirmed_rails:[3],confirmed_heights:[4,5,6,7,8],
  panel_conf:{s:'8W15X83SP',u:'each',d:'DM Blk Spear Top 3 Rail Panel 5x8'},
  post_conf:{s:'8W12P93',u:'each',d:'Blk Sq Post 2in x 96in'},
  shared:{cap:{s:'8AB506',u:'each',d:'Blk Flat Cap 2in'},bracket_univ:{s:'8BB102IWI',u:'each',d:'Blk Universal Bracket'},bracket_line:{s:'8BFLINE00',u:'each',d:'AFS Beta Blk Line Bracket'},con:{s:'CL-CON-60',u:'bag',d:'Concrete 60lb'}},
  gate_std:{wg:{s:'DM5X5BLKFT',u:'each',d:'DM Gate 5W x 5H Spear Top Black'},dg:{s:'DM5X5BLKFT-DD',u:'each',d:'DM Gate DD Spear Top Black'},hinge:{s:'8HB403',u:'each',d:'Hinge Male 2in'},hingef:{s:'8HB404',u:'each',d:'Hinge Female 1-1/4in'},latch:{s:'8HB402',u:'each',d:'Latch Fork SS 2in'},latch_dd:{s:'8HB401',u:'each',d:'Latch Fork DD Center 1-1/4in'},cane_bolt:{s:'8HB316',u:'each',d:'Cane Bolt 48in'},lhanger:{s:'8HB301',u:'each',d:'Latch Hanger'}},
  gate_pool:{wg:{s:'DM5X5BLKFT',u:'each',d:'DM Gate 5W x 5H Spear Top Black'},hinge:{s:'50383',u:'pair',d:'Hinge Fully Adjustable Self Closing'},latch:{s:'50139',u:'each',d:'Blk Latch Magna Top Pullback'}}}
};
// Build an effective style object (same shape ST[] entries have) from orthogonal inputs.
// pool_code:true routes to the existing 'ornamental_pool' code path (50383/50139 self-closing) so
// output is byte-identical to the legacy pool style at confirmed combos; false uses standard HW.
function resolveStyle(famId:string,rails:number,ht:number,pool:boolean):any{
  const F=FAM[famId];if(!F)return null;
  const conf=(F.confirmed_rails||[]).includes(rails)&&(F.confirmed_heights||[]).includes(ht);
  const railWord=rails+'-Rail';const nomW=F.rp.S+'ft nominal width';
  const panel=conf?{...F.panel_conf,status:'confirmed'}
    :{s:null,u:'each',d:`${ht}ft ${railWord} ${F.silhouette} Panel, ${nomW}`,status:'unconfirmed'};
  const post=conf?{...F.post_conf,status:'confirmed'}
    :{s:null,u:'each',d:`${ht}ft Post (2in sq) — ${railWord} ${F.silhouette}`,status:'unconfirmed'};
  let post_ht:any=undefined;
  if(F.post_ht_conf){post_ht={};for(const h of Object.keys(F.post_ht_conf)){post_ht[h]=conf?{...F.post_ht_conf[h],status:'confirmed'}:{s:null,u:'each',d:`${h}ft Post (2in sq) — ${railWord} ${F.silhouette}`,status:'unconfirmed'};}}
  const gate=pool?F.gate_pool:F.gate_std;
  const skus:any={panel,post,...(post_ht?{post_ht}:{}),...F.shared,...gate};
  const rp:any={...F.rp,rails,...(pool?{pool:true}:{})};
  return{family:pool?'ornamental_pool':F.base_family,base_family:F.base_family,silhouette:F.silhouette,
    label:`${F.label} ${railWord}${pool?' — Pool':''}`,rp,skus,resolved:true,confirmed:conf,pool_code:pool,rails};
}
function cA(edges:Edge[]){const fe=edges.filter(e=>e.kind==='fence'),oe=edges.filter(e=>e.kind==='opening');const bL=fe.reduce((s,e)=>s+e.length,0),oL=oe.reduce((s,e)=>s+e.length,0);return{fenceEdges:fe,openingEdges:oe,buildLft:bL,openingLft:oL,totalLft:bL+oL,geoHash:H(edges.map(e=>e.kind+':'+e.length).join('|'))};}
function cB(geo:ReturnType<typeof cA>,ends:number,corners:number,walks:number,drives:number,others:number,Sp:number,lpO=0,hkO=0){const gp=(walks+drives+others)*2,tp=ends+corners+gp;const lpA=geo.fenceEdges.map(e=>Math.max(0,Math.ceil(e.length/Sp)-1));const lp=lpA.reduce((a,b)=>a+b,0);const lpC=geo.openingEdges.reduce((s,e)=>s+Math.max(0,Math.ceil(e.length/Sp)-1),0);let lpAdj=Math.max(0,lp-lpC);const sA=geo.fenceEdges.map(e=>Math.ceil(e.length/Sp));const ts=sA.reduce((a,b)=>a+b,0);let hookups=2*geo.fenceEdges.length;if(lpO>0)lpAdj=lpO;if(hkO>0)hookups=hkO;return{terminalPosts:tp,linePosts:lpAdj,linePosts_raw:lp,gatePosts:gp,endPosts:ends,cornerPosts:corners,walkGates:walks,driveGates:drives,otherGates:others,hookups,totalSecs:ts,totalPosts:tp+lpAdj,lpArr:lpA,secsArr:sA,Sp,F:{tp:`${ends}e+${corners}c+${(walks+drives+others)}g*2=${tp}`,lp:`sum=${lp} corr=${lpC} adj=${lpAdj}`}};}
function cF(posts:ReturnType<typeof cB>,rp:any,family:string){if(family==='wood'){const b=posts.totalPosts*rp.con_line;return{totalBags:b,F:`${posts.totalPosts}x${rp.con_line}=${b}`};}if(family==='chain_link_commercial')return{totalBags:0,F:'no concrete commercial'};const b=Math.ceil(posts.linePosts*rp.con_line+posts.terminalPosts*rp.con_term);return{totalBags:b,F:`${posts.linePosts}x${rp.con_line}+${posts.terminalPosts}x${rp.con_term}=${b}`};}
function cD(style:any,geo:ReturnType<typeof cA>,posts:ReturnType<typeof cB>,conc:ReturnType<typeof cF>,ht:number,flags:string[],opts:{braced_hookups?:number;install_method?:string;hardware_spec?:string;concrete?:boolean;plate_sku?:string}={}):BomItem[]{const rp=style.rp,sk=style.skus,fam=style.family;const bom:BomItem[]=[],lf=geo.buildLft,tp=posts.terminalPosts,lp=posts.linePosts;const ts=posts.totalSecs,walks=posts.walkGates,drives=posts.driveGates,others=posts.otherGates||0,hookups=posts.hookups;const ends=posts.endPosts,corners=posts.cornerPosts;const fl=flags||[];const hasTW=fl.includes('tension_wire');const hasTruss=fl.includes('truss_spec')||fl.includes('truss');const hasBarb=fl.includes('barb_wire');const hasCant=fl.includes('cantilever');
function add(sku:any,qty:number,label:string,formula:string,grp:string){qty=Math.ceil(qty);if(qty<=0)return;const item:BomItem={sku:(sku.s??null),unit:sku.u,label:label||sku.d,qty,group:grp,formula};if(sku.status)item.sku_status=sku.status;bom.push(item);}
if(fam==='wood'){
const base=lf*12/rp.picket_pitch;let pk;
if(rp.waste_mode==='flat'){pk=Math.ceil(base*rp.waste_lo);}
else{const lo10=Math.ceil(base*rp.waste_lo/10)*10;pk=lo10;}
add(sk.picket,pk,sk.picket.d,rp.waste_mode==='flat'?`ceil(${lf}x12/${rp.picket_pitch}x${rp.waste_lo})=${pk} [flat, no r10]`:`ceil((${lf}x12/${rp.picket_pitch})x${rp.waste_lo}/10)x10=${pk}`,'PICKETS');
add(sk.post,tp+lp,sk.post.d,`${tp}T+${lp}L`,'POSTS');
const rl=ts*rp.rails_sec+walks*rp.walk_rb+drives*rp.drive_rb;add(sk.rail,rl,sk.rail.d,`${ts}x${rp.rails_sec}+gates`,'RAILS');
add(sk.con,conc.totalBags,'Concrete 60lb',conc.F,'CONCRETE');
if(walks>0){add(sk.hinge,walks,sk.hinge.d,`${walks}x1PR`,'GATE HW');add(sk.latch,walks,sk.latch.d,`${walks}x1`,'GATE HW');if(sk.frame)add(sk.frame,walks,sk.frame.d,`${walks}x1 [CALIBRATING P7b]`,'GATE HW');if(sk.wg)add(sk.wg,walks,sk.wg.d,`${walks} walk`,'GATES');}
if(drives>0){add(sk.hinge,drives*4,sk.hinge.d,`${drives}x4PR (2PR/leaf)`,'GATE HW');add(sk.latch,drives,sk.latch.d,`${drives}x1`,'GATE HW');add(sk.rod,drives,sk.rod.d,`${drives}x1`,'GATE HW');if(sk.frame)add(sk.frame,drives,sk.frame.d,`${drives}x1 [CALIBRATING P7b]`,'GATE HW');if(sk.dg)add(sk.dg,drives,sk.dg.d,`${drives} drive`,'GATES');}}
else if(fam==='chain_link_commercial'){const htM1=ht-1;const endPC=ends+(walks+drives+others)*2;const cornerPC=corners;
const bracedHk=(typeof opts.braced_hookups==='number'&&opts.braced_hookups>=0)?opts.braced_hookups:hookups;
const trussedHk=hasTruss?hookups:0;
const fabFt=Math.ceil(lf/50)*50;add(sk.fab,fabFt,'Fabric Commercial',`ceil(${lf}/50)x50=${fabFt}ft`,'FABRIC');
const sticks=Math.ceil(lf/rp.rail_stick);const railFt=sticks*rp.rail_stick+Math.ceil(10.5*bracedHk);add(sk.rail,railFt,'Top Rail Commercial',`ceil(${lf}/21)x21=${sticks*21} + 10.5x${bracedHk}braced = ${railFt}ft`,'RAILS');
if(sk.tp4&&endPC>0){add(sk.tp4,endPC,sk.tp4.d,`${ends}ends+${(walks+drives+others)*2}gates`,'POSTS');add(sk.tc4,endPC,sk.tc4.d,`${endPC} caps`,'POSTS');}
if(sk.tp3&&cornerPC>0){add(sk.tp3,cornerPC,sk.tp3.d,`${cornerPC} corners`,'POSTS');add(sk.tc3,cornerPC,sk.tc3.d,`${cornerPC} caps`,'POSTS');}
const lpSku=ht<5&&sk.lp2?sk.lp2:sk.lp;const ltSku=ht<5&&sk.lt2?sk.lt2:sk.lt;add(lpSku,lp,lpSku.d,posts.F.lp+` (ht=${ht})`,'POSTS');if(!hasBarb)add(ltSku,lp,ltSku.d,`${lp}`,'POSTS');
const barSku=ht>=8&&sk.bar8?sk.bar8:sk.bar;add(barSku,hookups,barSku.d,`hookups=${hookups} ht=${ht}`,'HARDWARE');
const cH=Math.max(0,hookups-endPC);const tb3q=htM1*cH,tb4q=htM1*endPC;if(tb3q>0&&sk.tb3)add(sk.tb3,tb3q,sk.tb3.d,`(${ht}-1)x${cH}=${tb3q}`,'HARDWARE');if(tb4q>0&&sk.tb4)add(sk.tb4,tb4q,sk.tb4.d,`(${ht}-1)x${endPC}=${tb4q}`,'HARDWARE');
const ebSys=1+(hasBarb?3:0)+(hasTW?1:0)+(hasTruss?2:0);const e3q=hookups*ebSys;if(e3q>0&&sk.eb3)add(sk.eb3,e3q,sk.eb3.d,`hk${hookups} x sys(1${hasBarb?'+3barb':''}${hasTW?'+1tw':''}${hasTruss?'+2truss':''})=${e3q}`,'HARDWARE');
if(bracedHk>0&&sk.eb25)add(sk.eb25,bracedHk,sk.eb25.d,`braced=${bracedHk}`,'HARDWARE');
const reQ=hookups+bracedHk+trussedHk;add(sk.re,reQ,'Rail End Combo',`${hookups}hk+${bracedHk}braced+${trussedHk}trussed=${reQ}`,'HARDWARE');
const tieQ=Math.max(100,Math.ceil(lf/100)*100);add(sk.tie,tieQ,'Alum Ties',`max(100,ceil(${lf}/100)x100)=${tieQ}`,'HARDWARE');
if(hasTW){const twFt=Math.ceil(lf/1000)*1000;add(sk.tw,twFt,'Tension Wire',`ceil(${lf}/1000)x1000=${twFt}ft (1000ft rolls)`,'WIRE');add(sk.hog,Math.max(1,Math.ceil(lf/145)),'Hog Rings',`ceil(${lf}/145)lb`,'WIRE');}
if(hasBarb){const barbFt=Math.ceil((3*lf)/1320)*1320;if(sk.barb)add(sk.barb,barbFt,'Barb Wire 4pt 3-strand',`ceil(3x${lf}/1320)x1320=${barbFt}ft`,'WIRE');if(sk.arm)add(sk.arm,lp,'Barb Arm 3-Strand',`arms=lp=${lp} [PROVISIONAL P3]`,'WIRE');}
if(hasTruss){add(sk.bb,trussedHk,'Truss Brace',`truss_spec: ${trussedHk}`,'HARDWARE');add(sk.trt,trussedHk,'Truss Rod',`truss_spec: ${trussedHk}`,'HARDWARE');}
const cbRaw=hookups*17;const cbQ=cbRaw<50?cbRaw:Math.max(100,Math.round(cbRaw/100)*100);add(sk.bolt,cbQ,'Carriage Bolt',`hk x17=${cbRaw} -> ${cbRaw<50?'hand count':'n100'}=${cbQ}`,'HARDWARE');
const cant=hasCant?others:0;
if(cant>0){add(sk.cgate,cant,sk.cgate.d,`${cant} cantilever opening(s)`,'GATES');add(sk.croll,cant*4,sk.croll.d,`${cant}x4 rollers (covers integrated)`,'GATE HW');add(sk.crecv,cant,sk.crecv.d,`${cant}x1 receiver`,'GATE HW');if(sk.tp4){add(sk.tp4,cant,'4in Post (cantilever 3rd post)',`+1 per cant (2 from gate posts)`,'POSTS');add(sk.tc4,cant,'4in Cap (cantilever 3rd post)',`+1 per cant`,'POSTS');}}
if(walks>0){add(sk.wg,walks,sk.wg.d,`${walks}SS`,'GATES');add(sk.hinge,walks*2,sk.hinge.d,`${walks}x2`,'GATE HW');add(sk.latch,walks,sk.latch.d,`${walks}x1`,'GATE HW');}
if(drives>0){add(sk.dg,drives,sk.dg.d,`${drives}DD`,'GATES');add(sk.hinge,drives*4,sk.hinge.d,`${drives}x4`,'GATE HW');add(sk.latch,drives,sk.latch.d,`${drives}x1`,'GATE HW');add(sk.drop,drives,sk.drop.d,`${drives}x1`,'GATE HW');}}
else if(fam==='chain_link'){const fabQ=Math.ceil(lf/rp.fab_roll),railQ=Math.ceil(lf/rp.rail_stick);const tieQ=Math.ceil(lf/10*3/50)+1,aH=hookups;const bands=Math.ceil((ht-1)*aH);const endBands=hasTW?aH*2:aH;const tbs=ht>=6?sk.tb6:ht>=5?sk.tb5:sk.tb4;
add(sk.tp,tp,sk.tp.d,`${tp}tp`,'POSTS');
const lpSkuR=ht>=5&&sk.lp2?sk.lp2:sk.lp;const ltSkuR=ht>=5&&sk.lt2?sk.lt2:sk.lt;add(lpSkuR,lp,lpSkuR.d,`${lp}lp (ht=${ht})`,'POSTS');if(ltSkuR)add(ltSkuR,lp,ltSkuR.d,`${lp} line tops`,'POSTS');
add(sk.fab,fabQ,sk.fab.d,`ceil(${lf}/${rp.fab_roll})`,'FABRIC');add(sk.rail,railQ,sk.rail.d,`ceil(${lf}/${rp.rail_stick})`,'RAILS');add(sk.tie,tieQ,sk.tie.d,`${tieQ}bags`,'WIRE');add(sk.tb,bands,sk.tb.d,`(${ht}-1)x${aH}=${bands}`,'HARDWARE');if(sk.eb)add(sk.eb,endBands,sk.eb.d,hasTW?`hookups*2=${endBands}`:`hookups=${endBands}`,'HARDWARE');if(tbs)add(tbs,aH,tbs.d,`hookups=${aH} ht=${ht}`,'HARDWARE');add(sk.re,hookups,sk.re.d,`hookups=${hookups}`,'HARDWARE');if(sk.cb)add(sk.cb,ht*tp,sk.cb.d,`${ht}x${tp}=${ht*tp}`,'HARDWARE');if(hasTW){if(sk.tw)add(sk.tw,lf,sk.tw.d,`${lf}ft`,'WIRE');if(sk.hog)add(sk.hog,Math.max(1,Math.ceil(lf/67)),sk.hog.d,`ceil(${lf}/67)lb`,'WIRE');}add(sk.con,conc.totalBags,'Concrete 60lb',conc.F,'CONCRETE');if(walks>0)add(sk.wg,walks,sk.wg.d,`${walks}walk`,'GATES');if(drives>0)add(sk.dg,drives,sk.dg.d,`${drives}drive`,'GATES');}
else if(fam==='ornamental'||fam==='ornamental_pool'){const orR=rp.rails||3;const orTp=posts.endPosts+posts.cornerPosts+posts.gatePosts;const orLp=posts.linePosts_raw!==undefined?posts.linePosts_raw:posts.linePosts;const install=opts.install_method||'ground_set';const hwSpec=opts.hardware_spec||'standard';const wantCon=(opts.concrete===undefined)?true:!!opts.concrete;
const pnlQ=posts.totalSecs,pstQ=orTp+orLp;
add(sk.panel,pnlQ,sk.panel.d,`sum(ceil(run/${rp.S})) per-run=${pnlQ}`,'PANELS');
// v1.2.1 Fix1: driven posts step up to the next fence-height tier's REAL post SKU (ht+2, then ht+3/ht+4),
// using existing product_skus (4ft->6ft=8W12P93). No length invented; no computed offset. Placeholder
// DRIVEN_POST_LENGTH_UNVERIFIED flag removed (see handler).
let postSku=sk.post,drivenTier='';
if(install==='driven'&&sk.post_ht){for(const st of [2,3,4]){if(sk.post_ht[ht+st]){postSku=sk.post_ht[ht+st];drivenTier=` [driven: ${ht}ft->${ht+st}ft post ${postSku.s}]`;break;}}}
add(postSku,pstQ,postSku.d,`${pstQ}posts (${orTp}term+${orLp}line)${drivenTier}`,'POSTS');
if(rp.bracket_system==='integrated'){
if(sk.bracket_univ&&hookups*orR>0)add(sk.bracket_univ,hookups*orR,sk.bracket_univ.d,`2x${geo.fenceEdges.length}runs x${orR}rails=${hookups*orR}`,'HARDWARE');
if(sk.bracket_line&&orLp*orR>0)add(sk.bracket_line,orLp*orR,sk.bracket_line.d,`lp${orLp}x${orR}rails=${orLp*orR}`,'HARDWARE');}
if(sk.cap)add(sk.cap,pstQ,sk.cap.d,`${pstQ}caps`,'HARDWARE');
// v1.2.1 Fix2: plated = stock post (above) + plate + weld labor. Plate defaults 20089 (4x4in), or 20090
// (6x6in) when the job specifies plate_sku. The 20089-vs-20090 selection rule is UNMAPPED, so plated
// line-items are provisional:true (arithmetic trustworthy, SKU choice not) and the handler adds a
// PLATED_PLATE_SELECTION_UNMAPPED finding so the job is no longer silently READY.
if(install==='plated'){const plate=(opts.plate_sku==='20090')?{s:'20090',u:'each',d:'Floor Plate 6x6in'}:{s:'20089',u:'each',d:'Floor Plate 4x4in'};const pq=Math.ceil(pstQ);if(pq>0){bom.push({sku:plate.s,unit:plate.u,label:plate.d,qty:pq,group:'INSTALL',formula:`${pstQ}=posts [plated; plate SKU 20089/20090 selection unmapped]`,provisional:true});bom.push({sku:'LAB-GATE',unit:'each',label:'Weld Labor (floor plate)',qty:pq,group:'INSTALL',formula:`${pstQ}=floor_plate [plated]`,provisional:true});}}
if(wantCon){const cq=Math.ceil(pstQ);if(cq>0)bom.push({sku:sk.con.s,unit:sk.con.u,label:'Concrete 60lb',qty:cq,group:'CONCRETE',formula:`${pstQ}posts [provisional n=2]`,provisional:true});}
if(fam==='ornamental_pool'){const gc=walks+drives;if(gc>0){add(sk.wg,gc,sk.wg.d,`${gc}gate(s)`,'GATES');add(sk.hinge,gc,sk.hinge.d,`${gc}PR self-closing`,'GATE HW');add(sk.latch,gc,sk.latch.d,`${gc}magna latch`,'GATE HW');}}
else if(hwSpec==='self_closing'){const gc=walks+drives;if(gc>0){
add({s:'50383',u:'pair',d:'Hinge Self-Closing'},gc,'Hinge Self-Closing',`${gc}gates [self_closing]`,'GATE HW');add({s:'50139',u:'each',d:'Blk Magna Latch'},gc,'Magna Latch',`${gc}gates [self_closing]`,'GATE HW');if(walks>0&&sk.wg)add(sk.wg,walks,sk.wg.d,`${walks}walk`,'GATES');if(drives>0&&sk.dg)add(sk.dg,drives,sk.dg.d,`${drives}drive`,'GATES');}}
else{if(walks>0){if(sk.wg)add(sk.wg,walks,sk.wg.d,`${walks}walk`,'GATES');if(sk.hinge)add(sk.hinge,walks,sk.hinge.d,`${walks}x1 (1leaf x1male)`,'GATE HW');if(sk.hingef)add(sk.hingef,walks*2,sk.hingef.d,`${walks}x2 (1leaf x2female)`,'GATE HW');if(sk.lhanger)add(sk.lhanger,walks,sk.lhanger.d,`${walks}x1`,'GATE HW');if(sk.latch)add(sk.latch,walks,sk.latch.d,`${walks}x1 SS latch`,'GATE HW');}if(drives>0){if(sk.dg)add(sk.dg,drives,sk.dg.d,`${drives}drive`,'GATES');if(sk.hinge)add(sk.hinge,drives*2,sk.hinge.d,`${drives}x2 (2leafs/DD x1male/leaf)`,'GATE HW');if(sk.hingef)add(sk.hingef,drives*6,sk.hingef.d,`${drives}x6 (2leafs x2female=4 + 2 dropRod holder)`,'GATE HW');if(sk.lhanger)add(sk.lhanger,drives,sk.lhanger.d,`${drives}x1`,'GATE HW');if(sk.latch_dd)add(sk.latch_dd,drives,sk.latch_dd.d,`${drives}x1 DD center latch`,'GATE HW');else if(sk.latch)add(sk.latch,drives,sk.latch.d,`${drives}x1 [FALLBACK no DD-specific latch]`,'GATE HW');if(sk.cane_bolt)add(sk.cane_bolt,drives,sk.cane_bolt.d,`${drives}x1 cane bolt/DD`,'GATE HW');}}}
return bom;}
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
// Pure compute core (no HTTP). Returns {status, payload}. Extracted from the handler so the same
// code path is exercised by the Node verification harness and by the live edge function.
function calc(body:CalcInput):{status:number;payload:any}{
  const{style_id,family,rails,pool_code,edges,height_ft,ends,corners,walks,drives,others,flags,lp_override,hookup_override,braced_hookups,runs,gates,install_method,hardware_spec,concrete,plate_sku,total_lf}=body;
  const ht=height_ft??4;
  // ── Resolve effective style: new decomposed (family+rails+pool_code) OR legacy style_id ──
  let style:any=null,effStyleId='',mode='legacy';
  if(family&&FAM[family]){mode='decomposed';const rl=(typeof rails==='number'&&rails>0)?rails:3;const pool=!!pool_code;style=resolveStyle(family,rl,ht,pool);effStyleId=`${family}|rails=${rl}${pool?'|pool':''}`;}
  else if(style_id&&ST[style_id]){style=ST[style_id];effStyleId=style_id;}
  else return{status:400,payload:{error:family?`Unknown family: ${family}`:`Unknown style_id: ${style_id}`,available_families:Object.keys(FAM),available_styles:Object.keys(ST)}};
  const rp=style.rp;
  let effEdges:Edge[]=[];let assumption:string|null=null;
  if(Array.isArray(edges)&&edges.length){effEdges=edges;}
  else if(Array.isArray(runs)&&runs.length){effEdges=runs.filter((r:number)=>Number(r)>0).map((r:number)=>({kind:'fence' as const,length:Number(r)}));}
  else if(typeof total_lf==='number'&&total_lf>0){effEdges=[{kind:'fence',length:total_lf}];assumption='single_run';}
  if(!effEdges.filter((e:Edge)=>e.kind==='fence').length)return{status:400,payload:{error:'At least one fence run required'}};
  let eWalks=walks??0,eDrives=drives??0,gateLfIn=0;
  if(Array.isArray(gates)){eWalks=gates.filter((g:Gate)=>String(g&&g.type).toUpperCase()==='SS').length;eDrives=gates.filter((g:Gate)=>String(g&&g.type).toUpperCase()==='DD').length;gateLfIn=gates.reduce((s:number,g:Gate)=>s+(Number(g&&g.width_in)||0),0);}
  const geo=cA(effEdges);const posts=cB(geo,ends??2,corners??0,eWalks,eDrives,others??0,rp.S,lp_override??0,hookup_override??0);const conc=cF(posts,rp,style.family);const bom=cD(style,geo,posts,conc,ht,flags??[],{braced_hookups,install_method,hardware_spec,concrete,plate_sku});
  const dH=H(JSON.stringify({geoHash:geo.geoHash,bom:bom.map((i:BomItem)=>i.sku+':'+i.qty),style_id:effStyleId,height_ft:ht,flags:flags??[]}));
  const concreteBags=bom.filter((i:BomItem)=>i.group==='CONCRETE').reduce((s:number,i:BomItem)=>s+i.qty,0);
  const derivedTotalLf=geo.buildLft+geo.openingLft+(gateLfIn/12);
  const isOrn=(style.family==='ornamental'||style.family==='ornamental_pool');
  const poolActive=!!pool_code||!!(rp&&rp.pool)||(flags||[]).includes('pool');
  const unconfirmed=bom.filter((i:BomItem)=>i.sku_status==='unconfirmed').length;
  // ── Findings: hard blockers first (snapshot hardBlock), then info-level (non-blocking) ──
  const cf:string[]=[];if(geo.buildLft<1)cf.push('NO_FENCE_RUNS');if(posts.totalPosts<2)cf.push('POST_COUNT_ERROR');const hardBlock=cf.length>0;
  if(isOrn&&install_method==='plated')cf.push('PLATED_PLATE_SELECTION_UNMAPPED');
  if(poolActive)cf.push('POOL_CODE_ACTIVE');                 // info: pool code compliant — verify local AHJ requirements
  if(unconfirmed>0)cf.push('SKU_UNCONFIRMED');               // info: quantity computed; distributor SKU not yet vaulted for this combo
  const readiness=hardBlock?'BLOCKED':(cf.length>0||poolActive)?'NEEDS_REVIEW':'READY';
  return{status:200,payload:{decision_hash:dH,geo_hash:geo.geoHash,style_id:effStyleId,style_label:style.label,family:style.family,silhouette:style.silhouette,rails:rp.rails,pool_code:poolActive,resolution_mode:mode,height_ft:ht,build_lf:geo.buildLft,opening_lf:geo.openingLft,total_lf:derivedTotalLf,assumption,install_method:isOrn?(install_method||'ground_set'):undefined,hardware_spec:isOrn?(hardware_spec||'standard'):undefined,concrete:isOrn?((concrete===undefined)?true:!!concrete):undefined,tension_wire:(flags??[]).includes('tension_wire'),posts:{terminal:posts.terminalPosts,line:posts.linePosts,line_raw:posts.linePosts_raw,gate:posts.gatePosts,total:posts.totalPosts,hookups:posts.hookups,sections:posts.totalSecs,ends:posts.endPosts,corners:posts.cornerPosts},concrete_bags:concreteBags,bom,sku_summary:{confirmed:bom.length-unconfirmed,unconfirmed},readiness,proof_state:hardBlock?'BLOCKED':'ALL_PASS',findings:cf,engine_version:'bom-calc-v1.3.0',timestamp:new Date().toISOString()}};
}
if(typeof (globalThis as any).Deno!=='undefined'){
(globalThis as any).Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response(null,{headers:CORS});try{const body:CalcInput=await req.json();const r=calc(body);return new Response(JSON.stringify(r.payload),{status:r.status,headers:{...CORS,'Content-Type':'application/json'}});}catch(err){return new Response(JSON.stringify({error:String(err)}),{status:500,headers:{...CORS,'Content-Type':'application/json'}});}});
}
export{calc,resolveStyle,FAM,ST};
