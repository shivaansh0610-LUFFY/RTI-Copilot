# Live sources: what was checked

`live_sources.csv` lists official pages that `app.services.live_fetch.fetch_live_text` can read at request
time. It is separate from `sources.csv` (the static law and manuals, downloaded and ingested ahead of time).

Checked on 2026-10-19, official `.gov.in` / `.nic.in` pages only, each opened and read (not taken from a
search summary).

## Result

**No public page lists the status or resolution of PWD Delhi grievances in a form a program can read.**
PWD Delhi does have complaint-status tools, but they are private lookups. The one public, per-case
status table found belongs to the Public Grievances Commission and covers only the cases that reach it.
That is the single row in `live_sources.csv`.

## Registered

| Page | Why |
| --- | --- |
| `pgc.delhi.gov.in/pgc-cause-list-annexure-2` | Server-rendered table of Commission cases with respondent department and status ("Disposed of" or next hearing date). 42 cases in 14 departments on the day checked; **none were PWD**. |

## Checked and not registered

| Page | Finding |
| --- | --- |
| `pwddelhi.gov.in/grievance-redress`, `/helpdesk` | Contact channels only (centralised complaint centre, phone, email). No status or resolution data. Links its "online complaint system" to `pwddelhi.com`, which is not an official domain. |
| `pwddelhi.gov.in/sewa/complaint-status` (PWD SEWA) | The real PWD complaint tracker. A JavaScript app: the HTML is an empty shell. It looks up by mobile number, email or complaint number, and its code carries OTP send/verify calls and login tokens, so it is a private, per-citizen lookup. Not run end to end, because that would send an OTP to a real phone. |
| `pwddelhi.gov.in/sewa/pending-cases` | Same app; its code redirects to `/login` when not signed in. |
| `pwddelhi.gov.in/api/pwdsewa/...` | The JSON the SEWA pages read. A plain request got `403 Invalid request headers`. Not worked around: the site gates it on purpose, so using it would need PWD Delhi's agreement. |
| `pwddelhi.gov.in/project-work-report`, `/pwd-work-report`, `/maintenance-work/*` | Works and projects, not grievances. The tables are filled in by JavaScript, so a plain fetch returns column names and "Loading...". |
| `pgms.delhi.gov.in` (Delhi's grievance portal) | Home page only. Its "View Status" link is a placeholder (`#`); status needs the login at `/Login/Login`. |
| `pgportal.gov.in/Status` (CPGRAMS) | Needs registration number plus grievance password (or email/mobile) plus a captcha, in a protected POST form. Not fetchable, and should not be. |
| CPGRAMS monthly State/UT reports | Published as PDFs on `static.pib.gov.in` (seen in search results, not opened). Aggregate counts per State/UT, so nothing about a single grievance. |
| `pgc.delhi.gov.in/pgc/disposal-grievances` | Yearly totals of complaints received and disposed. Aggregate only. |
| `pgc.delhi.gov.in/pgc/complaint-status-public-grievances` | Despite the title, descriptive text about the Commission. No status data. |
| `pgc.delhi.gov.in/circulars-orders/4` ("Latest Orders") | Office orders (for example PIO/APIO appointments), not grievance outcomes. |
| `pgc.delhi.gov.in/doit-tabcontent/archive-order` | Per-grievance orders with the respondent department (one 2021 case names the Public Works Department), but all dated 2019-2022 and some dates are mistyped. Archive, not "recently resolved". |
| `pgc.delhi.gov.in/pgc-cause-list-annexure-1` | Empty ("No content available") on the day checked. Same system as Annexure-2, so worth rechecking. |
| `emonitoringdelhi.in`, `pwddelhi.com` | Linked from the PWD site but not `.gov.in` / `.nic.in`, so excluded by the same rule as the corpus. |
| data.gov.in | A web search found no Delhi PWD grievance dataset. The catalogue itself was not browsed. |

## For whoever uses the text (Part 2)

- Absence proves nothing. A JavaScript-filled page, such as PWD SEWA or the work reports, comes back as a
  successful fetch with only its labels. Treat "found in the text" as evidence and "not found" as unknown.
- Site menus stay in the text (PGC's menu is not inside a `<nav>` tag). Match on a table-row line, which has
  the cells joined with ` | `, never anywhere in the page.
- The cause list names private individuals. Match on a number the citizen supplies (diary or file number),
  not on a name, and do not log or store the fetched text.
- The list is paginated and one call reads one page. `?page=N` is 0-based.
- "Live" is only as fresh as the site: the cause list's `Date` header was two days old on a fresh request.
- `pgc.delhi.gov.in/robots.txt` answers `403 Forbidden`, so no crawl policy could be read. One GET per
  citizen request is polite enough today; add a limit if that changes.
- `.dockerignore` excludes `data/`, so this CSV is not in the API image. Copy it in if the API reads it.
