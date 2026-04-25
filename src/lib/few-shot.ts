import type { DomainArchetype } from "@/lib/types";

/**
 * A worked-example rubric used as a few-shot demonstration in the criteria-gen
 * system prompt. These are calibration data: they teach the model what a GOOD
 * rubric looks like across very different kinds of expertise.
 *
 * Five domains were chosen deliberately to span all five archetypes:
 *   - academic-research      -> "AI alignment research"
 *   - community-fandom       -> "K-pop fandom (writers, fan-translators, tea-spillers)"
 *   - craft-artistic         -> "Indie game development"
 *   - academic-research      -> "Clinical immunology / vaccine research"
 *   - craft-artistic         -> "Stand-up comedy"
 *
 * Two domains use the same archetype on purpose so the model sees that
 * archetype is a hint, not a deterministic mapping.
 *
 * Every example handle below is a real, currently-active X account picked for
 * the fact that they actually pass the criterion. If a handle is removed or
 * privatized later, swap it for another verifiable expert.
 */
export type FewShotExample = {
  topic: string;
  hint?: string;
  archetype: DomainArchetype;
  rationale: string; // one-paragraph explanation of why this archetype + weighting
  criteria: Array<{
    id: string;
    label: string;
    description: string;
    weight: number;
    examples: string[]; // X handles WITHOUT @
    verificationSources: string[];
  }>;
  searchQueries: string[];
};

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  // ------------------------------------------------------------------
  // 1. Academic AI research (alignment / interpretability)
  // ------------------------------------------------------------------
  {
    topic: "AI alignment and interpretability research",
    hint: "Focus on people doing the actual research, not commentators.",
    archetype: "academic-research",
    rationale:
      "This is a research-credentialed field where output (papers, citations) and institutional affiliation are the strongest public signals. Weight credentials and published work heavily; weight social-media presence lightly.",
    criteria: [
      {
        id: "publishes-original-alignment-research",
        label: "Publishes original alignment / interpretability research",
        description:
          "Has at least 2 first- or co-author papers (arXiv, NeurIPS, ICML, ICLR, ACL, etc.) on alignment, interpretability, RLHF, scalable oversight, or model evals in the last 3 years.",
        weight: 30,
        examples: ["NeelNanda5", "ch402", "AnthropicAI"],
        verificationSources: ["semantic-scholar", "personal-site", "github"],
      },
      {
        id: "affiliated-with-frontier-lab-or-academic-group",
        label: "Affiliated with a frontier lab or recognized academic group",
        description:
          "Currently or recently at Anthropic, OpenAI, DeepMind, GovAI, MIRI, METR, Redwood, ARC Evals, or a university group publishing in this area (e.g., MIT CSAIL, Berkeley CHAI). Verifiable on the org's people page or GitHub org.",
        weight: 20,
        examples: ["jackclarkSF", "ESYudkowsky", "RichardMCNgo"],
        verificationSources: ["personal-site", "company-page", "web-search"],
      },
      {
        id: "discusses-technical-mechanisms-not-just-vibes",
        label: "Discusses technical mechanisms, not just vibes",
        description:
          "Posts threads, replies, or write-ups that explain specific mechanisms (sparse autoencoders, circuits, induction heads, reward hacking, deceptive alignment) at a level that requires having actually read the papers, with at least 3 such posts in the last 90 days.",
        weight: 20,
        examples: ["NeelNanda5", "OwainEvans_UK", "DavidSKrueger"],
        verificationSources: ["twitter"],
      },
      {
        id: "open-source-contributions-to-interp-or-evals",
        label: "Open-source contributions to interpretability or evaluation tooling",
        description:
          "Maintainer or substantial contributor to a relevant repo (TransformerLens, Inspect, Apollo Research's interp tools, METR task suite) with commits in the last 6 months.",
        weight: 15,
        examples: ["NeelNanda5", "_jasonwei", "lawrencecchan"],
        verificationSources: ["github"],
      },
      {
        id: "cited-or-invited-in-the-field",
        label: "Cited or invited in the field",
        description:
          "Papers cited >50 times total, OR has given invited talks at relevant venues (AI safety summits, NeurIPS workshops, ICML safety workshops, government testimony) verifiable via personal site, podcast notes, or org listings.",
        weight: 15,
        examples: ["ESYudkowsky", "AjeyaCotra", "RichardMCNgo"],
        verificationSources: ["semantic-scholar", "web-search", "personal-site"],
      },
    ],
    searchQueries: [
      "mechanistic interpretability",
      "sparse autoencoder",
      "RLHF reward hacking",
      "deceptive alignment",
      "scalable oversight",
      "induction heads",
      "model organisms of misalignment",
      "alignment research",
    ],
  },

  // ------------------------------------------------------------------
  // 2. K-pop fandom — writers, fan-translators, tea-spillers
  // ------------------------------------------------------------------
  {
    topic: "K-pop fandom (writers, fan-translators, news/tea accounts)",
    hint: "Fan side, not industry employees. The people other fans actually trust.",
    archetype: "community-fandom",
    rationale:
      "Expertise here is community-recognized, not credentialed. The signals are years-active, accuracy track record, original translation work, and being cited or quote-tweeted by other respected fans. Academic credentials are irrelevant; weight community-observable behavior heavily.",
    criteria: [
      {
        id: "long-term-active-presence",
        label: "Long-term active presence in the K-pop community on X",
        description:
          "Account is at least 3 years old AND has posted K-pop content consistently in the last 90 days (visible from join date and recent timeline). Throwaway news accounts that flip every comeback don't count.",
        weight: 15,
        examples: ["pannchoa", "kprofiles", "soompi"],
        verificationSources: ["twitter"],
      },
      {
        id: "original-translation-or-research-work",
        label: "Does original translation, research, or long-form writing",
        description:
          "Translates Korean-language interviews/livestreams/articles to English with attribution, OR writes original analysis threads about industry mechanics, contracts, lore, or charts. Not just RTing other people's translations.",
        weight: 25,
        examples: ["doolsetbangtan", "btstranslation_", "kookieipsum"],
        verificationSources: ["twitter", "personal-site"],
      },
      {
        id: "accuracy-track-record",
        label: "Accuracy track record on news / leaks / spoilers",
        description:
          "When account has reported pre-announcement news (comeback dates, lineup changes, contract news), it has been correct more often than not over the past year. Look for self-corrections, deleted-post archives, and reply chains where other accounts confirm or refute.",
        weight: 20,
        examples: ["pannchoa", "koreaboo", "diet_____prada"],
        verificationSources: ["twitter", "web-search"],
      },
      {
        id: "cited-by-other-respected-fan-accounts",
        label: "Cited or quote-tweeted by other long-established fan accounts",
        description:
          "Mentioned by name or QRT'd at least 5 times in the last 90 days by other accounts that themselves clearly belong to the fandom (visible from QRT history). Being only RT'd by stan accounts <1 year old does not count.",
        weight: 20,
        examples: ["pannchoa", "kprofiles", "soompi"],
        verificationSources: ["twitter"],
      },
      {
        id: "demonstrates-domain-knowledge-beyond-one-group",
        label: "Demonstrates K-pop domain knowledge beyond a single group",
        description:
          "Posts substantive content about more than one group / generation / company in the last 90 days, showing they understand the industry, not just stan one act. (Single-fandom devotion is fine for that fandom; this rubric is for general K-pop expertise.)",
        weight: 20,
        examples: ["kprofiles", "koreaboo", "soompi"],
        verificationSources: ["twitter"],
      },
    ],
    searchQueries: [
      "kpop comeback",
      "korean entertainment news",
      "kpop translation",
      "hybe sm jyp yg",
      "kpop charts hanteo circle",
      "fan translation",
      "kpop industry analysis",
    ],
  },

  // ------------------------------------------------------------------
  // 3. Indie game development (solo devs, design-craft)
  // ------------------------------------------------------------------
  {
    topic: "Indie game development",
    hint: "Solo or tiny-team devs who actually ship games, not AAA staff or commentators.",
    archetype: "craft-artistic",
    rationale:
      "This is a craft-and-shipping field. The dominant signals are public artifacts: shipped games on Steam/itch.io, devlogs, design-craft writing, and engagement from other working developers. Credentials matter little.",
    criteria: [
      {
        id: "has-shipped-a-game",
        label: "Has shipped at least one publicly available game",
        description:
          "Has at least one released title on Steam, itch.io, App Store, Switch eShop, or Web (not just a Kickstarter or alpha demo). Verifiable via store page linked in bio or pinned tweet.",
        weight: 30,
        examples: ["danielinchains", "ConcernedApe", "lucasmpope"],
        verificationSources: ["personal-site", "twitter", "web-search"],
      },
      {
        id: "shares-craft-not-just-marketing",
        label: "Shares actual design/code/art craft, not just marketing",
        description:
          "At least 5 posts in the last 90 days that show working footage, debug screenshots, code snippets, design problem write-ups, or post-mortems. Not just wishlist-CTA tweets.",
        weight: 25,
        examples: ["kentonsparks", "TerryCavanagh", "MattThorson"],
        verificationSources: ["twitter"],
      },
      {
        id: "engaged-with-by-working-devs",
        label: "Engaged with by other working indie devs",
        description:
          "Replies, QRTs, or recommendations from at least 5 distinct accounts in the last 90 days who themselves have shipped indie games (verifiable by their pinned/bio).",
        weight: 15,
        examples: ["danielinchains", "TerryCavanagh", "ConcernedApe"],
        verificationSources: ["twitter"],
      },
      {
        id: "open-source-or-public-tooling",
        label: "Public code, tools, jam entries, or open assets",
        description:
          "GitHub, itch jam page, or shared Godot/Unity/Unreal project with activity in the last 12 months. Or a notable game-jam entry. Demonstrates craft past their headline title.",
        weight: 15,
        examples: ["TerryCavanagh", "kentonsparks", "lucasmpope"],
        verificationSources: ["github", "personal-site"],
      },
      {
        id: "writes-or-talks-about-design-decisions",
        label: "Writes or talks about specific design decisions",
        description:
          "Has at least one substantive piece (devlog post, GDC/Roguelike Celebration talk, podcast interview, long thread) explaining a non-trivial design or technical decision in their work.",
        weight: 15,
        examples: ["MattThorson", "TerryCavanagh", "ConcernedApe"],
        verificationSources: ["personal-site", "web-search", "twitter"],
      },
    ],
    searchQueries: [
      "indie game devlog",
      "screenshot saturday",
      "wishlist on steam",
      "godot engine",
      "game jam",
      "solo dev",
      "indiedev",
      "game design",
    ],
  },

  // ------------------------------------------------------------------
  // 4. Clinical immunology / vaccine research
  // ------------------------------------------------------------------
  {
    topic: "Clinical immunology and vaccine research",
    hint: "Real scientists working on infection / vaccines, not anti-vax personalities or generic 'science fans'.",
    archetype: "academic-research",
    rationale:
      "Public-health research field where MD/PhD credentials, peer-reviewed publications, and institutional affiliation are the load-bearing signals. Twitter activity is supporting evidence, not primary. Heavy weight on credentials and citations; explicit anti-pattern is to score people who only popularize.",
    criteria: [
      {
        id: "md-or-phd-in-relevant-field",
        label: "MD, PhD, or MD/PhD in immunology, virology, infectious disease, or public health",
        description:
          "Verifiable degree in an immunology-adjacent field — listed on a university or hospital faculty page, NIH bio, or PubMed author affiliation. Self-claim alone is insufficient; must cross-check.",
        weight: 20,
        examples: ["AkikoIwasaki", "florian_krammer", "PeterHotez"],
        verificationSources: ["personal-site", "company-page", "wikipedia"],
      },
      {
        id: "peer-reviewed-publications-recent",
        label: "Peer-reviewed publications in the last 5 years",
        description:
          "At least 3 first-, last-, or co-author peer-reviewed papers on immunology, vaccine development, infection biology, or clinical trials in the last 5 years (PubMed or Semantic Scholar verifiable).",
        weight: 25,
        examples: ["AkikoIwasaki", "florian_krammer", "VirusesImmunity"],
        verificationSources: ["semantic-scholar"],
      },
      {
        id: "active-faculty-or-clinical-position",
        label: "Currently holds a faculty, clinical, or principal-investigator position",
        description:
          "Currently a professor, lab head, attending physician, or PI at an academic medical center, hospital, or research institute. Verifiable via the institution's directory.",
        weight: 15,
        examples: ["AkikoIwasaki", "PeterHotez", "ScottGottliebMD"],
        verificationSources: ["company-page", "personal-site"],
      },
      {
        id: "discusses-primary-literature",
        label: "Engages with primary literature on X, not just headlines",
        description:
          "At least 5 posts in the last 90 days that link to or discuss specific peer-reviewed papers (preprint or published) with substantive commentary on methods, results, or limitations.",
        weight: 20,
        examples: ["AkikoIwasaki", "florian_krammer", "EricTopol"],
        verificationSources: ["twitter"],
      },
      {
        id: "cited-or-quoted-by-mainstream-or-peer-coverage",
        label: "Cited or quoted by peers or mainstream science coverage",
        description:
          "Quoted or cited in the last 2 years by Nature/Science news, NYT/STAT/Atlantic science desks, NIH, WHO, CDC briefings, or other recognized faculty's papers. Tavily/web-searchable.",
        weight: 20,
        examples: ["AkikoIwasaki", "PeterHotez", "EricTopol"],
        verificationSources: ["web-search", "wikipedia"],
      },
    ],
    searchQueries: [
      "vaccine immunology",
      "T cell response",
      "neutralizing antibodies",
      "mRNA vaccine",
      "long covid immunology",
      "clinical trial vaccine",
      "infectious disease research",
    ],
  },

  // ------------------------------------------------------------------
  // 5. Stand-up comedy
  // ------------------------------------------------------------------
  {
    topic: "Stand-up comedy",
    hint: "Working comedians and comedy writers, not just funny tweet accounts.",
    archetype: "craft-artistic",
    rationale:
      "Expertise here is performance-based and venue-validated. The signals are: actually performs at clubs / does tours, has produced credited work (specials, writers' rooms, festivals), and has community recognition from other working comics. Twitter funny-tweet count is misleading.",
    criteria: [
      {
        id: "actively-performs-stand-up",
        label: "Actively performs stand-up at venues",
        description:
          "Has scheduled/announced live shows at recognizable comedy clubs, theaters, or tours in the last 12 months — verifiable via tour link in bio, club calendars, or Comedy Cellar / Punchline / Helium / SF Sketchfest listings.",
        weight: 25,
        examples: ["natebargatze", "MarkNormand", "Maria_Bamford"],
        verificationSources: ["personal-site", "web-search"],
      },
      {
        id: "produced-credited-work",
        label: "Produced credited work (special, festival set, writers' room, podcast)",
        description:
          "At least one of: a released stand-up special (Netflix, HBO, Max, YouTube hour), a credited festival set (Just For Laughs, Edinburgh Fringe, Moontower), a writers'-room credit (SNL, Conan, Daily Show, late-night), or a long-running comedy podcast as primary host. Verifiable via Wikipedia, IMDb, or platform page.",
        weight: 25,
        examples: ["natebargatze", "Maria_Bamford", "iansabandeira"],
        verificationSources: ["wikipedia", "web-search", "personal-site"],
      },
      {
        id: "talks-about-the-craft-not-just-bits",
        label: "Talks about the craft of stand-up, not just posts bits",
        description:
          "At least 3 posts in the last 90 days about writing, bombing, rewrites, crowd work, road life, comedy business, or other working-comic topics. Funny tweet accounts that never break kayfabe don't count.",
        weight: 15,
        examples: ["MarkNormand", "iansabandeira", "Maria_Bamford"],
        verificationSources: ["twitter"],
      },
      {
        id: "respected-by-other-working-comics",
        label: "Respected by other working comics",
        description:
          "Booked, podcast-guested, or publicly endorsed in the last 12 months by at least 3 other comedians who themselves meet the 'produced credited work' bar above. Visible from QRT/reply history and podcast guest lists.",
        weight: 20,
        examples: ["natebargatze", "MarkNormand", "Maria_Bamford"],
        verificationSources: ["twitter", "web-search"],
      },
      {
        id: "longevity-in-comedy",
        label: "Longevity in stand-up",
        description:
          "Has been actively performing stand-up for at least 3 years (verifiable via early club listings, tour history, or first-special date). Filters out viral-tweet accounts that picked up a mic last month.",
        weight: 15,
        examples: ["Maria_Bamford", "natebargatze", "MarkNormand"],
        verificationSources: ["wikipedia", "personal-site", "web-search"],
      },
    ],
    searchQueries: [
      "stand up comedy",
      "comedy cellar",
      "tour dates",
      "netflix comedy special",
      "writing jokes bombing",
      "comedy festival",
      "open mic",
    ],
  },
];

/**
 * Render the few-shot examples as a string block for the system prompt.
 * Kept compact — labels + weights + examples + queries — so we don't blow
 * the prompt budget. We elide rationale/description trimming inside the
 * example to keep the tone instructive rather than encyclopedic.
 */
export function renderFewShotForPrompt(): string {
  const blocks: string[] = [];
  for (let i = 0; i < FEW_SHOT_EXAMPLES.length; i++) {
    const ex = FEW_SHOT_EXAMPLES[i];
    const obj = {
      topic: ex.topic,
      hint: ex.hint,
      archetype: ex.archetype,
      reasoning: ex.rationale,
      criteria: ex.criteria.map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        weight: c.weight,
        examples: c.examples,
        verificationSources: c.verificationSources,
      })),
      searchQueries: ex.searchQueries,
    };
    blocks.push(`<example index="${i + 1}">\n${JSON.stringify(obj, null, 2)}\n</example>`);
  }
  return blocks.join("\n\n");
}
