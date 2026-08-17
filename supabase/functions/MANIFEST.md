# Edge Function Drift Baseline — MANIFEST

**Captured at:** 2026-08-17T00:25:42Z (UTC)  
**Project ref:** `unddklhbrmqvyqagomtn`  
**Source:** Supabase Management API — `list_edge_functions` / `get_edge_function`  
**Captured by:** Coworker (steps 1–2 of Forge dispatch, 2026-08-16). Read-only; nothing deployed.

This file is the reference point for detecting drift between what Supabase runs and what
this repo tracks. Compare a live `list_edge_functions` against the table below: a changed
`ezbr_sha256` means the deployed bundle changed, whether or not anyone remembered to commit it.

## All thirteen deployed functions

| slug | version | ezbr_sha256 | verify_jwt | entrypoint build | in repo before this commit |
|---|---:|---|:---:|---:|:---:|
| `agent-bridge` | 28 | `59b4980cef561603ffd704e4eb92735c566f39b74dd8a68d9a0c181bf3da081d` | true | 26 | **no** |
| `assist-v2` | 4 | `6292b8e9d2dc4ce852d8d94d0fc28934f8e6027f182a4f52fed95ec2bbba1227` | true | 3 | **no** |
| `bom-calc` | 64 | `a943314cad9459642fb43d7599e3136ff8ed1ac0a6be6685053dad3445bc77cb` | true | 64 | yes |
| `forge-overnight` | 3 | `e78a6a750e30781ce2e8320ff1f3df78b6f83e79cecf679402f3b101bb7424c7` | true | 2 | **no** |
| `hotlist-read` | 23 | `950064ea8f862296b40292bca0aa30ae3bc2189ca2e4cf285e0303790c7f66a8` | false | 2 | **no** |
| `jilly` | 38 | `6e7e6e71386df3227115134bdcebf5ea334d00c52474acc7c269a2a9fc9436e0` | false | 37 | **no** |
| `job-save` | 4 | `9a7ef5d4dcc1b2f56d38bc0b13b22e89d82f9c458f697c0f8114db49c0a97d58` | true | 2 | yes |
| `lead-capture` | 44 | `40ed18a703fb011f2b6ab836d5c35c1ee77d0d5e212200adf568de1f503d48e2` | false | 42 | yes |
| `nightly-research` | 12 | `4102d840765ca372837e444f9a011a40e1f71b390c61c4e0e532145c86f05499` | true | 11 | **no** |
| `shield-read` | 30 | `fb98518fb79adb314e70c0886c37d9f20d12c9c02310bc6fb6497afe957a0374` | false | 1 | **no** |
| `sms-webhook` | 4 | `ed42908f7450dd72bc1c8550843ac301c1847fea7a1889d54cf84ab4ff2e1fcd` | false | 3 | **no** |
| `vault` | 40 | `6ba41b0297d47b7fca2f8425e5f175f316c10e7a38e0321b039bf7481db732fe` | true | 15 | yes |
| `vision-parse-v2` | 30 | `05095a19391632c757aa1917789790f33f0f712ea105cf1948df2ecba625df4a` | true | 5 | **no** |

All thirteen report `status: ACTIVE` at capture time.

## Why `version` and the entrypoint build number disagree — this is NOT drift

On **12 of 13** functions the platform `version` is higher than the build number
embedded in `entrypoint_path`. That is expected and is not evidence of a stale deploy. The
entrypoint number tracks the *code bundle*; `version` also increments on non-code changes such
as toggling `verify_jwt`. A function whose config was flipped several times shows a much higher
`version` than build number while running exactly the code it was last deployed with.

The single exception is `bom-calc` (64 = 64), where the two agree.

Widest gaps, for reference — none of these indicate a problem:
- `shield-read`: version 30 vs build 1 (gap 29)
- `vault`: version 40 vs build 15 (gap 25)
- `vision-parse-v2`: version 30 vs build 5 (gap 25)

**Do not raise a drift alarm on this column.** Drift is a change in `ezbr_sha256` relative to
this baseline, nothing else.

## What this baseline does not cover

- Environment variables and secrets are deliberately excluded. No key, token, or env value
  appears in this file.
- `ezbr_sha256` fingerprints the deployed bundle, not the `index.ts` in this repo. The two are
  not expected to match byte-for-byte; use the sha to detect *change over time* on the Supabase
  side, not to verify the repo copy.
- Nine functions had no repo copy at all before this commit (marked **no** above). Their bodies
  are committed verbatim as deployed, with known issues left in place on purpose — see the
  commit message.
