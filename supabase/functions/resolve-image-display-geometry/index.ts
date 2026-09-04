import { createClient } from "npm:@supabase/supabase-js@2";
import {
  installResolveImageDisplayGeometryProductionRuntime,
  productionHandleRequest,
} from "./entry.ts";

installResolveImageDisplayGeometryProductionRuntime({
  deno: Deno,
  createClient: (url, key, options) => createClient(url, key, options) as never,
  console,
});

Deno.serve(productionHandleRequest);
