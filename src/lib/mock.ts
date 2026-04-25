import type { Rubric, ScoredCandidate } from "./types";

// ---------------------------------------------------------------------------
// TODO: Remove once the backend agents land. Used by the dev-mode "Use sample
// rubric" buttons so the UI is demoable even without /api routes wired up.
// ---------------------------------------------------------------------------

export const SAMPLE_RUBRIC: Rubric = {
  topic: "AI product design",
  hint: "focused on practical builders not academics",
  archetype: "industry-professional",
  generatedAt: new Date().toISOString(),
  searchQueries: [
    "AI UX patterns",
    "shipping AI features",
    "LLM product design",
    "AI interface design",
    "human-AI interaction",
    "prompt UX",
    "generative UI",
  ],
  criteria: [
    {
      id: "shipped-ai-features",
      label: "Has shipped AI features in production",
      description:
        "Has clearly worked on or led an AI-powered product feature that real users use, not just prototypes or demos.",
      weight: 30,
      examples: ["karpathy", "shl", "garrytan"],
      verificationSources: ["twitter", "personal-site", "company-page"],
    },
    {
      id: "design-craft",
      label: "Strong product / interaction design craft",
      description:
        "Demonstrates taste and rigor in interaction design: shares specifics about flows, edge cases, and the why behind decisions.",
      weight: 25,
      examples: ["rauchg", "sdw", "natfriedman"],
      verificationSources: ["twitter", "personal-site"],
    },
    {
      id: "thoughtful-public-writing",
      label: "Writes thoughtfully about AI UX in public",
      description:
        "Posts non-trivial threads or essays on the design challenges of building with LLMs (not just hype, not just retweets).",
      weight: 20,
      examples: ["swyx", "dsiroker", "amasad"],
      verificationSources: ["twitter", "web-search", "personal-site"],
    },
    {
      id: "engineering-fluency",
      label: "Engineering fluency in AI systems",
      description:
        "Shows hands-on familiarity with model behavior, prompts, evals, retrieval — speaks the engineering register, not just the hype register.",
      weight: 15,
      examples: ["simonw", "hwchase17", "jxnlco"],
      verificationSources: ["twitter", "github", "personal-site"],
    },
    {
      id: "active-recent",
      label: "Active and current in the last 6 months",
      description:
        "Has been posting regularly about AI product work recently — not someone who tweeted about AI in 2023 and went dark.",
      weight: 10,
      examples: ["dsiroker", "shl", "rauchg"],
      verificationSources: ["twitter"],
    },
  ],
};

export const SAMPLE_RESULTS: ScoredCandidate[] = [
  {
    profile: {
      handle: "karpathy",
      name: "Andrej Karpathy",
      bio: "Building @EurekaLabsAI. Previously Director of AI @ Tesla, founding team @ OpenAI, CS231n at Stanford.",
      bioLinks: ["https://karpathy.ai"],
      followers: 1_300_000,
      recentTweets: [],
      fetchedAt: new Date().toISOString(),
    },
    fitScore: 94,
    passCount: 5,
    averageVerificationStrength: "verified",
    source: "rubric-example",
    criteriaResults: [
      {
        criterionId: "shipped-ai-features",
        passes: true,
        confidence: 0.95,
        verificationStrength: "verified",
        evidenceTweetIds: ["1234567890"],
        externalEvidence: [
          {
            source: "personal-site",
            url: "https://karpathy.ai",
            note: "Founder of Eureka Labs; previously Director of AI at Tesla.",
          },
        ],
        rationale:
          "Founded Eureka Labs to build an AI-native education product; led production AI teams at Tesla and OpenAI.",
      },
      {
        criterionId: "design-craft",
        passes: true,
        confidence: 0.7,
        verificationStrength: "indirect",
        evidenceTweetIds: ["2345678901"],
        externalEvidence: [],
        rationale:
          "Public threads on UX of AI tutoring products; not primarily a designer but engages with design tradeoffs.",
      },
      {
        criterionId: "thoughtful-public-writing",
        passes: true,
        confidence: 0.95,
        verificationStrength: "verified",
        evidenceTweetIds: ["3456789012", "4567890123"],
        externalEvidence: [
          {
            source: "web-search",
            url: "https://karpathy.github.io/",
            note: "Long-form blog with technical essays on model design.",
          },
        ],
        rationale: "Prolific essayist on neural networks and AI systems.",
      },
      {
        criterionId: "engineering-fluency",
        passes: true,
        confidence: 0.99,
        verificationStrength: "verified",
        evidenceTweetIds: ["5678901234"],
        externalEvidence: [
          {
            source: "github",
            url: "https://github.com/karpathy",
            note: "Maintainer of nanoGPT, llm.c, micrograd.",
          },
        ],
        rationale:
          "Maintains foundational AI codebases used by tens of thousands of practitioners.",
      },
      {
        criterionId: "active-recent",
        passes: true,
        confidence: 0.9,
        verificationStrength: "verified",
        evidenceTweetIds: ["6789012345"],
        externalEvidence: [],
        rationale: "Tweets and ships weekly.",
      },
    ],
  },
];
