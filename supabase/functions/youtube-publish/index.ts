const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Retired: V1 publishing runs through Electron's owner-bound credential vault.
Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "This legacy YouTube endpoint is unavailable." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
