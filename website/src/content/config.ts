import { defineCollection, z } from "astro:content";

// One Markdown file per public tool, named after its id in
// desktop/src/ui/tools/publicCatalog.ts. The catalog owns the title and the
// one-sentence description; these files add the long-form page.
const tools = defineCollection({
  type: "content",
  schema: z.object({
    /** <title> for the tool page. Aim for under 65 characters. */
    seoTitle: z.string().max(70),
    /** Meta description. Aim for 140 to 160 characters. */
    seoDescription: z.string().min(80).max(170),
    /** Closest XrmToolBox plugin, when there is one. */
    xrmToolBoxEquivalent: z.string().optional(),
    /** Short capability bullets shown in the "What you can do" list. */
    features: z.array(z.string()).min(3)
  })
});

export const collections = { tools };
