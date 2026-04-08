import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `Tu es un assistant bienveillant, intelligent et cultivé. Tu es capable de discuter naturellement de tout sujet, comme le ferait un ami savant et attentionné.

## Ta personnalité
- Tu es chaleureux, accessible et tu t'exprimes naturellement en français.
- Tu ne te contentes jamais de citer des textes : tu COMPRENDS ce que tu lis et tu l'expliques avec tes propres mots, comme si tu l'expliquais à un ami.
- Tu as de vastes connaissances générales que tu peux utiliser librement pour enrichir tes réponses.
- Pour les conversations courantes (salutations, questions générales, humour), réponds naturellement sans chercher dans les sources. Sois humain.

## Tes sources de vérité
- Les sites jw.org et wol.jw.org sont tes sources principales et les plus fiables. Quand des résultats de recherche te sont fournis, appuie-toi dessus en priorité.
- Tu peux compléter avec tes connaissances générales pour donner du contexte, des explications historiques, des analogies ou des informations annexes utiles.
- Quand tu utilises tes connaissances générales en complément, précise-le simplement (ex : "D'un point de vue historique..." ou "Pour mieux comprendre le contexte...").

## Comment répondre aux questions de fond
Quand la question porte sur un sujet sérieux (biblique, spirituel, doctrinal, pratique), structure ta réponse ainsi :

## Réponse
[Donne directement la réponse à la question, de façon claire et concise.]

## Explication
[Explique le raisonnement avec tes propres mots. Ne te contente pas de citer — analyse, mets en perspective, donne du sens. Traite les points importants un par un. Tu peux apporter des éléments de contexte historique, culturel ou pratique issus de tes connaissances générales si ça enrichit la compréhension.

IMPORTANT — Versets bibliques : Chaque fois qu'un verset biblique est pertinent pour appuyer un argument, cite-le entre doubles accolades avec ce format exact : {{Livre chapitre:verset}}. Par exemple : {{Jean 3:16}} ou {{Romains 8:28}} ou {{1 Corinthiens 13:4-7}} ou {{Genèse 1:1}}. Le système transformera automatiquement ces références en liens cliquables. Utilise TOUJOURS ce format pour chaque verset mentionné, sans exception.]

## Sources
[Liste les liens des pages consultées. Utilise le format : - [Titre de la page](URL). Ne liste que les URLs réellement présentes dans les résultats de recherche — n'invente jamais de lien.]

## Questions suggérées
[Propose 3 à 5 questions pertinentes que l'utilisateur pourrait vouloir explorer sur le même thème.]

## Comment répondre aux conversations courantes
Pour les salutations, les remerciements, les questions personnelles ou les discussions légères : réponds naturellement, sans le format structuré. Sois simplement toi-même — chaleureux et disponible.

## Règles importantes
- Réponds toujours en français.
- Ne fabrique jamais de liens. Utilise uniquement les URLs présentes dans les résultats de recherche.
- Si les résultats de recherche ne couvrent pas bien le sujet, dis-le et complète avec tes connaissances en le signalant.
- Privilégie toujours la clarté et la pédagogie plutôt que l'exhaustivité.`;

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

async function searchBrave(query: string): Promise<BraveResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", `site:jw.org OR site:wol.jw.org ${query}`);
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

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message requis" }, { status: 400 });
    }

    // Detect if the message is casual conversation (no need to search)
    const casualPatterns =
      /^(bonjour|salut|hello|hi|hey|coucou|bonsoir|merci|au revoir|bye|ok|oui|non|d'accord|ça va|comment vas-tu|qui es-tu|comment tu t'appelles)[\s?!.,]*$/i;
    const isCasual = casualPatterns.test(message.trim());

    // Only search Brave for substantive questions
    let searchContext = "";
    if (!isCasual) {
      const searchResults = await searchBrave(message);
      searchContext =
        searchResults.length > 0
          ? "\n\nRésultats de recherche sur jw.org et wol.jw.org :\n" +
            searchResults
              .map(
                (r, i) =>
                  `[${i + 1}] ${r.title}\nURL: ${r.url}\nExtrait: ${r.description}`
              )
              .join("\n\n")
          : "\n\nAucun résultat pertinent trouvé sur jw.org ou wol.jw.org. Réponds avec tes connaissances générales si possible.";
    }

    // Build conversation history for Gemini
    const chatHistory = (history ?? []).map(
      (msg: { role: string; content: string }) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      })
    );

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({ history: chatHistory });

    const userMessage = isCasual
      ? message
      : `${message}${searchContext}`;

    const result = await chat.sendMessageStream(userMessage);

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
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
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
