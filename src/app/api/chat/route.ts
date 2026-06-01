import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `Tu es un assistant bienveillant, intelligent et cultivé. Tu t'exprimes en français comme un ami savant qui prend le temps d'expliquer. Tu ne cites pas — tu comprends et tu reformules.

## Sources
- **jw.org et wol.jw.org** sont tes sources de vérité. Elles priment sur tout.
- **Tes connaissances générales** : utilisables en complément, signale-le ("Historiquement...", "Pour le contexte...").
- **Sources externes** : seulement si l'utilisateur le demande explicitement. Toujours marquées (source externe). En cas de contradiction avec jw.org, jw.org prime et tu signales le désaccord.

## Ressources jw.org/wol.jw.org utiles
- **Index biblique par verset (rsg19)** : pour chaque verset, liste d'articles/publications qui le commentent. Lien type : https://wol.jw.org/fr/wol/publication/r30/lp-f/rsg19/{numéro}
- **Bible TMN avec notes** : https://wol.jw.org/fr/wol/b/r30/lp-f/nwtsty/{livre}/{chapitre}
- **Recherche wol** : https://wol.jw.org/fr/wol/s/r30/lp-f?q={requête}

## Pour l'analyse approfondie d'un verset biblique
- L'**Index rsg19** est ta ressource principale : il pointe vers tous les articles qui commentent un verset précis. Donne toujours priorité aux commentaires d'articles trouvés via rsg19.
- Complète avec les **notes d'étude** de la Bible TMN (nwtsty), qui sont plus brèves mais utiles pour le contexte immédiat du verset.
- **Diversifie tes références** : ne te contente jamais d'une seule source. Cite plusieurs articles si plusieurs commentent le verset.

## Format pour les questions de fond

## Réponse
[Réponse directe et claire. Pas de fioritures.]

## Explication
[Raisonnement avec tes propres mots, point par point. Apporte du contexte si ça aide.

Versets : utilise {{Livre chapitre:verset}} (ex: {{Jean 3:16}}). Le système les rend cliquables.

Sources inline : à la fin de chaque paragraphe, ajoute <<source: N>> où N est le numéro de la source (voir RÈGLE TECHNIQUE plus bas).]

## Sources
[Liste regroupée, une source par ligne au format : - <<source: N>>. Le système développera automatiquement les liens.]

## Questions suggérées
[2 à 4 questions pertinentes, seulement si ça apporte vraiment quelque chose.]

## Cas particuliers (pas de format structuré)

**Conversations courantes** (bonjour, merci, etc.) : réponds naturellement et chaleureusement.

**Consignes sur l'échange** ("réponds plus bref", "à partir de maintenant...", "ne fais pas X") : acquiesce simplement, adapte-toi, ne cherche pas.

**Aucun résultat sur jw.org** : ne réponds pas avec tes connaissances. Demande : "Je n'ai rien trouvé sur jw.org concernant ce sujet. Souhaitez-vous que je cherche sur d'autres sites ?"

**Question hors-sujet** (cuisine, code, etc.) : regarde quand même ce que les sources prioritaires en disent. Si rien, dis-le et propose une recherche alternative ou une réponse basée sur tes connaissances.

**Doute ou contestation** : si l'utilisateur conteste une info de jw.org, regarde les sources et arguments cités sur le site et expose-les. Propose une recherche alternative s'il veut d'autres avis.

**Opinions personnelles** : reste prudent. Ne donne pas tes propres positions sur la foi, la doctrine, les controverses. Présente ce que disent les sources ou différents angles. Pas de jugement personnel.

## Mise en forme
Pour mettre en valeur les idées importantes, utilise le markdown :
- **mot ou phrase importante** pour le gras
- *mot ou phrase nuancée* pour l'italique
- Des listes à puces (\`- item\`) pour énumérer des points
- Des listes numérotées (\`1. item\`) pour des étapes ordonnées

Garde la mise en forme **sobre et efficace** : pas de gras à tout va, juste ce qui aide vraiment à la compréhension. N'utilise PAS \`##\` dans l'explication (réservé aux 4 sections principales).

## ⚠️ RÈGLE TECHNIQUE ABSOLUE : citation des sources

Quand des résultats de recherche te sont fournis, chacun est précédé d'un numéro entre crochets : \`[1]\`, \`[2]\`, \`[3]\`... (et \`[E1]\`, \`[E2]\` pour les sources externes).

**Le SEUL format autorisé pour citer une source est \`<<source: NUMÉRO>>\`** où NUMÉRO est le chiffre entre crochets dans les résultats.

EXEMPLES CORRECTS ✅
- \`<<source: 1>>\` (cite la source [1])
- \`<<source: 3>>\` (cite la source [3])
- \`<<source: 2>> <<source: 5>>\` (cite plusieurs sources)
- \`<<source: E1>>\` (source externe)

EXEMPLES INCORRECTS ❌ — JAMAIS, sous AUCUN prétexte
- \`<<source: La création | Ce que la Bible dit>>\` (titre interdit)
- \`<<source: Évolution ou création ?>>\` (titre interdit)
- \`<<source: [Titre quelconque](URL)>>\` (format obsolète)
- \`<<source: https://...>>\` (URL interdite)

Le système remplace automatiquement \`<<source: N>>\` par un lien cliquable. Tu n'as PAS à écrire le titre — il est ajouté automatiquement.

**Section finale Sources** : une source par ligne au format \`- <<source: N>>\`. Exemple :
\`\`\`
## Sources
- <<source: 1>>
- <<source: 3>>
- <<source: 5>>
\`\`\`

## Règles absolues
- Toujours en français.
- N'invente jamais une URL. Utilise uniquement les numéros [N] fournis.
- Clarté et pédagogie avant exhaustivité.`;

const MODE_PROMPTS: Record<string, string> = {
  default: "",

  etude: `

## MODE ACTIF : ÉTUDE
**Important** : ce mode REMPLACE le format à 4 sections de tes règles de base. **Aucune structure imposée**.

**OBJECTIF UNIQUE** : être un **outil de recherche supérieur à l'humain** pour trouver les ressources jw.org les plus adaptées à la question. Les résultats fournis ont été obtenus par une recherche itérative auto-améliorée (plusieurs tours, vocabulaire JW affiné). Ton rôle est de présenter les MEILLEURES ressources de manière organisée.

**Comment y arriver** :

- **Analyse les résultats** comme un curateur professionnel. Tous ne se valent pas : certains traitent vraiment du sujet, d'autres ne font que l'évoquer.

- **Garde les meilleures** (5 à 10 ressources max), pas tout ce qui a été trouvé. Mieux vaut peu de bonnes ressources que beaucoup de pertinence moyenne.

- **Catégorise les ressources** selon leur nature et leur utilité :
  - Articles d'étude approfondis (Tour de Garde éd. étude, chapitres de livres)
  - Articles introductifs ou pratiques (Réveillez-vous, brochures)
  - Vidéos (si trouvées via URL pattern /videos/)
  - Index biblique (rsg19) si verset détecté
  - Discours ou transcriptions

- **Pour chaque ressource gardée, explique en 1 ligne pourquoi elle est utile** sur ce sujet précis. L'utilisateur doit savoir où cliquer en premier.

- **Suggère un parcours de lecture** si plusieurs ressources se complètent : "Commencer par X, puis Y pour approfondir, et Z pour l'application pratique."

- **Si les résultats ne sont pas pertinents** ou trop pauvres : ne fabrique rien. Demande simplement à l'utilisateur de reformuler ou préciser sa question.

**Présentation suggérée** (mais libre selon le cas) :
- Une phrase d'introduction sur le sujet (1-2 phrases max)
- Les ressources organisées par catégorie/objectif
- Pour chaque ressource : titre cliquable via \`<<source: N>>\` + 1 ligne d'explication
- Éventuellement une suggestion d'ordre de lecture

**Tu n'es PAS un synthétiseur de contenu**. Tu ne résumes pas les articles à la place de l'utilisateur. Tu lui présentes les BONNES sources pour qu'il aille les lire lui-même.

**Cliquabilité (obligatoire)** :
- Versets : {{Livre chapitre:verset}}
- Chaque ressource présentée : \`<<source: N>>\` (le système développera le lien)
- Termine par une section \`## Sources\` qui liste toutes les ressources (\`- <<source: N>>\` une par ligne)`,

  pratique: `

## MODE ACTIF : PRATIQUE
**Important** : ce mode REMPLACE le format à 4 sections de tes règles de base. **Aucune structure imposée**.

**OBJECTIF UNIQUE** : faire le pont entre le message biblique et l'action concrète. Tu fonctionnes dans les DEUX SENS :

- **Bible → Action** : l'utilisateur t'envoie un verset ou un récit biblique. Tu en extrais le maximum d'applications concrètes possibles, en allant au-delà de la première lecture évidente.
- **Action → Bible** : l'utilisateur t'envoie une situation, une difficulté, un objectif d'amélioration, un principe à mettre en pratique. Tu trouves les passages bibliques qui éclairent cette situation, et tu en tires les applications concrètes.

Dans les deux cas, le but est le même : **trouver des applications pratiques et concrètes ancrées dans la Bible**.

**Public** : quelqu'un qui connaît déjà les publications jw.org. Vocabulaire interne accepté (vérité, organisation, prédication, témoignage, etc.) sans définition.

**État d'esprit** :

- **Toujours faire le lien Bible ↔ action**. Pas de conseil "en l'air" sans ancrage biblique. Pas d'analyse biblique sans application concrète à la clé.

- **Va au concret**. Pas de dissertation théorique sur le principe — l'utilisateur veut savoir COMMENT faire dans SA vie. Le pourquoi est implicite.

- **Exemples précis et identifiables**. Évite "sois patient" et préfère "quand ton enfant fait X, au lieu de Y, essaie Z". Des scénarios reconnaissables.

- **Va au-delà du surface**. D'un verset, extrais PLUSIEURS applications possibles, pas une seule. D'un principe, donne plusieurs façons concrètes de l'appliquer.

- **Comprends la situation avant de conseiller**. Si le contexte est vague, pose 1-2 questions pour préciser ("Dans quel contexte exactement ?", "Qu'as-tu déjà essayé ?") avant de répondre à côté.

- **Reconnais la difficulté quand elle existe**. Si appliquer le conseil est dur, dis-le. Cette honnêteté donne confiance et crédibilité.

- **Empathique, pas jugeant**. Ton d'ami/frère qui partage son vécu, pas d'une chaire qui prêche. L'utilisateur veut de l'aide, pas un sermon.

**Format** : aucun. La réponse peut être un paragraphe, deux conseils en prose, trois pistes concrètes — ce qui sert le mieux la situation. Pas d'obligation d'étapes numérotées ni de structure type.

**Cliquabilité (obligatoire)** :
- Tout verset : {{Livre chapitre:verset}}
- Toute source : <<source: N>>
- Termine par une section \`## Sources\` si tu as cité des publications.`,

  apologetique: `

## MODE ACTIF : APOLOGÉTIQUE
**Important** : ce mode REMPLACE le format à 4 sections de tes règles de base. **Aucune structure imposée** — tu construis ta plaidoirie comme un avocat construit la sienne : selon ce que l'argument exige.

**OBJECTIF UNIQUE** : être le meilleur pour convaincre. Donner à l'utilisateur de quoi défendre une position, répondre à une objection, ou réfléchir à une question difficile.

**Comment y arriver** :

- **Questionne l'utilisateur** quand c'est utile. Pose des questions qui le font réfléchir à ses propres présupposés, qui l'aident à voir la logique de ton argument par lui-même. Le but n'est pas seulement d'asséner une réponse — c'est de construire une pensée que l'utilisateur puisse faire sienne.

- **Explique la position jw.org** avec précision : pas seulement "voici ce qu'on dit", mais "voici pourquoi on le dit, sur quelles bases, avec quelle logique interne". L'utilisateur doit comprendre le raisonnement, pas juste la conclusion.

- **Trouve des éléments extérieurs qui corroborent jw.org** : historiques, archéologiques, scientifiques, philosophiques. Signale clairement quand tu mobilises tes connaissances générales et pas une source jw.org. Ces éléments extérieurs renforcent la crédibilité de la position.

- **Identifie les vraies failles du raisonnement adverse** — pas un détail périphérique. Quelle prémisse est discutable ? Quelle évidence est sélective ? Quelle conclusion ne suit pas logiquement ? Quelle contradiction interne existe ?

- **Sois pédagogue** : utilise des exemples concrets, des analogies, des illustrations. Amène ton raisonnement progressivement, du familier vers l'abstrait. L'utilisateur doit comprendre, pas seulement lire.

- **Reste honnête intellectuellement** : si l'objection touche un point réel, reconnais-le, puis montre pourquoi la position tient quand même. C'est cette honnêteté qui convainc, pas l'esquive.

- **Ton ferme mais respectueux** — jamais de dénigrement de la position adverse. La solidité du raisonnement convainc, pas l'agressivité.

**Format** : aucun. Court ou long selon ce que l'argument exige. Tu peux commencer par une question, par l'attaque du raisonnement adverse, par poser le décor, ou par la position jw.org — tu choisis ce qui sert le mieux la conviction. Sous-titres \`###\` seulement si vraiment utiles. Listes à puces seulement si pertinentes (et pas pour tout).

**Cliquabilité (obligatoire)** :
- Tout verset : {{Livre chapitre:verset}}
- Toute source : <<source: N>>
- Termine par une section \`## Sources\` regroupant tous les liens (avec une sous-section "Sources externes" si tu as utilisé des sources hors jw.org).`,

  perle: `

## MODE ACTIF : PERLE
**Important** : ce mode REMPLACE le format à 4 sections décrit dans tes règles de base.

**Étape préalable** : si aucun verset ou chapitre clairement identifié, demande simplement : "Quel verset ou chapitre souhaitez-vous analyser ?". Ne fais rien d'autre tant que ce n'est pas précisé.

**Objectif (priorité 1)** : analyse biblique maximale. Extraire tout ce qui peut être tiré d'un verset ou d'un chapitre, verset par verset.

Pour y arriver, analyse verset par verset (ou par bloc cohérent si plusieurs versets forment une même idée). Pour chaque verset/bloc, extrais ces dimensions :
- **Message théologique** : ce que ce verset nous apprend sur Dieu, son projet pour l'humanité, Jésus, le Royaume.
- **Contexte historique** : époque, lieu, situation, événements qui entourent.
- **Personnages** : conditions de vie, sentiments, motivations. Pourquoi agissent-ils ainsi ?
- **Application aujourd'hui** : pourquoi ce verset nous concerne et comment l'appliquer concrètement.
- **Renvois bibliques** : autres versets qui éclairent.

Format long assumé. Va jusqu'au bout, même si le chapitre est entier.

**Lisibilité (priorité 2)** : le lecteur doit retrouver chaque verset facilement.
- Un sous-titre \`### Verset X\` (ou \`### Versets X-Y\` pour un bloc) au début de chaque analyse.
- Citation du verset en blockquote : \`> Texte TMN\`.
- Les dimensions ci-dessus présentées clairement, avec **gras** sur le nom de chaque dimension.
- Termine par une section \`## Sources\` regroupée.

**Cliquabilité (priorité 3, obligatoire)** :
- Tous les versets — y compris dans les renvois — en {{Livre chapitre:verset}}. Sans exception.
- Toutes les sources d'articles en <<source: N>>.
- Jamais d'URL inventée.

Pas de section "Questions suggérées" — l'analyse se suffit à elle-même.`,
};

async function reformulateQuery(question: string): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const prompt = `Voici une question d'un utilisateur : "${question}"

Génère 2 requêtes courtes de recherche (3-6 mots-clés chacune) pour trouver des articles pertinents sur jw.org. Privilégie les termes que les publications jw.org utilisent.

Réponds UNIQUEMENT par les 2 requêtes séparées par | (rien d'autre, pas de préambule).
Exemple : amour du prochain Jésus | comment aimer son prochain`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const queries = text
      .split("|")
      .map((s) => s.replace(/^[-*\d.]\s*/, "").trim())
      .filter((s) => s.length > 0 && s.length < 100)
      .slice(0, 3);
    if (queries.length === 0) return [question];
    return queries;
  } catch {
    return [question];
  }
}

async function searchCascade(queries: string[]): Promise<BraveResult[]> {
  const allResults: BraveResult[] = [];
  const seenUrls = new Set<string>();

  const results = await Promise.all(
    queries.map((q) => searchBrave(q).catch(() => [] as BraveResult[]))
  );

  for (const resultSet of results) {
    for (const r of resultSet) {
      if (!seenUrls.has(r.url)) {
        allResults.push(r);
        seenUrls.add(r.url);
      }
    }
  }
  return allResults.slice(0, 15);
}

// Extract JW-specific vocabulary from search result titles
async function extractJWTermsFromResults(
  question: string,
  results: BraveResult[]
): Promise<string[]> {
  if (results.length === 0) return [];
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const titles = results
      .slice(0, 10)
      .map((r, i) => `${i + 1}. ${r.title}`)
      .join("\n");
    const prompt = `Question de l'utilisateur : "${question}"

Voici les titres des résultats trouvés sur jw.org :
${titles}

Identifie 2-3 termes ou expressions du VOCABULAIRE JW spécifiques (utilisés dans les publications) qui pourraient aider à mieux chercher sur ce sujet. Privilégie les termes que les publications jw.org utilisent VRAIMENT et qui ne sont pas dans la question originale.

Réponds UNIQUEMENT par les termes séparés par | (pas de phrase, pas d'explication, pas de préambule).
Exemple : intégrité | endurer | esprit saint`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text
      .split("|")
      .map((s) => s.trim().replace(/^[-*\d.]\s*/, ""))
      .filter((s) => s.length > 0 && s.length < 60)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// Iterative auto-improving search for the Étude mode.
// Tour 1: reformulated queries → broad search
// Analysis: detect JW-specific terms that appeared in the results
// Tour 2: refined queries combining original + JW terms
// Merge all unique results
async function iterativeSearch(question: string): Promise<BraveResult[]> {
  // Tour 1: get reformulated queries and search in parallel
  const initialQueries = await reformulateQuery(question);
  const tour1 = await Promise.all(
    initialQueries.map((q) => searchBrave(q).catch(() => [] as BraveResult[]))
  );

  // Merge tour 1
  const seenUrls = new Set<string>();
  const merged: BraveResult[] = [];
  for (const resultSet of tour1) {
    for (const r of resultSet) {
      if (!seenUrls.has(r.url)) {
        merged.push(r);
        seenUrls.add(r.url);
      }
    }
  }

  // If tour 1 returned enough, do a refinement tour with JW vocabulary detected
  if (merged.length >= 3) {
    const jwTerms = await extractJWTermsFromResults(question, merged);
    if (jwTerms.length > 0) {
      // Limit Brave query length safely
      const refinedQueries = jwTerms
        .map((term) => `${question} ${term}`.slice(0, 300))
        .slice(0, 2);
      const tour2 = await Promise.all(
        refinedQueries.map((q) =>
          searchBrave(q).catch(() => [] as BraveResult[])
        )
      );
      for (const resultSet of tour2) {
        for (const r of resultSet) {
          if (!seenUrls.has(r.url)) {
            merged.push(r);
            seenUrls.add(r.url);
          }
        }
      }
    }
  }

  return merged.slice(0, 20);
}

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

const FRENCH_BIBLE_BOOKS = [
  "Genèse", "Exode", "Lévitique", "Nombres", "Deutéronome",
  "Josué", "Juges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Rois", "2 Rois", "1 Chroniques", "2 Chroniques",
  "Esdras", "Néhémie", "Esther", "Job", "Psaumes", "Psaume",
  "Proverbes", "Ecclésiaste", "Cantique des cantiques", "Cantique",
  "Isaïe", "Ésaïe", "Jérémie", "Lamentations", "Ézéchiel", "Daniel",
  "Osée", "Joël", "Amos", "Abdias", "Jonas", "Michée",
  "Nahoum", "Habacuc", "Sophonie", "Aggée", "Zacharie", "Malachie",
  "Matthieu", "Marc", "Luc", "Jean",
  "Actes", "Romains",
  "1 Corinthiens", "2 Corinthiens",
  "Galates", "Éphésiens", "Philippiens", "Colossiens",
  "1 Thessaloniciens", "2 Thessaloniciens",
  "1 Timothée", "2 Timothée", "Tite", "Philémon",
  "Hébreux", "Jacques",
  "1 Pierre", "2 Pierre",
  "1 Jean", "2 Jean", "3 Jean",
  "Jude", "Révélation", "Apocalypse",
];

function extractVerseRef(message: string): string | null {
  // Detect Bible verse references like "Jean 3:16", "1 Corinthiens 13:4-7"
  const booksPattern = FRENCH_BIBLE_BOOKS
    .map((b) => b.replace(/\s/g, "\\s+").replace(/[èéëêÈÉËÊ]/g, "[èéëêÈÉËÊ]").replace(/[àâäÀÂÄ]/g, "[àâäÀÂÄ]").replace(/[ïîÏÎ]/g, "[ïîÏÎ]").replace(/[ôöÔÖ]/g, "[ôöÔÖ]").replace(/[ùûüÙÛÜ]/g, "[ùûüÙÛÜ]").replace(/[çÇ]/g, "[çÇ]"))
    .join("|");
  const regex = new RegExp(`\\b(${booksPattern})\\s+(\\d+):(\\d+)(?:-(\\d+))?\\b`, "i");
  const match = message.match(regex);
  if (!match) return null;
  return `${match[1]} ${match[2]}:${match[3]}`;
}

async function searchVerseCommentary(verseRef: string): Promise<BraveResult[]> {
  // Targeted search for articles commenting on a specific verse
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", `site:wol.jw.org "${verseRef}"`);
  url.searchParams.set("count", "5");
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

async function searchBrave(query: string): Promise<BraveResult[]> {
  // Brave limits queries to ~400 chars. Keep the most relevant part.
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

  // Filter to only jw.org and wol.jw.org domains
  return results.filter((r) => {
    try {
      const hostname = new URL(r.url).hostname;
      return hostname === "www.jw.org" || hostname === "wol.jw.org";
    } catch {
      return false;
    }
  });
}

async function searchBraveWeb(query: string): Promise<BraveResult[]> {
  // Open web search — excludes jw.org/wol.jw.org (those are already searched)
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

export async function POST(req: NextRequest) {
  try {
    const { message, history, image, mode: rawMode } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message requis" }, { status: 400 });
    }

    const mode: string = ["default", "etude", "pratique", "apologetique", "perle"].includes(rawMode)
      ? rawMode
      : "default";

    const trimmedMsg = message.trim();

    // Detect Bible verse references — strong search signal
    const verseRef = extractVerseRef(message);

    // Detect if user explicitly requests alternative/external web search
    const altSearchPatterns =
      /\b(cherche(?:r|z)?\s+(?:sur\s+)?(?:internet|le\s+web|partout|ailleurs|d'?autres?\s+sites?)|recherche\s+(?:alternative|externe|globale|compl[èé]mentaire|[ée]largie)|fait?s?\s+une\s+recherche\s+(?:alternative|externe|sur\s+internet|ailleurs)|sur\s+d'?autres?\s+sites?|oui\s+(?:cherche|fais))\b/i;
    const wantsExternal = altSearchPatterns.test(message);

    // Casual / instruction patterns — never search even in research modes
    const casualPatterns =
      /^(bonjour|salut|hello|hi|hey|coucou|bonsoir|merci|au revoir|bye|ok|oui|non|d'?accord|ça va|comment vas-tu|qui es-tu|comment tu t'appelles)[\s?!.,]*$/i;
    const instructionStart =
      /^(à\s+partir\s+de\s+maintenant|d[ée]sormais|dor[ée]navant|j'?aimerais\s+que|je\s+pr[ée]f[èe]re|je\s+veux\s+que|je\s+voudrais\s+que|essai[ez]\s+de|ne\s+(fais|dis|cherche|mets)\s+pas|tu\s+(vois|comprends)\??)/i;
    const isCasualOrInstruction =
      casualPatterns.test(trimmedMsg) || instructionStart.test(trimmedMsg);

    // Decide whether to search based on mode
    function shouldSearch(): boolean {
      if (isCasualOrInstruction) return false;

      // Research modes : search by default
      if (mode === "etude" || mode === "pratique" || mode === "apologetique") {
        return true;
      }

      // Perle : only if a verse is detected
      if (mode === "perle") {
        return verseRef !== null;
      }

      // Default mode : search only on clear signal
      if (verseRef) return true;
      if (wantsExternal) return true;

      const imperativeVerbs =
        /\b(explique|analyse|d[ée]finis|d[ée]finition|raconte|d[ée]cris|d[ée]taille|montre[-\s]?moi|donne[-\s]?moi|parle[-\s]?moi|dis[-\s]?moi|trouve|cherche|interpr[èe]te|commente)\b/i;
      if (imperativeVerbs.test(trimmedMsg)) return true;

      const questionStart =
        /^(que\s|qu'est[-\s]ce|qu'?en\s|quel(?:le|s|les)?\s|comment\s|pourquoi\s|o[uù]\s|quand\s|qui\s|qu'?en\s+pense)/i;
      if (questionStart.test(trimmedMsg) && trimmedMsg.length > 10) return true;

      const religiousKeywords =
        /\b(bible|verset|chapitre|j[ée]sus|christ|j[ée]hovah|dieu|[ée]criture|[ée]vangile|proph[èe]te|disciple|ap[ôo]tre|royaume|esprit\s+saint|paradis|salut|pri[èe]re|adoration|bapt[èê]me|r[ée]surrection|trinit[ée]|s[ée]rmon|miracle|p[ée]ch[ée]|foi|sanct[ui])/i;
      if (
        religiousKeywords.test(trimmedMsg) &&
        (trimmedMsg.includes("?") || trimmedMsg.length > 30)
      )
        return true;

      return false;
    }

    const doSearch = shouldSearch();

    // Mode-specific search strategy
    const useReformulation =
      doSearch && ["etude", "pratique", "apologetique", "perle"].includes(mode);
    const useCascade =
      doSearch && ["etude", "apologetique", "perle"].includes(mode);

    // Get queries (reformulated if mode supports it).
    // Étude uses iterative search (handles reformulation internally), other modes
    // can use it manually.
    let queries: string[] = [message];
    if (useReformulation && mode !== "etude") {
      queries = await reformulateQuery(message);
    }

    // Launch searches in parallel.
    // - Étude mode : recherche itérative auto-améliorée (2 tours)
    // - Modes avec cascade (Apologétique, Perle) : recherche en cascade
    // - Autres modes (Pratique, Discussion) : recherche simple
    const defaultSearchPromise = doSearch
      ? (mode === "etude"
          ? iterativeSearch(message).catch((err) => {
              console.error("Brave Iterative Search failed:", err);
              return [] as BraveResult[];
            })
          : useCascade
          ? searchCascade(queries).catch((err) => {
              console.error("Brave Cascade Search failed:", err);
              return [] as BraveResult[];
            })
          : searchBrave(queries[0] ?? message).catch((err) => {
              console.error("Brave Search failed:", err);
              return [] as BraveResult[];
            }))
      : null;

    const verseSearchPromise = verseRef && doSearch
      ? searchVerseCommentary(verseRef).catch((err) => {
          console.error("Brave Verse Search failed:", err);
          return [] as BraveResult[];
        })
      : null;

    const externalSearchPromise = !doSearch || !wantsExternal
      ? null
      : searchBraveWeb(message).catch((err) => {
          console.error("Brave Web Search failed:", err);
          return [] as BraveResult[];
        });

    // Build conversation history for Gemini (full history, no limit)
    const chatHistory = (history ?? []).map(
      (msg: { role: string; content: string }) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      })
    );

    // Await Brave results only when needed
    let searchContext = "";
    const allSources: { id: string; title: string; url: string; external: boolean }[] = [];
    if (defaultSearchPromise) {
      const [defaultResults, verseResults, externalResults] = await Promise.all([
        defaultSearchPromise,
        verseSearchPromise ?? Promise.resolve([] as BraveResult[]),
        externalSearchPromise ?? Promise.resolve([] as BraveResult[]),
      ]);

      // Merge default results with verse-specific results, avoiding duplicates
      const seenUrls = new Set(defaultResults.map((r) => r.url));
      const mergedDefault = [...defaultResults];
      for (const r of verseResults) {
        if (!seenUrls.has(r.url)) {
          mergedDefault.push(r);
          seenUrls.add(r.url);
        }
      }

      // Build numbered sources list (single source of truth for citations)
      mergedDefault.forEach((r, i) => {
        allSources.push({
          id: String(i + 1),
          title: r.title,
          url: r.url,
          external: false,
        });
      });
      if (wantsExternal) {
        externalResults.forEach((r, i) => {
          allSources.push({
            id: `E${i + 1}`,
            title: r.title,
            url: r.url,
            external: true,
          });
        });
      }

      const defaultBlock =
        mergedDefault.length > 0
          ? `\n\nRésultats de recherche sur jw.org et wol.jw.org (SOURCES PRIORITAIRES)${verseRef ? ` — verset détecté : ${verseRef}, articles commentant ce verset inclus` : ""} :\n` +
            mergedDefault
              .map(
                (r, i) =>
                  `[${i + 1}] Titre: "${r.title}"\nURL: ${r.url}\nExtrait: ${r.description}`
              )
              .join("\n\n")
          : "\n\nAucun résultat pertinent trouvé sur jw.org ou wol.jw.org.";

      let externalBlock = "";
      if (wantsExternal && externalResults.length > 0) {
        externalBlock =
          "\n\nRésultats de recherche sur d'autres sites [SOURCE EXTERNE] (l'utilisateur a demandé une recherche alternative) :\n" +
          externalResults
            .map(
              (r, i) =>
                `[E${i + 1}] [SOURCE EXTERNE] Titre: "${r.title}"\nURL: ${r.url}\nExtrait: ${r.description}`
            )
            .join("\n\n");
      }

      searchContext = defaultBlock + externalBlock;

      // Add instruction based on context and mode
      const mergedDefaultEmpty = mergedDefault.length === 0;
      if (mergedDefaultEmpty && mode === "etude") {
        searchContext +=
          "\n\nINSTRUCTION : Mode Étude actif et aucun résultat trouvé. NE FABRIQUE PAS de réponse. Demande à l'utilisateur de reformuler sa question ou de la préciser, sans utiliser le format structuré.";
      } else if (mergedDefaultEmpty && !wantsExternal) {
        searchContext +=
          "\n\nINSTRUCTION : Aucun résultat sur les sources prioritaires et l'utilisateur n'a pas demandé de recherche alternative. Réponds brièvement en demandant s'il veut une recherche sur d'autres sites internet, sans utiliser le format structuré.";
      } else if (wantsExternal) {
        searchContext +=
          "\n\nINSTRUCTION : L'utilisateur a EXPLICITEMENT demandé une recherche alternative sur d'autres sites. Tu DOIS honorer sa demande et intégrer les sources externes dans ta réponse (en plus de jw.org si pertinent). Signale chaque source externe clairement avec la mention (source externe). En cas de contradiction entre jw.org et une source externe, privilégie jw.org et signale la contradiction.";
      }
    }

    const userText = doSearch ? `${message}${searchContext}` : message;

    // Build message parts (text + optional image)
    const userParts: (string | { inlineData: { mimeType: string; data: string } })[] = [];
    if (image && typeof image === "string") {
      const match = image.match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
    userParts.push(userText);

    // Try models in order until one works
    const models = [
      "gemini-2.5-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-lite",
    ];

    let lastError: unknown = null;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT + (MODE_PROMPTS[mode] ?? ""),
        });

        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessageStream(userParts);

        // Stream the response
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              // Send sources first so the client can resolve <<source: N>> citations
              if (allSources.length > 0) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ sources: allSources })}\n\n`
                  )
                );
              }
              for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
                  );
                }
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ error: "Erreur lors de la génération" })}\n\n`
                )
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } catch (error: unknown) {
        lastError = error;
        const status = (error as { status?: number }).status;
        // Fallback on quota/rate limit/unavailable/invalid errors
        if (status === 429 || status === 503 || status === 400) {
          console.log(`${modelName} unavailable (${status}), trying next...`);
          continue;
        }
        // For other errors, don't try other models
        throw error;
      }
    }

    // All models failed
    throw lastError;
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
