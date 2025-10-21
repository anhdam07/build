
import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResult, ImagePromptResult } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisResponseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      section: {
        type: Type.INTEGER,
        description: "Số thứ tự của phần nội dung."
      },
      subtitleLine: {
        type: Type.INTEGER,
        description: "Dòng phụ đề tương ứng với cuối phần nội dung."
      },
    },
    required: ["section", "subtitleLine"]
  }
};

export const analyzeContentAndSubtitles = async (
  contentFileText: string,
  subtitleFileText: string
): Promise<AnalysisResult[]> => {
  const model = "gemini-2.5-flash";

  const prompt = `
    Bạn là một trợ lý AI thông minh chuyên phân tích và đồng bộ hóa văn bản. Nhiệm vụ của bạn là căn chỉnh một tệp nội dung với một tệp phụ đề tương ứng.

    BỐI CẢNH:
    - **Tệp Nội Dung:** Văn bản này được chia thành các phần được đánh số (ví dụ: "1.", "2.", "3.", ...).
    - **Tệp Phụ Đề:** Văn bản này chứa các dòng phụ đề, mỗi dòng có một số thứ tự ngầm định bắt đầu từ 1. Tệp phụ đề có thể chứa lỗi, thiếu sót hoặc các dòng không khớp chính xác với tệp nội dung.

    YÊU CẦU:
    Đối với MỖI phần được đánh số trong Tệp Nội Dung, hãy xác định dòng CUỐI CÙNG trong Tệp Phụ Đề tương ứng với sự kết thúc của phần đó. Bạn cần sử dụng khả năng hiểu ngữ cảnh để tìm ra sự tương ứng hợp lý nhất, ngay cả khi văn bản không giống hệt nhau.

    ĐỊNH DẠNG ĐẦU RA:
    Chỉ trả về một mảng JSON hợp lệ. KHÔNG thêm bất kỳ giải thích, ghi chú, hay ký tự nào khác ngoài mảng JSON.
    Mỗi đối tượng trong mảng phải có hai thuộc tính: 'section' (số nguyên, là số của phần) và 'subtitleLine' (số nguyên, là số dòng phụ đề tương ứng).

    DỮ LIỆU ĐẦU VÀO:

    --- TỆP NỘI DUNG BẮT ĐẦU ---
    ${contentFileText}
    --- TỆP NỘI DUNG KẾT THÚC ---

    --- TỆP PHỤ ĐỀ BẮT ĐẦU ---
    ${subtitleFileText}
    --- TỆP PHỤ ĐỀ KẾT THÚC ---

    Hãy phân tích và trả về kết quả dưới dạng JSON theo yêu cầu.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisResponseSchema,
        temperature: 0.2,
      },
    });

    const jsonString = response.text.trim();
    
    const cleanedJsonString = jsonString.startsWith("```json") 
      ? jsonString.replace(/^```json\s*|```$/g, "") 
      : jsonString;

    const result: AnalysisResult[] = JSON.parse(cleanedJsonString);
    return result;
  } catch (error) {
    console.error("Lỗi khi gọi Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Không thể phân tích nội dung. Lỗi từ AI: ${error.message}`);
    }
    throw new Error("Không thể phân tích nội dung do lỗi không xác định từ AI.");
  }
};


const imagePromptResponseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        subtitleIndex: {
          type: Type.INTEGER,
          description: "Số thứ tự của dòng phụ đề gốc."
        },
        subtitleText: {
          type: Type.STRING,
          description: "Nội dung văn bản của dòng phụ đề."
        },
        imagePrompt: {
          type: Type.STRING,
          description: "Prompt hình ảnh bằng tiếng Anh được tạo ra cho dòng phụ đề này."
        },
      },
      required: ["subtitleIndex", "subtitleText", "imagePrompt"]
    }
};
  
export const generateImagePrompts = async (
    subtitleFileText: string,
    conditions: string
): Promise<ImagePromptResult[]> => {
    const model = "gemini-2.5-flash";

    const prompt = `
      Bạn là một kỹ sư prompt chuyên nghiệp cho các mô hình tạo ảnh AI (như Midjourney, Stable Diffusion). Nhiệm vụ của bạn là chuyển đổi các dòng phụ đề thành các prompt hình ảnh chi tiết, sống động và đầy cảm hứng.
  
      YÊU CẦU:
      1. Đọc từng dòng phụ đề được cung cấp trong tệp SRT.
      2. Kết hợp nội dung của phụ đề với các "Điều kiện & Phong cách" do người dùng đưa ra.
      3. Tạo ra một prompt hình ảnh BẰNG TIẾNG ANH, mô tả cảnh một cách chi tiết. Prompt phải bao gồm chủ thể, hành động, bối cảnh, ánh sáng, và phong cách nghệ thuật.
      4. Giữ nguyên tinh thần và ý nghĩa cốt lõi của dòng phụ đề gốc.
      
      ĐIỀU KIỆN & PHONG CÁCH TỪ NGƯỜI DÙNG:
      "${conditions}"
  
      DANH SÁCH PHỤ ĐỀ ĐẦU VÀO (Định dạng SRT):
      --- BẮT ĐẦU ---
      ${subtitleFileText}
      --- KẾT THÚC ---
  
      ĐỊNH DẠNG ĐẦU RA:
      Chỉ trả về một mảng JSON hợp lệ, KHÔNG có bất kỳ văn bản giải thích nào khác. Mỗi đối tượng trong mảng phải chứa 'subtitleIndex' (số thứ tự của dòng phụ đề), 'subtitleText' (văn bản phụ đề gốc), và 'imagePrompt' (prompt hình ảnh đã tạo).
    `;
  
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: imagePromptResponseSchema,
              temperature: 0.7, 
            },
          });
      
          const jsonString = response.text.trim();
          const cleanedJsonString = jsonString.startsWith("```json") 
            ? jsonString.replace(/^```json\s*|```$/g, "") 
            : jsonString;
      
          const result: ImagePromptResult[] = JSON.parse(cleanedJsonString);
          return result;

    } catch (error) {
      console.error("Lỗi khi gọi Gemini API để tạo prompt:", error);
      if (error instanceof Error) {
          throw new Error(`Không thể tạo prompt. Lỗi từ AI: ${error.message}`);
      }
      throw new Error("Không thể tạo prompt do lỗi không xác định từ AI.");
    }
};
