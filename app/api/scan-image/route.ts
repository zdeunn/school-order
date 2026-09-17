import { NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-1.5-flash";
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

// اقتصار القائمة على الصيغ المدعومة رسمياً لـ inlineData
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EXTRACTION_PROMPT = `
أنت مساعد متخصص في قراءة قوائم الأدوات المدرسية من الصور (سواء كانت مطبوعة أو مكتوبة بخط اليد).
افحص الصورة المرفقة واستخرج منها كل عنصر/أداة مدرسية مذكورة مع الكمية المطلوبة لكل عنصر.

القواعد:
- إن لم تُذكر كمية عنصر ما بشكل صريح، اعتبر الكمية 1.
- تجاهل أي نص لا يمثل اسم أداة مدرسية (كعناوين، تواريخ، أسماء تلاميذ، أو ملاحظات عامة).
- استخرج أسماء العناصر كما وردت في الصورة قدر الإمكان (بالعربية أو الفرنسية حسب ما هو مكتوب).
- إن لم تستطع قراءة أي عنصر بوضوح من الصورة، أعد مصفوفة فارغة.
`.trim();

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured");
      return NextResponse.json(
        { error: "خدمة التعرف على الصور غير مُهيّأة حالياً" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get("image");

    if (!imageFile || !(imageFile instanceof Blob)) {
      return NextResponse.json({ error: "يرجى إرفاق صورة صالحة" }, { status: 400 });
    }

    if (imageFile.size === 0) {
      return NextResponse.json({ error: "الصورة المرفقة فارغة" }, { status: 400 });
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "حجم الصورة كبير جداً (الحد الأقصى 8 ميجابايت)" }, { status: 400 });
    }

    const mimeType = imageFile.type || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: "صيغة الصورة غير مدعومة. يرجى استخدام JPG, PNG, أو WEBP" }, { status: 400 });
    }

    const imageArrayBuffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(imageArrayBuffer).toString("base64");

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: EXTRACTION_PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                items: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      quantity: { type: "INTEGER" },
                    },
                    required: ["name", "quantity"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API Error:", geminiResponse.status, errorText);
      return NextResponse.json(
        { error: "تعذر الاتصال بخدمة التعرف على الصور، حاول لاحقاً" },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    let rawText: string | undefined =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("Gemini returned no text:", JSON.stringify(geminiData));
      return NextResponse.json(
        { error: "لم يتمكن الذكاء الاصطناعي من قراءة الصورة" },
        { status: 502 }
      );
    }

    // تنظيف النص في حال إرجاع Markdown Code Block
    rawText = rawText.replace(/```json\s*|```/g, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini JSON output:", rawText);
      return NextResponse.json(
        { error: "تعذر تحليل نتيجة التعرف على الصورة" },
        { status: 502 }
      );
    }

    const items = (parsed as { items?: unknown })?.items;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "لم يتم العثور على تنسيق صالح لعناصر القائمة" },
        { status: 502 }
      );
    }

    const cleanedItems = items
      .filter(
        (item): item is { name: unknown; quantity: unknown } =>
          typeof item === "object" && item !== null
      )
      .map((item) => ({
        name: typeof item.name === "string" ? item.name.trim() : "",
        quantity:
          typeof item.quantity === "number" && item.quantity > 0
            ? Math.round(item.quantity)
            : 1,
      }))
      .filter((item) => item.name.length > 0);

    if (cleanedItems.length === 0) {
      return NextResponse.json(
        { error: "لم يتم التعرف على أي عناصر واضحة في الصورة، حاول بصورة أوضح" },
        { status: 422 }
      );
    }

    return NextResponse.json({ items: cleanedItems }, { status: 200 });
  } catch (error) {
    console.error("Scan Image Error:", error);
    return NextResponse.json(
      { error: "حدث خطأ أثناء معالجة الصورة" },
      { status: 500 }
    );
  }
}