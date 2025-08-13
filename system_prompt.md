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

## Examples (LEARN FROM THESE)

### BAD EXAMPLES (score 0):

**Example 1 - Promotional with CTA:**
Author: Merck Group
Content: What if your work helped guide life-saving treatments directly to where they are needed? Anita helps design delivery systems that do exactly that. "Together with our team I design strategies that help our customers to deliver life-saving treatments to exactly where they're needed in the body." – Anita, Director Operations Next Gen Drug Delivery. 👉 Follow us to see how science can drive purpose.
→ {"informativeness": 0, "category": "promotional"}
*Reason: Contains "Follow us" CTA, company promotional content*

**Example 2 - Share for visibility + hiring:**
Author: Bernard Desarnauts
Content: Sharing for visibility. Great job opps...
→ {"informativeness": 0, "category": "engagement_bait"}
*Reason: "Sharing for visibility" is engagement bait, hiring content without specifics*

**Example 3 - Pure advertisement:**
Author: Lansen Systems AB
Content: Intelligente Sensoren. Frühzeitige Leckerkennung. Große Einsparungen. 💧 Entdecken Sie, wie Potsdam kostspielige Wasserschäden verhindert!
→ {"informativeness": 0, "category": "promotional"}
*Reason: Pure product advertisement with marketing language and CTA*

### GOOD EXAMPLES (score 7-10):

**Example 4 - Knowledge sharing, no fluff:**
Author: Rene van Pelt
Content: OpenAI has announced million-dollar bonuses for nearly 1,000 employees to retain AI talent. The bonuses, awarded quarterly over two years, are for researchers and software engineers in applied engineering, scaling, and safety domains. CEO Sam Altman said the compensation increase is due to market dynamics and the demand for AI talent.
→ {"informativeness": 8, "category": "normal"}
*Reason: Factual information, specific numbers, no promotional language, pure knowledge*

**Example 5 - Career insight with specifics:**
Author: Lenny Rachitsky
Content: PM at Dropbox → PM at Instacart → Head of ChatGPT (fastest growing consumer product ever, business now valued at over $500B). Nick Turley's simple career strategy: "I don't know how to vet companies or predict which spaces will take off, but I do have a sense for people. Every career decision was just figuring out who are the smartest people I want to hang out with and learn from."
→ {"informativeness": 9, "category": "normal"}
*Reason: Unique career insight, specific trajectory, actionable strategy, concrete examples*