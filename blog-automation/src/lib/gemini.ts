import { GoogleGenerativeAI, Type } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Create the AI client if the key is available
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface BlogGenerationRequest {
  topic: string;
  keywords: string[];
  platform: 'naver' | 'blogspot' | 'general';
  tone: 'informative' | 'friendly' | 'professional' | 'storytelling' | 'humorous';
  length: 'short' | 'medium' | 'long';
  additionalInstructions?: string;
}

export interface GeneratedBlog {
  title: string;
  content: string;
  metaDescription: string;
  tags: string[];
  seoAdvice: string[];
}

export async function generateBlogPost(req: BlogGenerationRequest): Promise<GeneratedBlog> {
  if (!genAI) {
    throw new Error("VITE_GEMINI_API_KEY environment variable is missing. Please set it in your .env file.");
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Engaging and SEO-friendly title of the blog post" },
          content: { type: Type.STRING, description: "Detailed blog post content formatted in rich Markdown" },
          metaDescription: { type: Type.STRING, description: "SEO meta description (150-160 characters)" },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Relevant tags or hashtags for the post"
          },
          seoAdvice: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of SEO-specific recommendations fulfilled in this article"
          }
        },
        required: ["title", "content", "metaDescription", "tags", "seoAdvice"],
      }
    }
  });

  const keywordsString = req.keywords.join(', ');
  
  let platformStyle = "";
  if (req.platform === 'naver') {
    platformStyle = `
      - Style for Naver Blog: Naver Blog posts should feel highly friendly, personal, and interactive.
      - Use a conversational tone with frequent, relevant emojis (⭐, 👍, 📍, 💡, etc.) to break up text blocks.
      - Naver users prefer detailed, narrative-style posts (e.g. personal experience style: "안녕하세요! 오늘은 ~에 다녀왔어요" / "꿀팁을 공유해볼게요").
      - Emphasize clear formatting: use headers, bold text for key terms, and bullet points.
      - Include a natural introduction, detailed body, and helpful summary at the end.
    `;
  } else if (req.platform === 'blogspot') {
    platformStyle = `
      - Style for Blogspot (Blogger): Blogspot posts should follow standard global search engine optimization (SEO) standards.
      - Use semantic HTML/Markdown hierarchy (H1 for title, H2/H3 for subheadings).
      - Maintain a professional yet readable style. Focus on structured paragraphs, quick summaries, and clear call-to-actions.
      - Incorporate the keywords naturally within headings and the first 100 words.
    `;
  } else {
    platformStyle = `
      - Style for General Web/Medium: Informative, well-structured, clear flow of thought.
      - Balanced use of formatting, headings, and lists to improve readability.
    `;
  }

  const lengthGuide = {
    short: "around 600 - 800 Korean characters (excluding spaces). Focus on a brief, punchy overview.",
    medium: "around 1200 - 1500 Korean characters. Provide a balanced, detailed guide with examples.",
    long: "around 2500 - 3000 Korean characters. Create a comprehensive, deep-dive article covering all subtopics thoroughly."
  }[req.length];

  const prompt = `
    You are an expert SEO copywriter and professional blogger. Write a highly engaging blog post in Korean.

    [Inputs]
    - Topic/Subject: ${req.topic}
    - Keywords to target: ${keywordsString} (You must integrate these keywords naturally throughout the text, especially in subheadings and introductory paragraphs)
    - Target Platform: ${req.platform.toUpperCase()}
    - Tone of Voice: ${req.tone}
    - Article Length: ${lengthGuide}
    ${req.additionalInstructions ? `- Additional Custom Instructions: ${req.additionalInstructions}` : ''}

    [Platform-Specific Guidelines]
    ${platformStyle}

    [SEO Optimization Rules]
    - Naturally weave in the keywords: ${keywordsString}
    - Ensure headings follow a logical structure.
    - Write a short meta description summarizing the post.
    - Suggest tags/hashtags related to the topic.
    - Explain in 'seoAdvice' why the post is SEO-optimized (e.g., keyword density, heading structure, user intent matching).

    Generate the output in the requested JSON structure. Keep all content in Korean. Do not include markdown wraps around the JSON itself.
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return JSON.parse(responseText) as GeneratedBlog;
  } catch (error) {
    console.error("Error generating blog post with Gemini:", error);
    throw error;
  }
}
