# Genre benchmarks and demographic evidence

Research checked **2026-10-18** for the Beeline HTML5 mini-game generator. This is a research note, not a forecast of the generator's performance. Dates below distinguish publication/edition, observation period, and access date. `null` means not established from the inspected evidence, not zero.

## 1. Findings suitable for reuse

- **Use the five GameAnalytics rows below as one internally consistent historical comparison:** one publisher, one report, one month, the same genre-level reporting convention, and iOS + Android. Do not present them as HTML5, browser, or WebView benchmarks. The report explicitly samples mobile games on those two platforms. [GA25, p. 5]
- **Retain the publisher's statistic label.** GameAnalytics calls the genre figures the “median 50%” / “median 50% quantile” and presents monthly cohorts. These are not a pooled average across all individual users or a median individual session. The report does not provide sufficient detail to reconstruct the precise weighting/aggregation. [GA25, pp. 5, 17]
- **Demographics must remain a separate evidence layer.** ESA's genre chart concerns U.S. players aged 8+ across gaming platforms. It is not a demographic breakdown of the GameAnalytics games, not mobile-only, and not evidence of which age group will retain best in an HTML5 mini-game. [ESA24, printed pp. 14–15, 30]
- **No unsupported age or mechanic mappings:** `50+`, `Boomers/Silent`, `65+`, `kids`, and `teens` are not interchangeable; “Puzzle” is not a measured preference for every particular puzzle mechanic. Missing demographic preference percentages or missing hyper-casual D7 values should remain `null`.

## 2. Comparable genre table: GameAnalytics, December 2024

**Source:** *2025 Mobile Gaming Benchmarks*, GameAnalytics, **2025 edition**. Exact original publication date: **`null`**. Observation window for the whole report: **2024-01-01–2024-12-31**. Selected table column: **Dec = December 2024**, not an annual average and not December 2025. [GA25, pp. 5, 17–19]

**Dataset:** 11,600 games integrated with GameAnalytics; 9 regions; iOS and Android; 16 genres. The report also states an average 1.48 billion monthly active users. That is a reported monthly average, not a deduplicated annual unique-user count or a per-genre sample size. [GA25, p. 5]

**Statistic as published:** genre-level “median 50% quantile,” presented as monthly cohorts. Platform scope: **native-mobile benchmark context, iOS + Android; not an HTML5/WebView benchmark**. [GA25, pp. 5, 17]

| Source genre, unchanged | D1 retention (%) | D7 retention (%) | Session length (minutes) | Exact evidence location |
|---|---:|---:|---:|---|
| Casual | 20.03 | 3.26 | 4.0 | [GA25], p. 17 “D1 retention”; p. 18 upper “D7 retention”; p. 19 lower “Session length”; `Casual` row, `Dec` column |
| Arcade | 21.79 | 4.23 | 3.4 | [GA25], same three tables, `Arcade` row, `Dec` column |
| Puzzle | 19.66 | 4.43 | 5.7 | [GA25], same three tables, `Puzzle` row, `Dec` column |
| Board | 18.00 | 5.68 | 7.3 | [GA25], same three tables, `Board` row, `Dec` column |
| Card | 18.22 | 6.45 | 8.5 | [GA25], same three tables, `Card` row, `Dec` column |

### Exact accessible evidence

The PDF tables were rendered and visually inspected; the numeric cells are images and are missing from ordinary PDF text extraction. The following are exact cell transcriptions, with columns assembled across the three cited tables rather than a verbatim contiguous row from one table:

```text
                       p17 / Dec     p18 / Dec     p19 lower / Dec
Casual                   20.03%        3.26%             4.0m
Arcade                   21.79%        4.23%             3.4m
Puzzle                   19.66%        4.43%             5.7m
Board                    18.00%        5.68%             7.3m
Card                     18.22%        6.45%             8.5m
```

Short exact excerpts from the report:

> “The data in this report is sourced from a sample of mobile games integrated with GameAnalytics (11,600)” — [GA25, p. 5]

> “Jan 1st - Dec 31st 2024” — [GA25, p. 5, observation-period callout; typography normalized]

> “For the Genre performance chapter, we used the median 50% quantile only, segmented by individual genres.” — [GA25, p. 5]

> “The data is presented as monthly cohorts, reflecting performance trends within each genre.” — [GA25, p. 5]

> “The metrics presented in this chapter represent the median 50% of games within each genre.” — [GA25, p. 17]

### Definitions and denominators

**D1 / D7 retention.** GameAnalytics' official metric documentation describes the percentage of an installation cohort returning on day N, using **strict retention**, not “returned on day N or later.” The base is the cohort of newly installed users, not all active users on the measurement day. In formula form, the documented underlying metric is:

```text
D_N retention (%) = 100 × unique cohort users returning on exact day N
                         / unique users in the original installation cohort
```

GameAnalytics documents UTC date/hour boundaries. Consequently, calendar-day retention should not be silently interpreted as a rolling 24/168-hour window. This definition comes from the documentation; the benchmark report itself does not repeat all of the implementation details. [GA-METRICS]

**Session length.** The official documentation defines playtime per session as a mean per unique session-end event. Conceptually, its denominator is measured unique session-end events, **not users, days, launches, or completed game rounds**. The benchmark table then applies its own reported genre-level “median 50%” convention; the source does not establish a pooled mean across every session in all games. Keep the two aggregation levels distinct. [GA-METRICS; GA25, pp. 5, 17, 19]

Exact official-documentation snippets retrieved through search-indexed primary-source evidence:

> “The calculation uses strict retention” — [GA-METRICS, Retention]

> “GameAnalytics calculate metrics within UTC dates/hours.” — [GA-METRICS]

> “Mean playtime (length) per unique session end event.” — [GA-METRICS, Sessions / playtime]

**Access limitation:** direct requests to the GameAnalytics website and documentation failed DNS resolution during this research. These documentation excerpts were returned by searches against the official documentation URL; the full documentation page was not directly retrieved. The benchmark values themselves were independently verified in the downloaded GameAnalytics-authored PDF, not reconstructed from search summaries.

### Methodological caveats

1. **Historical, not current performance:** edition 2025 describes calendar-year 2024; research access in October 2026 does not update the observations. No assertion is made that this is the latest available GameAnalytics edition.
2. **Median/quantile ambiguity:** preserve the exact publisher label rather than inventing a trimmed-mean calculation, a middle-50% interval, user weighting, or confidence bounds. The PDF does not specify these details. [GA25, pp. 5, 17]
3. **Not a representative census of all games:** the sampling frame is games integrated with GameAnalytics. Per-genre game counts, cohort/user counts, minimum-volume rules, and uncertainty intervals are not disclosed in the inspected methods. [GA25, p. 5]
4. **Geographies overlap:** games can be published in multiple regions; the report says 4.69 regions per game on average. Regional counts must not be summed into a unique-game denominator. [GA25, p. 5]
5. **Session is not round:** an HTML5 mini-game can have many short rounds inside one measured session. The source gives no conversion from these session lengths to desired generated-round length.
6. **Do not read daily playtime as session length:** p. 19 has an upper `Playtime` table and a lower `Session length` table. Only the lower table supplies the minutes above. [GA25, p. 19]
7. **Casual is not Hyper casual:** the report's 16-genre tables contain `Casual` but no separate `Hyper casual` row. The five-row comparison therefore does not establish hyper-casual-specific D1, D7, or session length. [GA25, pp. 17–20]
8. These genre labels are not measured causal effects of selecting a mechanic. There is no evidence here that changing a game's genre alone would produce the corresponding retention.

## 3. Supplemental hyper-casual evidence: Adjust, not comparable to the table above

This separately inspected primary report is useful because it explicitly names hyper casual. **Do not splice it into the GameAnalytics table, use it to fill a GameAnalytics D7 cell, or average the publishers' session-length figures.**

**Source:** *The gaming app insights report: 2025 edition*, Adjust. Publication date: **`null`** at day/month resolution; edition **2025**. Report-wide dataset window **January 2023–March 2025**; figures below specifically refer to the **2024 global** series. [ADJUST25, pp. 13, 22, 24]

| Source genre | D1 retention, 2024 | D7 retention | Session length, 2024 | Evidence |
|---|---:|---|---:|---|
| Hyper casual | 27% | `null` — not established from the inspected report evidence | 18.97 minutes | [ADJUST25, p. 24 narrative; p. 22 narrative and chart unit “Time in minutes”] |

Exact evidence excerpts:

> “Hybrid and hyper casual games maintained their lead at 28% and 27%” — [ADJUST25, p. 24; order matters: hyper casual is 27%]

> “while hyper (18.97) and hybrid (21.6) casual games grew.” — [ADJUST25, p. 22]

> “A mix of Adjust’s top 5,000 apps and the total dataset of all apps tracked by Adjust.” — [ADJUST25, p. 13]

The p. 22 narrative calls the overall gaming session duration an average, but the report does not explain enough weighting/sessionization detail to reconcile the hyper-casual duration with GameAnalytics. It does not disclose a hyper-casual-specific sample size or establish an identical population to the five GameAnalytics rows. The report-wide “top 5,000 apps” wording must not be misreported as exactly 5,000 games or exactly 5,000 hyper-casual games. [ADJUST25, pp. 13, 22]

This is likewise **mobile-app evidence, not an HTML5/WebView benchmark**. The D7 metric is not supplied by substituting the report's D30 result, session share, or a D7 ROAS figure from a different report.

## 4. Demographic context: ESA 2024, verified original PDF

**Source:** *2024 Essential Facts About the U.S. Video Game Industry*, Entertainment Software Association (ESA), research conducted by YouGov. Publication/release date: **2024-05-16**, established by ESA's dated release. [ESA24; ESA24-RELEASE]

### What the genre chart actually measures

The exact chart heading is:

> “Generations And What They Play:”
>
> “Top Three Categories Ranked by Total Players 8+” — [ESA24, printed p. 14; PDF page 8]

These are genre participation/category results among **U.S. players in each listed generation, within the chart's 8+ base**, not shares of the population, download-market shares, shares of all puzzle players belonging to a generation, or exclusive one-favorite choices. The three percentages in each row exceed 100% in total, so they must not be normalized into a genre distribution. The published chart does not provide the full question wording, all response options, or unweighted per-generation base sizes. [ESA24, printed pp. 14, 30]

| Source cohort, unchanged | Three published genre/category figures | How safely to reuse |
|---|---|---|
| Gen Alpha | Arcade 64%; Action 60%; Puzzle 56% | Cohort-level context only; the printed chart base is players 8+. Not a statistic for all children or all ages 5–10. [ESA24, p. 14] |
| Gen Z | Arcade 56%; Action 55%; Shooter 54% | Do not relabel as “teens”: the inspected chart does not define Gen Z as a teen-only cohort. [ESA24, p. 14] |
| Millennials | Puzzle 61%; Action 54%; Arcade 52% | Adult-cohort context; not mobile-only and not the demographic composition of puzzle users. [ESA24, p. 14] |
| Gen X | Puzzle 66%; Skill/Chance 39%; Arcade 37% | Preserve `Skill/Chance`; do not silently translate it into a measured card, board, or casino share. [ESA24, p. 14] |
| Boomers/Silent | Puzzle 72%; Skill/Chance 53%; Arcade 20% | Combined older-generation cohort, not an exact 65+ or AARP 50+ cohort. [ESA24, p. 14] |

**A source discrepancy worth preserving:** ESA's 2024 release describes Gen Alpha as ages 5–10 and repeats Arcade 64%, Action 60%, Puzzle 56%; the original PDF labels the actual genre chart `Total Players 8+`. Use the narrower explicit chart base and retain this discrepancy rather than reporting a clean 5–10 denominator. The methodology explains that adults supplied household information to size players down to age 5, whereas supervised child survey respondents were ages 8–17. [ESA24-RELEASE; ESA24, printed pp. 14, 30]

### Sample, measurement period, and denominator limitations

The original PDF methodology, printed p. 30 / PDF page 16, states:

> “YouGov conducted a 20-minute online survey in the U.S. from October 23-31 among 5,000 total respondents” — [ESA24, p. 30]

> “n=4,000 Players (including n=748 Kids/Teens and n=3,252 Adults)” — [ESA24, p. 30]

> “who spend at least 1 hour/week playing video games on a smartphone, tablet, PC, console, or VR headset” — [ESA24, p. 30]

The remaining **1,000 respondents were adult non-players**. Players are defined by the ≥1-hour/week threshold. Recruitment used YouGov's proprietary online panel; weighting targets included age, gender, ethnicity, education, census region, and player/non-player distribution. Adults supplied household information for player population sizing down to age 5; players 8–17 completed the survey under parental supervision. [ESA24, p. 30]

**Fieldwork date precision:** the methodology prints **October 23–31 without a year**. Record that text as given; do not silently encode it as October 2024 or claim the report's 2024 release date is its fieldwork period. The inspected passage does not establish the fieldwork year. [ESA24, p. 30]

**Cross-platform, not mobile-only:** the genre chart is not filtered to phones. The adjacent platform chart covers mobile, PC, console, and VR, and the sample definition also spans all those platforms. A player can use more than one platform. [ESA24, printed pp. 14–15, 30]

### Verified 2025 update, separate survey

ESA's release *Annual ESA Study Reveals Video Games’ Universal Appeal Across Generations*, **2025-06-03**, states for the combined boomers and Silent Generation discussion:

> “They prefer puzzle (73%) and skill and chance (55%) games.” — [ESA25-RELEASE]

It defines boomers as **ages 61–79** and the Silent Generation as **ages 80–90**. Its methodology gives a U.S. online survey with **5,000 respondents**, fielded **February 11–25** in the 2025 study context, using YouGov's proprietary panel and U.S. population weighting; players 8–17 participated with parental supervision. [ESA25-RELEASE]

This update supplies **older-generation genre context**, not a strict 65+ segment: boomers include ages 61–64. Do not join its 73% result with the separate 2024 survey's 72% as if they had identical respondents or as a quantified demographic trend. It is also not proof that 73% of puzzle users are older adults.

## 5. Constraints for downstream facts or JSON

Recommended fact preservation, not a request to edit any JSON:

- Keep the five main benchmarks under one source ID, with `source.date = null`, `reportEdition = 2025`, `dataPeriod = 2024-12`, `platform = iOS+Android`, and the publisher's precise `statistic` wording. Store percentages consistently as percentages or fractions, explicitly indicating which.
- If a field is named `averageSessionMinutes`, document that the **GameAnalytics benchmark statistic is genre-level “median 50%”**, whereas the underlying per-session metric is described as a mean in the product documentation. Do not rename it “median session duration of all players.”
- Preserve both original publisher URL and actually accessed mirror PDF URL, plus page/table/row/column. A mirror is a retrieval location, not the author of the data.
- Do not copy the GameAnalytics `Casual` figures into a `Hyper casual` row or infer separate values for runner, merge, tapper, memory, match-3, or idle mechanics. Those subdivisions were not measured in the five selected rows.
- Keep ESA demographic facts separate from the benchmark populations. A source's `Puzzle` label may inform a broad genre note, not a numeric preference for an invented mechanic category.
- Set unverified strict `kids`, `teens`, or `seniors65plus` genre preference fields to `null`, not 0, and not an extrapolation from casual-game users, Gen Z, 50+, or Boomers/Silent.
- No verified HTML5/WebView genre-level retention or session-length number was established in this note. Native-mobile data is external context, not an acceptance criterion or expected result for the generator.

## 6. Source register and access audit

All URLs were investigated on **2026-10-18**. The source documents below are primary-publisher-authored material; mirrors are explicitly identified.

### [GA25] GameAnalytics

- **Title:** *2025 Mobile Gaming Benchmarks*.
- **Publisher:** GameAnalytics.
- **Source date:** 2025 edition; exact original publication day/month **`null`**. A mirror upload directory or HTTP modification timestamp is not a publication date.
- **Observation period:** 2024-01-01–2024-12-31; selected cells December 2024.
- **Official landing page:** https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks
- **Accessible PDF mirror actually downloaded and inspected:** https://investgame.net/wp-content/uploads/2025/02/2025-GameAnalytics-Mobile-Gaming-Benchmarks.pdf
- **Evidence:** PDF pp. 5, 17, 18, 19; page labels match physical PDF page numbers. GameAnalytics branding and report contents verified. Official landing page unavailable by direct DNS resolution in this environment; no publication date inferred from search summaries.
- **Downloaded PDF SHA-256:** `c7ead60ec68bb5d3a6b915749bcb871cf2ecd7c9d976adf4d186c8f3ea841841`.

### [GA-METRICS] GameAnalytics documentation

- **Title:** *Metrics*, sections Retention and Sessions / playtime.
- **Publisher:** GameAnalytics.
- **Publication/update date:** **`null`**, not established.
- **Official URL:** https://docs.gameanalytics.com/events-metrics-and-filtering/metrics/
- **Access:** exact short official-source snippets returned by web search; direct page retrieval failed DNS resolution. Operational definitions are supporting documentation, not additional benchmark observations.

### [ADJUST25] Adjust

- **Title:** *The gaming app insights report: 2025 edition*.
- **Publisher:** Adjust.
- **Source date:** 2025 edition; exact publication date **`null`**.
- **Report-wide observation period:** January 2023–March 2025; cited hyper-casual figures are the 2024 global series.
- **Official landing page:** https://www.adjust.com/resources/ebooks/gaming-app-insights-2025/
- **Accessible PDF mirror actually downloaded and inspected:** https://investgame.net/wp-content/uploads/2025/05/gamingreport2025_ebook_en.pdf
- **Evidence:** pp. 13, 22, 24; page labels match physical PDF page numbers. Exact values were checked in the PDF narrative, not guessed from bar heights. Direct official landing-page retrieval failed DNS resolution.
- **Downloaded PDF SHA-256:** `a8c29ffb4317b2cda931b234672d41248ee22fb260d07b7a0696d60d06c6f137`.

### [ESA24] ESA / YouGov

- **Title:** *2024 Essential Facts About the U.S. Video Game Industry*.
- **Publisher:** Entertainment Software Association; survey by YouGov.
- **Publication date:** **2024-05-16**, cross-checked against [ESA24-RELEASE].
- **Fieldwork:** October 23–31; year not specified in inspected methodology.
- **Original publisher-hosted PDF actually downloaded and inspected:** https://www.theesa.com/wp-content/uploads/2024/05/Essential-Facts-2024-FINAL.pdf
- **Evidence:** printed pp. 14–15 are PDF page 8, genre/platform chart visually verified; printed p. 30 is PDF page 16, methodology text extracted and checked.
- **Downloaded PDF SHA-256:** `09bc962960dfd58f8f8a4d59b4f085d61ee15197fb342b91fdb5786db74bd89b`.

### [ESA24-RELEASE] ESA

- **Title:** *Video Games Remain Lifelong Source of Entertainment for 190.6 Million Americans*.
- **Publisher:** Entertainment Software Association.
- **Publication date:** **2024-05-16**.
- **Official URL, directly retrieved:** https://www.theesa.com/video-games-remain-lifelong-source-of-entertainment-for-190-6-million-americans/
- **Evidence:** date; Gen Alpha description and repeated genre values; survey-methodology section. The release does not override the original PDF chart's explicit 8+ base.

### [ESA25-RELEASE] ESA

- **Title:** *Annual ESA Study Reveals Video Games’ Universal Appeal Across Generations*.
- **Publisher:** Entertainment Software Association; study with YouGov.
- **Publication date:** **2025-06-03**.
- **Fieldwork:** February 11–25, in the context of the 2025 report; the release's methods do not separately repeat the fieldwork year.
- **Official URL, directly retrieved:** https://www.theesa.com/annual-esa-study-reveals-video-games-universal-appeal-across-generations/
- **Evidence:** dated release; older-generation preference bullet; explicit age definitions; methodology. This note does not claim to have inspected the full 2025 PDF.

### Excluded or unverified material

- **AARP 2023:** official page https://www.aarp.org/pri/topics/social-leisure/activities-interests/2023-gamers-50-plus/ returned HTTP 403. A report-mirror attempt did not finish downloading. No AARP genre percentages or sample-size claims are admitted into the verified tables in this note. In any future use, an AARP 50+ base must not be renamed 65+.
- **Unity 2024:** inspected official report page https://unity.com/resources/gaming-report-2024 . The accessed sections include retention comparisons by advertising strategy, not a matching D1/D7/session-length-by-genre table for these five genres. Such ad-format comparisons are not substituted into genre rows or interpreted as causal effects.
- **Liftoff 2024:** no directly verified matching retention/session-length table was established in this research. In particular, **D7 ROAS is not D7 retention**; neither metric can fill the other's missing value.
- Secondary summaries were useful only for locating primary documents, not as authors of the accepted benchmark or demographic claims.

[GA25]: https://investgame.net/wp-content/uploads/2025/02/2025-GameAnalytics-Mobile-Gaming-Benchmarks.pdf
[GA-METRICS]: https://docs.gameanalytics.com/events-metrics-and-filtering/metrics/
[ADJUST25]: https://investgame.net/wp-content/uploads/2025/05/gamingreport2025_ebook_en.pdf
[ESA24]: https://www.theesa.com/wp-content/uploads/2024/05/Essential-Facts-2024-FINAL.pdf
[ESA24-RELEASE]: https://www.theesa.com/video-games-remain-lifelong-source-of-entertainment-for-190-6-million-americans/
[ESA25-RELEASE]: https://www.theesa.com/annual-esa-study-reveals-video-games-universal-appeal-across-generations/
