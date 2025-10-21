import { GoogleGenAI } from "@google/genai";
import type { AspectRatio } from '../types';

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenError';
  }
}

const URL = "https://aisandbox-pa.googleapis.com/v1/whisk:generateImage";

const BASE_HEADERS = {
    "accept": "*/*",
    "content-type": "text/plain;charset=UTF-8",
    "origin": "https://labs.google",
    "referer": "https://labs.google/"
};

let ai: GoogleGenAI | null = null;
try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (e) {
  console.error("Failed to initialize GoogleGenAI. AI features will be disabled.", e);
}

const aspectRatioMap: Record<AspectRatio, string> = {
  '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
  '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
  '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
};

const buildPayload = (prompt: string, aspect: AspectRatio, seed: number) => {
    return {
        "clientContext": {
            "workflowId": "209e9d06-c1d8-4498-aadc-66ef5bc67b64",
            "tool": "BACKBONE",
            "sessionId": `;${Date.now()}`
        },
        "imageModelSettings": {
            "imageModel": "IMAGEN_3_5",
            "aspectRatio": aspectRatioMap[aspect]
        },
        "seed": seed,
        "prompt": prompt,
        "mediaCategory": "MEDIA_CATEGORY_BOARD"
    };
};

const findB64 = (obj: any): string | null => {
    if (!obj) return null;
    if (typeof obj === 'string') {
        if (obj.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(obj)) {
            return obj.trim();
        }
    } else if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findB64(item);
            if (result) return result;
        }
    } else if (typeof obj === 'object') {
        for (const key in obj) {
            const result = findB64(obj[key]);
            if (result) return result;
        }
    }
    return null;
}

const extractBase64FromResponse = (data: any): string | null => {
    try {
        const directPath = data?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;
        if (directPath && typeof directPath === 'string') {
            return directPath;
        }
    } catch (e) { /* Ignore */ }
    return findB64(data);
};

export const generateImage = async (prompt: string, aspectRatio: AspectRatio, token: string): Promise<string> => {
    const seed = Math.floor(Math.random() * 2147483647);
    const payload = buildPayload(prompt, aspectRatio, seed);
    const headers = {
        ...BASE_HEADERS,
        "Authorization": `Bearer ${token}`
    };

    try {
        const response = await fetch(URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();

        if (!response.ok) {
            let errorMsg = `Lỗi API: ${response.status}`;
            if (responseData?.error?.message) {
                errorMsg += ` . Chi tiết: ${JSON.stringify(responseData)}`;
            }
             if (response.status === 401 || response.status === 403) {
                throw new TokenError("Token không hợp lệ hoặc đã hết hạn.");
            }
            throw new Error(errorMsg);
        }

        const b64 = extractBase64FromResponse(responseData);

        if (!b64) {
             throw new Error(`Không tìm thấy dữ liệu ảnh trong phản hồi API.`);
        }
        return b64;

    } catch (error) {
        console.error("Lỗi Fetch API:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Đã xảy ra lỗi mạng hoặc lỗi không xác định khi tạo ảnh.");
    }
};


export const fixPromptWithAI = async (failedPrompt: string): Promise<string> => {
    if (!ai) {
        throw new Error("Chưa cấu hình Gemini API. Không thể sử dụng tính năng AI.");
    }
    const systemInstruction = "Bạn là chuyên gia sửa đổi prompt tạo ảnh. Prompt của người dùng đã bị từ chối vì vi phạm chính sách an toàn. Nhiệm vụ của bạn là viết lại nó để trở nên an toàn và tuân thủ, đồng thời giữ lại ý định nghệ thuật ban đầu càng nhiều càng tốt. CHỈ trả lời bằng prompt đã được sửa đổi và không có gì khác. Không thêm bất kỳ bình luận, lời mở đầu hay giải thích nào.";
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Prompt gốc: "${failedPrompt}"`,
            config: { systemInstruction },
        });
        const fixedPrompt = response.text.trim().replace(/^"|"$/g, '');
        if (!fixedPrompt) {
            throw new Error("AI trả về một phản hồi rỗng.");
        }
        return fixedPrompt;
    } catch (error) {
        console.error("Lỗi khi sửa prompt bằng AI:", error);
        if (error instanceof Error) {
            throw new Error(`Lỗi AI Fixer: ${error.message}`);
        }
        throw new Error("Đã xảy ra lỗi không xác định khi sửa prompt bằng AI.");
    }
};
