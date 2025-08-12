# LinkedIn Post Analysis — STRICT

You will analyze a LinkedIn post to evaluate its informativeness (0–10) and classify its type. 
If either the 'author' or 'content' field is missing or empty (after trimming), return the error JSON. 
Otherwise, follow the rules below.

## Output format (MANDATORY)
Respond ONLY with a single JSON object:
{"informativeness": <integer 0-10>, "category": "<category>"}

Allowed categories:
- "promotional"
- "engagement_bait"
- "entertainment"
- "activity"
- "suggestion"
- "normal"  (only if none of the above apply)

Set reasoning_effort = minimal. Do not include any text besides the JSON.

## Input
- Author: {{author}}
- Content: {{content}}

If either field is missing or empty after trimming:
{"error": "Missing input: author or content"}

## Pre-processing & general rules
- Trim whitespace. Treat multiple spaces/newlines as single separators.
- Exclude bare hashtags, @mentions, and URLs when checking for "word count" thresholds and "summary" presence.
- If borderline between two scores, ROUND DOWN.
- Apply category precedence when multiple patterns match: promotional > engagement_bait > entertainment > activity > suggestion > normal.

## INFORMATIVENESS SCALE (0–10)
Score the post's practical value and specificity:
- **10**: Novel insight with concrete steps, data, numbers, code, examples, or reproducible detail.
- **7–9**: Solid information with some specifics or examples; clearly actionable.
- **4–6**: Some utility but lacks depth, evidence, or clear steps.
- **1–3**: Vague, generic, platitudinous, or opinionated without support.
- **0**: Any AUTO-ZERO condition below.

## AUTO-ZERO (informativeness = 0)
Set informativeness to 0 and use the indicated category if any condition applies:

1) **Promotional/Sponsored/Marketing** → category "promotional"
   - Contains "Promoted"/"Sponsored" or sales/marketing CTAs: "sign up", "register", "book a demo", "limited seats", "discount", "coupon", "launching", "we just shipped", "webinar" (without educational summary), "hiring"/"we're hiring" without role details & actionable info.

2) **Engagement bait** → category "engagement_bait"
   - "Like if you agree", "comment YES", "tag 3 people", "follow for more", "drop an emoji", polls with no substantive analysis.

3) **Entertainment/Humor only** → category "entertainment"
   - Memes, jokes, GIFs, "Friday fun", LOL/emoji-driven content with no professional takeaway.

4) **Activity/Reshare/Notification** → category "activity"
   - "X commented/reacted", reshares with minimal commentary (<25 words excluding tags/mentions/URLs), congrats posts, personal job/milestone announcements with no lessons learned.

5) **People/Follow suggestions** → category "suggestion"
   - "Accounts to follow", "people you should connect with", networking prompts without value.

6) **Link-dump or media-only** → category based on context:
   - Any post that is only a link/video/image or mostly link + <25 words with no summary or key takeaways → if marketing/launch → "promotional", else if joke/meme → "entertainment", otherwise "activity".

7) **Low-signal format** → category based on context:
   - <15 words after removing URLs/hashtags/mentions, or >50% emojis/hashtags → treat as above (usually "activity" or "entertainment") and set informativeness=0.

## DEFLATION CAPS (apply only if not AUTO-ZERO)
Cap the maximum possible score if these patterns appear. Never exceed the cap:

- **Motivational quote / platitude / virtue signaling** (no specifics) → max **2**
- **Humble-brag / milestone** with a vague "lesson" ("work hard", "believe in yourself") → max **3**
- **"Excited to announce" with some details** but no concrete how-to/data → max **4**
- **Recycled tip list** (generic "Top 10 AI tips") without examples/evidence → max **5**
- **Opinion/rant** without support (no data/examples) → max **5**
- **Case study** with steps but no numbers/artifacts → max **6**

## BOOSTERS (raise score within the band)
- + Evidence: numbers, benchmarks, datasets, code, screenshots of metrics, citations.
- + Specificity: concrete steps/checklists tied to real scenarios.
- + Novelty: non-obvious insight, experiment results, failure analysis with takeaways.

## CATEGORY DECISION (apply precedence)
Choose the first matching label from this list:
1. promotional
2. engagement_bait
3. entertainment
4. activity
5. suggestion
6. normal

## Examples (illustrative, not to output)
- "We're hiring! Apply here." → {"informativeness": 0, "category": "promotional"}
- "Like if you agree AI will change everything." → {"informativeness": 0, "category": "engagement_bait"}
- "Excited to share my promotion. So grateful." → {"informativeness": 0, "category": "activity"}
- "5 steps to cut inference cost by 30% (with code + numbers)." → {"informativeness": 8-10, "category": "normal"}