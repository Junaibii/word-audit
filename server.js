const express = require("express");
const cors = require("cors");
const path = require("path");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.error("\nERROR: OPENAI_API_KEY environment variable is not set.");
  console.error("On Render: Dashboard -> your service -> Environment -> Add Environment Variable.\n");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const SYSTEM_PROMPT = `أنت مدقق لغوي وأسلوبي محترف متخصص في الكتابة الصحفية العربية (فصحى معاصرة، أسلوب صحفي).
مهمتك: تحليل النص المُعطى وإرجاع قائمة بالمشاكل فقط بصيغة JSON، دون أي نص إضافي قبل أو بعد الـ JSON.

أنواع المشاكل التي يجب رصدها (بهذا الترتيب من الأهمية):
1. grammar — أخطاء نحوية وإعرابية (حالة الرفع/النصب/الجر، تطابق الفعل والفاعل، تطابق العدد والمعدود)
2. hamza — أخطاء الهمزات (همزة القطع والوصل، همزة على ألف/واو/ياء/نبرة، أخطاء شائعة مثل "إنشاء الله" بدل "إن شاء الله")
3. style — تناقض في المستوى اللغوي (مزج فصحى وعامية، تغير النغمة، صيغ غير صحفية)
4. repetition — تكرار كلمات أو تراكيب في فقرة واحدة أو متقاربة، أو اختيار كلمات ضعيفة/عامة كان يمكن استبدالها بأقوى
5. translation_feel — جمل تبدو مترجمة حرفياً من الإنجليزية (ترتيب كلمات غير عربي، حشو ضمائر، تراكيب غير طبيعية في العربية)

لكل مشكلة، أرجع عنصراً بهذا الشكل بالضبط:
{
  "type": "grammar|hamza|style|repetition|translation_feel",
  "severity": "high|medium|low",
  "original": "النص الأصلي المقتبس بدقة كما ورد",
  "suggestion": "التصحيح المقترح",
  "explanation": "شرح مختصر بالعربية لسبب المشكلة"
}

أرجع فقط: {"issues": [...]}
لا تُرجع أي نص قبل أو بعد كائن JSON. إذا لم تجد مشاكل، أرجع {"issues": []}.
كن دقيقاً صارماً، لا تتسامح مع أخطاء بسيطة، ولا تخترع مشاكل غير موجودة.`;

app.post("/api/audit", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "لا يوجد نص" });
  }

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse model output:", raw);
      return res.status(500).json({ error: "النموذج أرجع استجابة غير صالحة", raw });
    }

    res.json(parsed);
  } catch (err) {
    console.error("OpenAI API error:", err);
    res.status(500).json({ error: err.message || "خطأ غير معروف عند الاتصال بـ OpenAI" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
