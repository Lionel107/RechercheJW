import {
  FunctionDeclaration,
  GoogleGenerativeAI,
  Part,
  SchemaType,
  Tool,
} from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────

interface BraveResult {
  title: string;
  url: string;
  description: string;
}
interface BraveWebResults {
  results?: BraveResult[];
}
interface BraveSearchResponse {
  web?: BraveWebResults;
}

interface SourceEntry {
  id: string;
  title: string;
  url: string;
  external: boolean;
}

// ────────────────────────────────────────────────────────────
// MODEL CASCADE (fallback if a model is rate-limited or busy)
// ────────────────────────────────────────────────────────────

// Cascade de modèles à deux étages :
// - Tier 1 (Gemini) : accès aux outils de recherche (search_jw_org, etc.)
// - Tier 2 (Gemma) : PAS d'outils, mais bon secours si tout Gemini est épuisé.
//   La réponse sera basée uniquement sur les connaissances du modèle,
//   sans sources jw.org. On préfixe alors la réponse d'un avertissement.
interface ModelConfig {
  name: string;
  supportsTools: boolean;
}

const MODEL_CASCADE: ModelConfig[] = [
  // Tier 1 — Gemini (avec outils)
  { name: "gemini-2.5-flash", supportsTools: true },
  { name: "gemini-2.5-flash-lite", supportsTools: true },
  { name: "gemini-2.0-flash", supportsTools: true },
  { name: "gemini-2.0-flash-lite", supportsTools: true },
  // Tier 2 — Gemma (sans outils, dernier recours)
  { name: "gemma-3-27b-it", supportsTools: false },
  { name: "gemma-3-12b-it", supportsTools: false },
  { name: "gemma-2-9b-it", supportsTools: false },
];

// ────────────────────────────────────────────────────────────
// MODE CONFIGURATION
// ────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<
  string,
  {
    maxSearches: number;
    encourageSearch: string;
  }
> = {
  default: {
    maxSearches: 2,
    encourageSearch:
      "Tu ne cherches QUE si tu en as vraiment besoin pour bien répondre. Un salut, une consigne, une reformulation, une question purement conversationnelle → aucune recherche.",
  },
  etude: {
    maxSearches: 6,
    encourageSearch:
      "Tu es en mode ÉTUDE : tu DOIS explorer plusieurs sources pour construire une compréhension approfondie du sujet. Croise 2-3 requêtes différentes minimum pour couvrir les angles importants.",
  },
  pratique: {
    maxSearches: 3,
    encourageSearch:
      "Tu es en mode PRATIQUE : cherche des articles pratiques concrets (Réveillez-vous, brochures pratiques) qui donnent des exemples applicables. Si un verset est cité, cherche aussi ses commentaires.",
  },
  apologetique: {
    maxSearches: 5,
    encourageSearch:
      "Tu es en mode APOLOGÉTIQUE : cherche les articles qui traitent spécifiquement de l'objection ou de la position à défendre. Croise plusieurs angles (biblique, historique, doctrinal).",
  },
  perle: {
    maxSearches: 6,
    encourageSearch:
      "Tu es en mode PERLE : dès qu'un verset est identifié, tu DOIS appeler search_verse_commentary(verse) pour récupérer les articles qui le commentent. Cherche aussi le contexte du chapitre entier avec search_jw_org.",
  },
};

// ────────────────────────────────────────────────────────────
// BRAVE SEARCH FUNCTIONS
// ────────────────────────────────────────────────────────────

async function searchBrave(query: string): Promise<BraveResult[]> {
  const prefix = "site:jw.org OR site:wol.jw.org ";
  const maxQueryLen = 350 - prefix.length;
  const cleaned = query.replace(/\s+/g, " ").trim();
  const shortQuery =
    cleaned.length <= maxQueryLen ? cleaned : cleaned.slice(0, maxQueryLen);

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", `${prefix}${shortQuery}`);
  url.searchParams.set("count", "10");
  url.searchParams.set("search_lang", "fr");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": process.env.BRAVE_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search error: ${response.status}`);
  }

  const data: BraveSearchResponse = await response.json();
  const results = data.web?.results ?? [];
  return results.filter((r) => {
    try {
      const hostname = new URL(r.url).hostname;
      return hostname === "www.jw.org" || hostname === "wol.jw.org";
    } catch {
      return false;
    }
  });
}

async function searchVerseCommentary(verseRef: string): Promise<BraveResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", `site:wol.jw.org "${verseRef}"`);
  url.searchParams.set("count", "8");
  url.searchParams.set("search_lang", "fr");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": process.env.BRAVE_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search error: ${response.status}`);
  }

  const data: BraveSearchResponse = await response.json();
  return (data.web?.results ?? []).filter((r) => {
    try {
      const hostname = new URL(r.url).hostname;
      return hostname === "wol.jw.org" || hostname === "www.jw.org";
    } catch {
      return false;
    }
  });
}

async function searchBraveWeb(query: string): Promise<BraveResult[]> {
  const maxQueryLen = 350;
  const cleaned = query.replace(/\s+/g, " ").trim();
  const shortQuery =
    cleaned.length <= maxQueryLen ? cleaned : cleaned.slice(0, maxQueryLen);

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", `${shortQuery} -site:jw.org -site:wol.jw.org`);
  url.searchParams.set("count", "8");
  url.searchParams.set("search_lang", "fr");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": process.env.BRAVE_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search error: ${response.status}`);
  }

  const data: BraveSearchResponse = await response.json();
  return (data.web?.results ?? []).filter((r) => {
    try {
      const hostname = new URL(r.url).hostname;
      return hostname !== "www.jw.org" && hostname !== "wol.jw.org";
    } catch {
      return false;
    }
  });
}

// Reformulation for automatic retry when a search returns nothing.
async function reformulateForRetry(query: string): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const prompt = `Cette requête n'a rien donné sur jw.org : "${query}"

Génère 2 reformulations alternatives avec des mots-clés du VOCABULAIRE JW (ex: "esclave de" au lieu de "addiction", "intégrité" au lieu de "fidélité morale", "esprit saint" au lieu de "Saint-Esprit").

Réponds UNIQUEMENT par les 2 requêtes séparées par | (rien d'autre).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text
      .split("|")
      .map((s) => s.replace(/^[-*\d.]\s*/, "").trim())
      .filter((s) => s.length > 0 && s.length < 100)
      .slice(0, 2);
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────
// TOOL DEFINITIONS (Gemini function calling)
// ────────────────────────────────────────────────────────────

const TOOL_SEARCH_JW: FunctionDeclaration = {
  name: "search_jw_org",
  description:
    "Recherche des articles, publications ou pages sur jw.org et wol.jw.org (la bibliothèque en ligne des Témoins de Jéhovah). Utilise cette fonction quand tu as besoin d'informations factuelles, doctrinales ou d'articles précis sur un sujet.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description:
          "Requête courte en français (3 à 8 mots-clés). Privilégie le vocabulaire des publications JW : 'vérité', 'intégrité', 'esprit saint', 'témoignage', etc.",
      },
    },
    required: ["query"],
  },
};

const TOOL_SEARCH_VERSE: FunctionDeclaration = {
  name: "search_verse_commentary",
  description:
    "Recherche les articles et publications JW qui commentent un verset biblique précis. À utiliser dès qu'un verset est identifié dans la question ou dans ta réflexion.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      verse: {
        type: SchemaType.STRING,
        description:
          "Référence biblique complète, ex: 'Jean 3:16', 'Romains 8:28', '1 Corinthiens 13:4'.",
      },
    },
    required: ["verse"],
  },
};

const TOOL_SEARCH_EXTERNAL: FunctionDeclaration = {
  name: "search_web_external",
  description:
    "Recherche sur d'autres sites internet, en dehors de jw.org. À utiliser UNIQUEMENT si l'utilisateur a explicitement autorisé les sources externes.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "Requête de recherche en français.",
      },
    },
    required: ["query"],
  },
};

function buildTools(mode: string, allowExternal: boolean): Tool[] {
  const declarations: FunctionDeclaration[] = [
    TOOL_SEARCH_JW,
    TOOL_SEARCH_VERSE,
  ];
  if (allowExternal) declarations.push(TOOL_SEARCH_EXTERNAL);
  // Mode "default" a aussi les tools disponibles, il décide lui-même.
  void mode;
  return [{ functionDeclarations: declarations }];
}

// ────────────────────────────────────────────────────────────
// TOOL EXECUTOR — appelle Brave et met à jour la liste des sources
// ────────────────────────────────────────────────────────────

interface ToolExecutionResult {
  count: number;
  results: {
    id: string;
    title: string;
    url: string;
    excerpt: string;
    external: boolean;
  }[];
  tip?: string;
}

function addSourceIfNew(
  allSources: SourceEntry[],
  r: BraveResult,
  external: boolean
): SourceEntry {
  const existing = allSources.find((s) => s.url === r.url);
  if (existing) return existing;
  // Compute the next ID for the correct category
  const prefix = external ? "E" : "";
  const count = allSources.filter((s) => s.external === external).length + 1;
  const entry: SourceEntry = {
    id: `${prefix}${count}`,
    title: r.title,
    url: r.url,
    external,
  };
  allSources.push(entry);
  return entry;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  allSources: SourceEntry[]
): Promise<ToolExecutionResult> {
  let braveResults: BraveResult[] = [];
  let external = false;

  if (name === "search_jw_org") {
    const query = String(args.query ?? "");
    braveResults = await searchBrave(query).catch(() => [] as BraveResult[]);
    if (braveResults.length === 0) {
      // Automatic retry with reformulation
      const alternates = await reformulateForRetry(query);
      for (const alt of alternates) {
        const retry = await searchBrave(alt).catch(() => [] as BraveResult[]);
        if (retry.length > 0) {
          braveResults = retry;
          break;
        }
      }
    }
  } else if (name === "search_verse_commentary") {
    const verse = String(args.verse ?? "");
    braveResults = await searchVerseCommentary(verse).catch(
      () => [] as BraveResult[]
    );
  } else if (name === "search_web_external") {
    const query = String(args.query ?? "");
    braveResults = await searchBraveWeb(query).catch(() => [] as BraveResult[]);
    external = true;
  } else {
    return { count: 0, results: [], tip: "Outil inconnu." };
  }

  const results = braveResults.slice(0, 8).map((r) => {
    const src = addSourceIfNew(allSources, r, external);
    return {
      id: src.id,
      title: r.title,
      url: r.url,
      excerpt: r.description,
      external,
    };
  });

  return {
    count: results.length,
    results,
    tip:
      results.length === 0
        ? "Aucun résultat après tentatives. Si tu as encore d'autres angles à essayer, reformule. Sinon, tu peux répondre avec ta réflexion générale en signalant l'absence de source directe (si l'utilisateur l'a autorisé)."
        : undefined,
  };
}

// ────────────────────────────────────────────────────────────
// SYSTEM PROMPT — philosophie "chercheur"
// ────────────────────────────────────────────────────────────

const BASE_PROMPT = `Tu es un assistant chercheur, spécialisé dans les publications jw.org et wol.jw.org. Tu t'exprimes naturellement en français, comme un érudit bienveillant et pédagogue.

## Ta démarche (le fondement)

1. **Tu COMPRENDS d'abord ce qu'on te demande.** Est-ce une question factuelle ? Une demande de reformulation ? Une consigne meta ? Une conversation informelle ?
2. **Tu N'AS PAS d'opinion préalable.** Tu n'essaies pas de confirmer une idée que tu aurais déjà. Tu extrais des INFORMATIONS.
3. **Tu DÉCIDES si tu as besoin de consulter des sources.**
4. **Si oui, tu APPELLES tes outils de recherche** — parfois plusieurs fois pour croiser les angles.
5. **Tu ASSIMILES les informations trouvées.**
6. **Tu SYNTHÉTISES une réponse qui répond vraiment à la demande.**

## Quand utiliser tes outils

Tu **cherches** si :
- La question demande une information doctrinale, biblique, factuelle
- Tu veux appuyer un argument par une publication précise
- Un verset est cité et il faut en trouver le commentaire officiel
- Tu as un doute sur ce qu'enseigne jw.org sur un point

Tu **NE cherches PAS** si :
- L'utilisateur te salue, remercie, fait la conversation
- L'utilisateur te donne une consigne (change ton style, sois plus bref, reformule…)
- L'utilisateur commente ta réponse précédente
- Tu peux répondre naturellement sans besoin de source

## Comment utiliser tes outils

- \`search_jw_org(query)\` : requête courte avec des mots-clés du vocabulaire JW. Ex: "amour du prochain", "intégrité épreuves", "esprit saint force".
- \`search_verse_commentary(verse)\` : dès qu'un verset est en jeu, utilise cette fonction avec la référence exacte. Ex: "Jean 3:16".
- \`search_web_external(query)\` : uniquement si l'utilisateur a explicitement autorisé les sources externes.

**Bonnes pratiques** :
- Une requête bien ciblée > plusieurs requêtes vagues.
- Si la première recherche est pauvre, reformule avec **d'autres mots-clés JW différents** plutôt que de répéter les mêmes.
- **NE FAIS JAMAIS la même recherche deux fois dans un tour.** Chaque appel DOIT avoir des mots-clés différents. Si le système te répond \`alreadyExecuted: true\`, c'est que tu as répété — reformule immédiatement avec d'autres termes.
- Passe à autre chose dès que tu as suffisamment d'informations : mieux vaut 2 bonnes recherches que 6 recherches sur des variantes du même mot.
- Si l'utilisateur demande une **mise en situation** ou une **analyse verset par verset**, ne cherche pas 5 fois — cherche 1-2 fois si utile, puis synthétise avec ta réflexion.

## L'écosystème jw.org (à connaître)

- **wol.jw.org** = bibliothèque d'étude complète (Tour de Garde, brochures, livres, index)
- **jw.org** = version grand public (articles, vidéos, FAQ)
- **Index rsg19** = index manuel des articles commentant chaque verset (résultat gold)
- URLs \`wol.jw.org/fr/wol/d/...\` = article approfondi d'un livre
- URLs \`jw.org/.../videos/\` = contenu vidéo
- Une recherche vide ne veut PAS dire que jw.org n'a rien : ta requête n'a peut-être pas bien matché. Reformule.

## Comment utiliser les résultats de recherche

**Règle capitale** : les citations \`<<source: N>>\` n'ont de sens QUE si tu as réellement appelé un outil (\`search_jw_org\`, \`search_verse_commentary\`, \`search_web_external\`) pendant CE tour et obtenu des résultats.

**Si tu n'as PAS appelé d'outil pendant ce tour** :
- **N'écris JAMAIS \`<<source: 1>>\`, \`<<source: 2>>\` ou toute autre citation.** Ces IDs n'existent pas et n'apparaîtront pas comme des liens.
- **N'ajoute PAS de section \`## Sources\`.**
- **N'invente JAMAIS de référence à des articles jw.org.**
- Tu peux répondre naturellement avec ta réflexion et les versets bibliques cliquables \`{{...}}\`.

**Si tu as appelé un outil et obtenu des résultats** :
Les sources te sont retournées avec des IDs numérotés (\`1\`, \`2\`, \`3\`, \`E1\`, \`E2\`…). Cite-les **uniquement** dans ce format :

✅ CORRECT
- \`<<source: 1>>\` (cite la source ID 1)
- \`<<source: 3>>\` (cite la source ID 3)
- \`<<source: E1>>\` (source externe)

❌ INTERDIT — sous aucun prétexte
- \`<<source: [Titre](URL)>>\` (format obsolète)
- \`<<source: Titre du document>>\` (titre interdit)
- \`<<source: https://...>>\` (URL interdite)
- \`<<source: 5>>\` alors que tu n'as que 3 résultats (ID inexistant)

Le système remplace automatiquement \`<<source: N>>\` par un lien cliquable avec le bon titre.

**Section finale Sources** : une source par ligne au format \`- <<source: N>>\`. Ex :
\`\`\`
## Sources
- <<source: 1>>
- <<source: 3>>
\`\`\`

## Versets bibliques — RÈGLE ABSOLUE

**TOUS les versets bibliques que tu cites DOIVENT être écrits dans le format \`{{Livre chapitre:verset}}\`. Sans EXCEPTION.**

✅ CORRECT : \`{{Jean 3:16}}\`, \`{{Romains 8:28}}\`, \`{{1 Corinthiens 13:4-7}}\`, \`{{Psaume 23}}\`
❌ INTERDIT : "Jean 3:16" (texte brut), "Isaïe 42:8" (texte brut), (Jean 3:16) (parenthèses seules)

Cette règle est **technique** : sans le format \`{{...}}\` le système ne peut pas rendre le verset cliquable pour l'utilisateur. Un verset non cliquable est un verset perdu.

Vérification finale : avant d'envoyer ta réponse, relis-la et remets AU FORMAT \`{{...}}\` tout verset qui aurait échappé à la règle.

## Mémoire des consignes

Si l'utilisateur t'a donné une consigne dans un message précédent (ex: "enrichis avec tes connaissances", "sois plus bref", "toujours cite un verset"), elle reste **valable toute la conversation**. Tu ne l'oublies jamais. Tu n'as pas à re-demander la permission.

## Cas particuliers de comportement

- **Aucun résultat après plusieurs tentatives** : signale-le brièvement et réponds avec ta réflexion générale si l'utilisateur t'a autorisé à enrichir. Sinon, propose de chercher sur d'autres sites.
- **Contestation d'une info** : consulte les sources jw.org sur le point contesté, expose les arguments, ne juge pas.
- **Opinion personnelle** : reste prudent, ne prends pas position sur des sujets doctrinaux ou controversés.
- **Question hors-sujet** : cherche quand même sur jw.org (rare mais possible), sinon dis-le et enrichis si autorisé.

## Format de réponse

Le format n'est PAS imposé rigidement. Tu adaptes ta réponse à ce que la question mérite :
- Question factuelle rapide → réponse concise
- Question doctrinale → développement structuré avec versets et sources
- Demande d'analyse → réflexion approfondie
- Discussion informelle → conversation naturelle

Utilise le markdown avec parcimonie :
- \`**gras**\` pour les points importants
- \`*italique*\` pour les nuances
- \`###\` pour les sous-titres SI la réponse est longue
- Listes à puces pour énumérer

## Règles absolues
- Toujours en français.
- N'invente jamais une URL. Utilise UNIQUEMENT les IDs \`<<source: N>>\`.
- Clarté et pédagogie avant exhaustivité.`;

const MODE_PROMPTS: Record<string, string> = {
  default: `

## Mode actif : DISCUSSION
Tu es en dialogue libre avec l'utilisateur. Tu peux chercher si nécessaire, mais tu réponds naturellement pour les échanges conversationnels ou les consignes. Ta priorité : comprendre la demande et y répondre efficacement.`,

  etude: `

## Mode actif : ÉTUDE
Objectif : approfondir un sujet comme une vraie séance d'étude. Tu DOIS croiser plusieurs sources jw.org pour construire ta compréhension. Fais 2 à 4 recherches minimum sur des angles complémentaires du sujet. Présente ta réflexion de façon structurée avec sous-titres \`###\` si le sujet est vaste. Termine par une section \`## Sources\` regroupée et propose 3-5 questions suggérées pour approfondir.`,

  pratique: `

## Mode actif : PRATIQUE
Objectif : faire le pont entre le message biblique et l'action concrète. Cherche des articles qui donnent des applications pratiques. Format libre. Reste concret : exemples précis, étapes applicables, ton chaleureux d'ami qui partage son vécu. Cite les versets qui appuient l'action.`,

  apologetique: `

## Mode actif : APOLOGÉTIQUE
Objectif : construire un argumentaire logique pour convaincre. Cherche les articles qui traitent spécifiquement de l'objection ou du sujet. Comprends la position adverse, identifie ses failles, expose la position jw.org avec ses fondements bibliques, complète avec des éléments historiques/scientifiques si pertinent. Ton ferme mais respectueux. Format libre.`,

  perle: `

## Mode actif : PERLE
Objectif : analyse biblique maximale d'un verset ou d'un chapitre.

**Étape préalable** : si aucun verset ou chapitre n'est identifié dans le message, demande "Quel verset ou chapitre souhaitez-vous analyser ?" et attends. Ne cherche rien.

Sinon :
1. **Appelle immédiatement** \`search_verse_commentary(verse)\` pour chaque verset central.
2. **Appelle aussi** \`search_jw_org\` avec des mots-clés du contexte pour élargir.
3. **Analyse verset par verset** (ou par bloc si plusieurs versets forment une idée) selon ces dimensions :
   - **Message théologique** : Dieu, Jésus, le Royaume, le projet de Dieu
   - **Contexte historique** : époque, lieu, situation
   - **Personnages** : conditions, sentiments, motivations
   - **Application aujourd'hui** : pourquoi ça nous concerne
   - **Renvois bibliques** : autres versets qui éclairent

Format long assumé. Sous-titre \`### Verset X\` pour chaque analyse. Termine par \`## Sources\`.`,
};

function buildSystemPrompt(mode: string): string {
  return BASE_PROMPT + (MODE_PROMPTS[mode] ?? "");
}

// ────────────────────────────────────────────────────────────
// SIMPLE DETECTIONS (pour la modulation de comportement)
// ────────────────────────────────────────────────────────────

const CASUAL_OR_INSTRUCTION = new RegExp(
  [
    // Casual conversation
    "^(bonjour|salut|hello|hi|hey|coucou|bonsoir|merci|au revoir|bye|ok|oui|non|d'?accord|ça va|comment vas-tu|qui es-tu|comment tu t'appelles)[\\s?!.,]*$",
    // Meta instructions
    "^(à\\s+partir\\s+de\\s+maintenant|d[ée]sormais|dor[ée]navant|j'?aimerais\\s+que|je\\s+pr[ée]f[èe]re|je\\s+veux\\s+que|je\\s+voudrais\\s+que|essai[ez]\\s+de|ne\\s+(fais|dis|cherche|mets)\\s+pas|tu\\s+(vois|comprends)\\??)",
  ].join("|"),
  "i"
);

const EXTERNAL_SEARCH_REQUEST =
  /\b(cherche(?:r|z)?\s+(?:sur\s+)?(?:internet|le\s+web|partout|ailleurs|d'?autres?\s+sites?)|recherche\s+(?:alternative|externe|globale|compl[èé]mentaire|[ée]largie)|fait?s?\s+une\s+recherche\s+(?:alternative|externe|sur\s+internet|ailleurs)|sur\s+d'?autres?\s+sites?|oui\s+(?:cherche|fais))\b/i;

// Detect meta-instructions in the user's history that should stay active for
// the whole conversation (style, length, format, workflow…).
const META_INSTRUCTION_PATTERNS = [
  /à\s+partir\s+de\s+maintenant/i,
  /d[ée]sormais/i,
  /dor[ée]navant/i,
  /(je\s+veux|j'?aimerais|je\s+pr[ée]f[èe]re|je\s+voudrais)\s+que/i,
  /(essaie|essaies?|essayez)\s+de\s+/i,
  /(sois|reste|fais)\s+(plus|moins|toujours|jamais)/i,
  /ne\s+(fais|dis|cherche|mets|donne)\s+pas/i,
  /(r[ée]ponds|r[ée]ponse)\s+(plus|moins)/i,
  /(enrichis|approfondis|d[ée]veloppe|synth[ée]tise)/i,
  /va\s+plus\s+loin/i,
  /pour\s+chaque\s+(question|message|r[ée]ponse)/i,
];

function extractActiveInstructions(history: HistoryEntry[]): string[] {
  const found: string[] = [];
  for (const m of history) {
    if (m.role !== "user") continue;
    if (m.content.length > 500) continue; // Long messages are usually content, not instructions
    if (META_INSTRUCTION_PATTERNS.some((p) => p.test(m.content))) {
      found.push(m.content.trim());
    }
  }
  // Keep only the most recent unique instructions (up to 5)
  const unique: string[] = [];
  for (const s of found) {
    if (!unique.includes(s)) unique.push(s);
  }
  return unique.slice(-5);
}

// ────────────────────────────────────────────────────────────
// POST HANDLER
// ────────────────────────────────────────────────────────────

interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface HistoryEntry {
  role: string;
  content: string;
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = body.message;
    const history: HistoryEntry[] = body.history ?? [];
    const image: string | undefined = body.image;
    const rawMode: string = body.mode;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message requis" }, { status: 400 });
    }

    const mode: string = MODE_CONFIG[rawMode] ? rawMode : "default";
    const modeConfig = MODE_CONFIG[mode];

    const trimmedMsg = message.trim();
    const isCasualOrInstruction = CASUAL_OR_INSTRUCTION.test(trimmedMsg);

    // Search for "please look outside jw.org" in this message OR any previous
    // user message (persistent memory of the instruction).
    const wantsExternal =
      EXTERNAL_SEARCH_REQUEST.test(message) ||
      history.some(
        (m) => m.role === "user" && EXTERNAL_SEARCH_REQUEST.test(m.content)
      );

    // Build the chat history for Gemini
    const chatHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Build the user message parts (text + optional image)
    const userParts: Part[] = [];
    if (image && typeof image === "string") {
      const match = image.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        userParts.push({
          inlineData: { mimeType: match[1], data: match[2] },
        });
      }
    }
    userParts.push({ text: message });

    // If the message is purely casual/instruction, we disable tools entirely
    // to prevent any search from happening.
    const tools = isCasualOrInstruction
      ? undefined
      : buildTools(mode, wantsExternal);

    // System prompt tailored to the mode, plus mode-specific search encouragement
    const activeInstructions = extractActiveInstructions(history);
    const instructionsBlock =
      activeInstructions.length > 0
        ? `\n\n## Consignes actives dans cette conversation\nL'utilisateur t'a donné ces consignes explicites plus tôt. Elles restent VALABLES pour toute la conversation, y compris ce message. Tu ne les oublies JAMAIS :\n${activeInstructions
            .map((s) => `- « ${s} »`)
            .join("\n")}`
        : "";

    const systemPrompt =
      buildSystemPrompt(mode) +
      instructionsBlock +
      (isCasualOrInstruction
        ? "\n\n## Contexte technique\nCe message ressemble à une conversation informelle ou une consigne meta. Tu n'as PAS accès aux outils de recherche pour ce tour. Réponds naturellement."
        : `\n\n## Contexte technique\n${modeConfig.encourageSearch}`);

    // Streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown> | string) => {
          const payload = typeof data === "string" ? data : JSON.stringify(data);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        };

        const allSources: SourceEntry[] = [];
        let modelSucceeded = false;

        for (const modelConfig of MODEL_CASCADE) {
          const modelName = modelConfig.name;
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: modelConfig.supportsTools
                ? systemPrompt
                : systemPrompt +
                  "\n\n## ⚠️ Modèle de secours actif\nTu n'as PAS accès aux outils de recherche pour ce tour (modèle de repli, sources indisponibles temporairement). Réponds naturellement avec tes connaissances générales, sans citer de source jw.org spécifique (n'écris JAMAIS <<source: N>>). Tu peux toujours utiliser {{Livre chap:verset}} pour les versets bibliques.",
              tools: modelConfig.supportsTools ? tools : undefined,
            });

            // Signal to the client if we're on a fallback (no-tools) model
            if (!modelConfig.supportsTools) {
              send({ fallbackMode: true, model: modelName });
            }

            const chat = model.startChat({ history: chatHistory });

            // Tool-use loop (Gemini) OR simple stream (Gemma)
            let currentMessage: Part[] = userParts;
            const maxIters = modelConfig.supportsTools
              ? modeConfig.maxSearches + 1
              : 1; // Gemma : single-shot streaming
            let iter = 0;
            let functionCallsInThisRound = 0;
            const executedCalls = new Set<string>();
            let totalTextChars = 0;

            while (iter <= maxIters) {
              const streamResult = await chat.sendMessageStream(currentMessage);

              // Consume the stream — send text chunks to the client
              for await (const chunk of streamResult.stream) {
                const text = chunk.text?.();
                if (text) {
                  totalTextChars += text.length;
                  send({ text });
                }
              }

              // Gemma model : no tool loop, we're done after one stream
              if (!modelConfig.supportsTools) break;

              const response = await streamResult.response;
              const calls = (response.functionCalls?.() ?? []) as FunctionCall[];

              if (calls.length === 0) {
                // Model finished normally — no more tool calls
                break;
              }

              // Deduplicate calls within the same round + against previous rounds
              const uniqueCalls: FunctionCall[] = [];
              const duplicatesInResponse: FunctionCall[] = [];
              const seenThisRound = new Set<string>();
              for (const c of calls) {
                const key = `${c.name}|${JSON.stringify(c.args ?? {})}`;
                if (executedCalls.has(key) || seenThisRound.has(key)) {
                  duplicatesInResponse.push(c);
                  continue;
                }
                seenThisRound.add(key);
                uniqueCalls.push(c);
              }

              // We hit the max — force the model to finalize with what it has
              if (functionCallsInThisRound >= modeConfig.maxSearches) {
                send({
                  toolLimit: true,
                  message: "Limite de recherches atteinte pour ce mode.",
                });
                currentMessage = [
                  {
                    text:
                      "Tu as atteint la limite de recherches pour ce mode. Finalise ta réponse maintenant avec les informations que tu as déjà collectées, sans faire d'autre appel d'outil.",
                  },
                ];
                iter++;
                continue;
              }

              // Execute only the unique calls
              const executedResponses: Part[] = await Promise.all(
                uniqueCalls.map(async (call) => {
                  const key = `${call.name}|${JSON.stringify(call.args ?? {})}`;
                  executedCalls.add(key);
                  send({
                    toolCall: {
                      name: call.name,
                      args: call.args,
                    },
                  });
                  const result = await executeTool(
                    call.name,
                    call.args,
                    allSources
                  );
                  send({
                    toolResult: {
                      name: call.name,
                      count: result.count,
                    },
                  });
                  functionCallsInThisRound++;
                  return {
                    functionResponse: {
                      name: call.name,
                      response: result as unknown as object,
                    },
                  } as Part;
                })
              );

              // For duplicate calls, return a synthetic response telling the
              // model that the query was already run so it stops repeating.
              const duplicateResponses: Part[] = duplicatesInResponse.map(
                (call) =>
                  ({
                    functionResponse: {
                      name: call.name,
                      response: {
                        alreadyExecuted: true,
                        message:
                          "Cette recherche a déjà été effectuée. Consulte les résultats précédents. Si tu as besoin de plus d'informations, formule une requête DIFFÉRENTE avec d'autres mots-clés.",
                      },
                    },
                  }) as Part
              );

              // Push updated sources snapshot to the client
              if (allSources.length > 0) {
                send({ sources: allSources });
              }

              currentMessage = [...executedResponses, ...duplicateResponses];
              iter++;
            }

            // If the model finished without ever producing text, treat it as
            // a failed run and try the next model (unless we hit the iteration
            // limit, in which case we accept whatever we have).
            if (totalTextChars === 0) {
              console.log(
                `Model ${modelName} finished with empty response, trying next…`
              );
              continue;
            }

            modelSucceeded = true;
            break; // model finished successfully
          } catch (error: unknown) {
            const status = (error as { status?: number }).status;
            if (status === 429 || status === 503 || status === 400) {
              console.log(
                `Model ${modelName} unavailable (${status}), trying next…`
              );
              continue;
            }
            console.error(`Model ${modelName} error:`, error);
            // Try the next model as well for unknown errors — better to keep going
            continue;
          }
        }

        if (!modelSucceeded) {
          send({ error: "Erreur lors de la génération" });
        }
        send("[DONE]");
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
