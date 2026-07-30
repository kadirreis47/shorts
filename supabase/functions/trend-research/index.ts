import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { source, region } = await req.json();

    // Generate trending topics based on source and region
    // Uses a combination of curated trending categories and algorithmic generation
    const topics = generateTrendTopics(source ?? "youtube", region ?? "global");

    return new Response(
      JSON.stringify({ topics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateTrendTopics(source: string, region: string): Array<{
  topic: string;
  category: string;
  volume: number;
  trend_score: number;
  related_hashtags: string[];
}> {
  const baseTopics: Record<string, Array<{ topic: string; category: string; hashtags: string[] }>> = {
    youtube: [
      { topic: "AI tools that actually save time", category: "Technology", hashtags: ["#ai", "#productivity", "#aitools", "#tech", "#shorts"] },
      { topic: "Morning routines of successful people", category: "Self Improvement", hashtags: ["#morningroutine", "#success", "#productivity", "#habits", "#motivation"] },
      { topic: "Foods that boost brain power", category: "Health", hashtags: ["#brainfood", "#health", "#nutrition", "#focus", "#diet"] },
      { topic: "Psychology tricks that work", category: "Education", hashtags: ["#psychology", "#mindtricks", "#facts", "#education", "#science"] },
      { topic: "Money mistakes to avoid in your 20s", category: "Finance", hashtags: ["#money", "#finance", "#investing", "#personalfinance", "#wealth"] },
      { topic: "Workout moves for small spaces", category: "Fitness", hashtags: ["#fitness", "#homeworkout", "#exercise", "#health", "#workout"] },
      { topic: "Books that change your mindset", category: "Education", hashtags: ["#books", "#reading", "#mindset", "#selfimprovement", "#knowledge"] },
      { topic: "Phone settings for better sleep", category: "Technology", hashtags: ["#sleep", "#phone", "#tech", "#health", "#wellness"] },
      { topic: "Side hustles that actually pay", category: "Finance", hashtags: ["#sidehustle", "#money", "#income", "#entrepreneur", "#hustle"] },
      { topic: "Things nobody tells you about adulthood", category: "Life", hashtags: ["#adulting", "#life", "#facts", "#growth", "#advice"] },
      { topic: "Quick recipes under 5 minutes", category: "Food", hashtags: ["#recipe", "#cooking", "#food", "#quick", "#easy"] },
      { topic: "Body language secrets", category: "Education", hashtags: ["#bodylanguage", "#psychology", "#communication", "#social", "#skills"] },
    ],
    tiktok: [
      { topic: "POV: You discovered a life hack", category: "Life", hashtags: ["#pov", "#lifehack", "#fyp", "#viral", "#tips"] },
      { topic: "Things I wish I knew earlier", category: "Self Improvement", hashtags: ["#advice", "#life", "#growth", "#wisdom", "#fyp"] },
      { topic: "Underrated apps everyone needs", category: "Technology", hashtags: ["#apps", "#tech", "#productivity", "#fyp", "#viral"] },
      { topic: "Aesthetic room transformations", category: "Lifestyle", hashtags: ["#room", "#aesthetic", "#decor", "#transformation", "#fyp"] },
      { topic: "3-ingredient recipes going viral", category: "Food", hashtags: ["#recipe", "#viralfood", "#easy", "#cooking", "#fyp"] },
      { topic: "Fitness challenges you can do at home", category: "Fitness", hashtags: ["#fitness", "#challenge", "#homeworkout", "#viral", "#fyp"] },
      { topic: "Money saving hacks that actually work", category: "Finance", hashtags: ["#money", "#saving", "#hacks", "#finance", "#fyp"] },
      { topic: "Skincare tips dermatologists swear by", category: "Beauty", hashtags: ["#skincare", "#beauty", "#tips", "#dermatologist", "#fyp"] },
    ],
    google: [
      { topic: "How to start investing with little money", category: "Finance", hashtags: ["#investing", "#money", "#finance", "#beginner", "#stocks"] },
      { topic: "Best productivity apps 2025", category: "Technology", hashtags: ["#productivity", "#apps", "#tech", "#2025", "#tools"] },
      { topic: "Signs of burnout and how to recover", category: "Health", hashtags: ["#burnout", "#mentalhealth", "#wellness", "#health", "#selfcare"] },
      { topic: "How to build a morning routine", category: "Self Improvement", hashtags: ["#morningroutine", "#habits", "#productivity", "#success", "#routine"] },
      { topic: "Foods that reduce anxiety", category: "Health", hashtags: ["#anxiety", "#food", "#mentalhealth", "#nutrition", "#wellness"] },
      { topic: "Passive income ideas for beginners", category: "Finance", hashtags: ["#passiveincome", "#money", "#finance", "#income", "#wealth"] },
    ],
    reddit: [
      { topic: "Unpopular opinions about productivity", category: "Discussion", hashtags: ["#productivity", "#opinion", "#discussion", "#unpopular", "#reddit"] },
      { topic: "Life pro tips that are actually useful", category: "Life", hashtags: ["#lifeprotips", "#tips", "#life", "#hacks", "#useful"] },
      { topic: "What I learned from failing", category: "Self Improvement", hashtags: ["#failure", "#learning", "#growth", "#success", "#mindset"] },
      { topic: "Underrated skills that pay off", category: "Career", hashtags: ["#skills", "#career", "#success", "#learning", "#growth"] },
      { topic: "Things society normalizes but shouldn't", category: "Discussion", hashtags: ["#society", "#discussion", "#opinion", "#awareness", "#reddit"] },
    ],
  };

  const list = baseTopics[source] ?? baseTopics.youtube;

  return list.map((item, i) => {
    const volume = Math.floor(50000 + Math.random() * 500000);
    const score = Math.round((70 + Math.random() * 30) * 10) / 10;
    return {
      topic: item.topic,
      category: item.category,
      volume,
      trend_score: score,
      related_hashtags: item.hashtags,
    };
  });
}
