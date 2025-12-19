
import { GoogleGenAI } from "@google/genai";
import { PipeSegment } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  async analyzeProject(pipes: PipeSegment[], mode: 'SAFETY' | 'MTO'): Promise<string> {
    const model = 'gemini-3-flash-preview';
    const systemInstruction = mode === 'SAFETY' 
      ? "شما یک مهندس ناظر ارشد گاز هستید. لیست لوله‌ها و اتصالات یک نقشه ایزومتریک گاز را دریافت می‌کنید. ایرادات فنی، عدم رعایت استانداردهای ایمنی (مانند فاصله از شیرآلات، سایز نامناسب برای مصرف‌کننده‌ها) را به صورت لیست موردی به زبان فارسی تخصصی و محترمانه بیان کنید."
      : "شما یک کارشناس متره و برآورد هستید. لیست لوله‌ها و اتصالات را بررسی کرده و یک گزارش MTO دقیق شامل مجموع متراژ هر سایز لوله و تعداد دقیق هر نوع اتصال استخراج کنید. خروجی را در قالب یک جدول تمیز فارسی ارائه دهید.";

    const prompt = `لیست داده‌های پروژه به صورت JSON:\n${JSON.stringify(pipes, null, 2)}`;

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      return response.text || "پاسخی از هوش مصنوعی دریافت نشد.";
    } catch (error) {
      console.error("Gemini Error:", error);
      return "خطا در ارتباط با سرور هوش مصنوعی. لطفا دوباره تلاش کنید.";
    }
  }
}

export const geminiService = new GeminiService();
