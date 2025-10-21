"""Colab-friendly pipeline that reproduces the React app's workflow without a GUI.

The module exposes a small Python API that can be executed from a Google Colab
notebook.  It keeps the behaviour of the original app:

1. Analyse a numbered content document against an SRT subtitle file via Gemini.
2. Derive merge rules and merge the SRT blocks.
3. Generate English image prompts based on the merged subtitles.
4. Optionally generate images through the Google AI Sandbox endpoint (requires
   bearer tokens) and offer an AI powered prompt fixer.

Example usage inside Colab::

    from google.colab import files
    uploaded = files.upload()  # upload content.txt and subtitles.srt
    from colab.pipeline import SubtitleWorkflow, prompt_for_gemini_api_key

    api_key = prompt_for_gemini_api_key()
    workflow = SubtitleWorkflow(api_key)

    content_text = uploaded['content.txt'].decode('utf-8')
    subtitle_text = uploaded['subtitles.srt'].decode('utf-8')

    analysis = workflow.analyse_content(content_text, subtitle_text)
    merged, merge_rules = workflow.merge_subtitles_from_analysis(
        subtitle_text, analysis, merge_words_config="5;8;10"
    )
    prompt_results = workflow.generate_image_prompts(merged)
    image_results = workflow.generate_images(
        [p.image_prompt for p in prompt_results],
        tokens=["ya29...."],
    )

The helper functions expose granular steps so users can run them in separate
Colab cells if preferred.
"""

from __future__ import annotations

import json
import random
import re
import time
import textwrap
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import requests

import google.generativeai as genai


@dataclass
class AnalysisResult:
    """Alignment result between a numbered content section and subtitle line."""

    section: int
    subtitle_line: int


@dataclass
class MergeRule:
    """Rule describing how far to process and when to merge short subtitle lines."""

    process_up_to_line: int
    merge_lines_with_fewer_than: int


@dataclass
class ImagePromptResult:
    """Prompt generated from a subtitle snippet."""

    subtitle_index: int
    subtitle_text: str
    image_prompt: str


@dataclass
class ImageGenerationResult:
    """Holds the outcome for a single generated image."""

    prompt: str
    status: str
    error: Optional[str] = None
    image_data: Optional[str] = None


@dataclass
class _SubtitleBlock:
    index: int
    start_time: str
    end_time: str
    text: str


_TIME_PATTERN = re.compile(
    r"(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})"
)

_AI_SANDBOX_URL = "https://aisandbox-pa.googleapis.com/v1/whisk:generateImage"
_AI_SANDBOX_HEADERS = {
    "accept": "*/*",
    "content-type": "text/plain;charset=UTF-8",
    "origin": "https://labs.google",
    "referer": "https://labs.google/",
}


class TokenError(RuntimeError):
    """Raised when an API token is rejected by the image generation endpoint."""


def configure_gemini(api_key: str) -> None:
    """Configure the google-generativeai SDK with the provided API key."""

    api_key = api_key.strip()
    if not api_key:
        raise ValueError("API key must be a non-empty string")
    genai.configure(api_key=api_key)


def prompt_for_gemini_api_key(message: str = "Nhập Gemini API key: ") -> str:
    """Prompt the user for a Gemini API key, masking input when possible."""

    try:  # Use getpass for nicer UX when available.
        from getpass import getpass

        key = getpass(message)
    except (ImportError, EOFError):  # Fallback to input() if getpass fails.
        key = input(message)  # type: ignore[arg-type]
    return key.strip()


def _clean_json_response(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = re.sub(r"^```json\s*|```$", "", cleaned).strip()
    elif cleaned.startswith("```"):
        cleaned = re.sub(r"^```\w*\s*|```$", "", cleaned).strip()
    return cleaned


def _parse_analysis_results(payload: str) -> List[AnalysisResult]:
    try:
        parsed = json.loads(payload)
        results = [
            AnalysisResult(
                section=int(item["section"]),
                subtitle_line=int(item["subtitleLine"]),
            )
            for item in parsed
        ]
        return results
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError(
            "Không thể phân tích phản hồi phân tích. Hãy kiểm tra lại nội dung và thử lại."
        ) from exc


def _parse_prompt_results(payload: str) -> List[ImagePromptResult]:
    try:
        parsed = json.loads(payload)
        results = [
            ImagePromptResult(
                subtitle_index=int(item["subtitleIndex"]),
                subtitle_text=str(item["subtitleText"]),
                image_prompt=str(item["imagePrompt"]),
            )
            for item in parsed
        ]
        return results
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError(
            "Không thể đọc phản hồi tạo prompt. Kiểm tra dữ liệu đầu vào và thử lại."
        ) from exc


def _parse_srt(content: str) -> List[_SubtitleBlock]:
    blocks: List[_SubtitleBlock] = []
    raw_blocks = content.strip().replace("\r", "").split("\n\n")
    for raw in raw_blocks:
        lines = [line.strip("\ufeff").strip() for line in raw.strip().split("\n") if line.strip()]
        if len(lines) < 3:
            continue
        try:
            index = int(lines[0])
        except ValueError:
            continue
        time_match = _TIME_PATTERN.match(lines[1])
        if not time_match:
            continue
        start_time = time_match.group(1).replace(".", ",")
        end_time = time_match.group(2).replace(".", ",")
        text = "\n".join(lines[2:])
        blocks.append(_SubtitleBlock(index, start_time, end_time, text))
    return blocks


def _stringify_srt(blocks: Sequence[_SubtitleBlock]) -> str:
    return "\n\n".join(
        f"{block.index}\n{block.start_time} --> {block.end_time}\n{block.text}" for block in blocks
    ) + "\n"


def _count_words(text: str) -> int:
    words = [token for token in re.split(r"\s+", text.strip()) if token]
    return len(words)


def _get_rule_for_line(line_number: int, rules: Sequence[MergeRule]) -> Optional[MergeRule]:
    start_line = 1
    for rule in rules:
        if start_line <= line_number <= rule.process_up_to_line:
            return rule
        start_line = rule.process_up_to_line + 1
    if rules and line_number > rules[-1].process_up_to_line:
        return rules[-1]
    return None


def merge_srt_with_rules(subtitle_text: str, rules: Sequence[MergeRule]) -> str:
    original_blocks = _parse_srt(subtitle_text)
    if len(original_blocks) < 2:
        return subtitle_text

    merged_blocks: List[_SubtitleBlock] = []
    i = 0
    while i < len(original_blocks):
        current = _SubtitleBlock(**vars(original_blocks[i]))
        current_rule = _get_rule_for_line(current.index, rules)
        if current_rule and _count_words(current.text) < current_rule.merge_lines_with_fewer_than:
            while i + 1 < len(original_blocks):
                nxt = original_blocks[i + 1]
                next_rule = _get_rule_for_line(nxt.index, rules)
                if current_rule != next_rule:
                    break
                current.end_time = nxt.end_time
                current.text = f"{current.text.strip()} {nxt.text.strip()}".strip()
                i += 1
                if _count_words(current.text) >= current_rule.merge_lines_with_fewer_than:
                    break
        merged_blocks.append(current)
        i += 1

    reindexed = [
        _SubtitleBlock(index=idx + 1, start_time=block.start_time, end_time=block.end_time, text=block.text)
        for idx, block in enumerate(merged_blocks)
    ]
    return _stringify_srt(reindexed)


def _parse_merge_words_config(config: str) -> List[int]:
    values = []
    for part in config.split(";"):
        part = part.strip()
        if not part:
            continue
        try:
            number = int(part)
        except ValueError:
            continue
        if number > 0:
            values.append(number)
    if not values:
        values.append(5)
    return values


def build_merge_rules(
    analysis: Sequence[AnalysisResult], merge_words_config: str
) -> List[MergeRule]:
    thresholds = _parse_merge_words_config(merge_words_config)

    def threshold_for_index(idx: int) -> int:
        if idx < len(thresholds):
            return thresholds[idx]
        return thresholds[-1]

    rules: List[MergeRule] = []
    for idx, result in enumerate(analysis):
        rules.append(
            MergeRule(
                process_up_to_line=result.subtitle_line,
                merge_lines_with_fewer_than=threshold_for_index(idx),
            )
        )
    return rules


def _build_image_payload(prompt: str, aspect_ratio: str, seed: Optional[int] = None) -> dict:
    aspect_map = {
        "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
        "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
        "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
    }
    if aspect_ratio not in aspect_map:
        raise ValueError("Aspect ratio must be one of '1:1', '16:9', '9:16'")
    if seed is None:
        seed = random.randint(0, 2_147_483_647)
    return {
        "clientContext": {
            "workflowId": "209e9d06-c1d8-4498-aadc-66ef5bc67b64",
            "tool": "BACKBONE",
            "sessionId": f";{int(time.time() * 1000)}",
        },
        "imageModelSettings": {
            "imageModel": "IMAGEN_3_5",
            "aspectRatio": aspect_map[aspect_ratio],
        },
        "seed": seed,
        "prompt": prompt,
        "mediaCategory": "MEDIA_CATEGORY_BOARD",
    }


def _find_base64(obj: object) -> Optional[str]:
    if obj is None:
        return None
    if isinstance(obj, str):
        if len(obj) > 200 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", obj):
            return obj.strip()
        return None
    if isinstance(obj, dict):
        for value in obj.values():
            found = _find_base64(value)
            if found:
                return found
        return None
    if isinstance(obj, list):
        for item in obj:
            found = _find_base64(item)
            if found:
                return found
        return None
    return None


def _extract_base64_from_response(data: dict) -> Optional[str]:
    if not isinstance(data, dict):
        return _find_base64(data)

    image_panels = data.get("imagePanels")
    if isinstance(image_panels, list) and image_panels:
        first_panel = image_panels[0]
        if isinstance(first_panel, dict):
            generated = first_panel.get("generatedImages")
            if isinstance(generated, list) and generated:
                first_image = generated[0]
                if isinstance(first_image, dict):
                    encoded = first_image.get("encodedImage")
                    if isinstance(encoded, str) and encoded.strip():
                        return encoded.strip()

    return _find_base64(data)


class SubtitleWorkflow:
    """High level orchestration helper for Colab notebooks."""

    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash") -> None:
        configure_gemini(api_key)
        self.model_name = model_name

    # --- Gemini helpers -------------------------------------------------
    def _structured_model(self, *, temperature: float, response_schema: dict) -> genai.GenerativeModel:
        return genai.GenerativeModel(
            model_name=self.model_name,
            generation_config={
                "temperature": temperature,
                "response_mime_type": "application/json",
                "response_schema": response_schema,
            },
        )

    def analyse_content(self, content_text: str, subtitle_text: str) -> List[AnalysisResult]:
        prompt = textwrap.dedent(
            f"""
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
    {content_text}
    --- TỆP NỘI DUNG KẾT THÚC ---

    --- TỆP PHỤ ĐỀ BẮT ĐẦU ---
    {subtitle_text}
    --- TỆP PHỤ ĐỀ KẾT THÚC ---

    Hãy phân tích và trả về kết quả dưới dạng JSON theo yêu cầu.
            """
        ).strip()
        schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "section": {"type": "INTEGER"},
                    "subtitleLine": {"type": "INTEGER"},
                },
                "required": ["section", "subtitleLine"],
            },
        }
        model = self._structured_model(temperature=0.2, response_schema=schema)
        response = model.generate_content(prompt)
        payload = _clean_json_response(response.text or "")
        return _parse_analysis_results(payload)

    def merge_subtitles_from_analysis(
        self,
        subtitle_text: str,
        analysis: Sequence[AnalysisResult],
        *,
        merge_words_config: str = "5",
    ) -> Tuple[str, List[MergeRule]]:
        if not analysis:
            raise ValueError("Phân tích không trả về dữ liệu. Không thể gộp phụ đề.")
        rules = build_merge_rules(analysis, merge_words_config)
        merged = merge_srt_with_rules(subtitle_text, rules)
        return merged, rules

    def generate_image_prompts(
        self,
        subtitle_text: str,
        conditions: str = "cinematic, 4k, hyper-realistic, detailed, professional color grading, soft light",
    ) -> List[ImagePromptResult]:
        prompt = textwrap.dedent(
            f"""
      Bạn là một kỹ sư prompt chuyên nghiệp cho các mô hình tạo ảnh AI (như Midjourney, Stable Diffusion). Nhiệm vụ của bạn là chuyển đổi các dòng phụ đề thành các prompt hình ảnh chi tiết, sống động và đầy cảm hứng.

      YÊU CẦU:
      1. Đọc từng dòng phụ đề được cung cấp trong tệp SRT.
      2. Kết hợp nội dung của phụ đề với các "Điều kiện & Phong cách" do người dùng đưa ra.
      3. Tạo ra một prompt hình ảnh BẰNG TIẾNG ANH, mô tả cảnh một cách chi tiết. Prompt phải bao gồm chủ thể, hành động, bối cảnh, ánh sáng, và phong cách nghệ thuật.
      4. Giữ nguyên tinh thần và ý nghĩa cốt lõi của dòng phụ đề gốc.

      ĐIỀU KIỆN & PHONG CÁCH TỪ NGƯỜI DÙNG:
      "{conditions}"

      DANH SÁCH PHỤ ĐỀ ĐẦU VÀO (Định dạng SRT):
      --- BẮT ĐẦU ---
      {subtitle_text}
      --- KẾT THÚC ---

      ĐỊNH DẠNG ĐẦU RA:
      Chỉ trả về một mảng JSON hợp lệ, KHÔNG có bất kỳ văn bản giải thích nào khác. Mỗi đối tượng trong mảng phải chứa 'subtitleIndex' (số thứ tự của dòng phụ đề), 'subtitleText' (văn bản phụ đề gốc), và 'imagePrompt' (prompt hình ảnh đã tạo).
            """
        ).strip()
        schema = {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "subtitleIndex": {"type": "INTEGER"},
                    "subtitleText": {"type": "STRING"},
                    "imagePrompt": {"type": "STRING"},
                },
                "required": ["subtitleIndex", "subtitleText", "imagePrompt"],
            },
        }
        model = self._structured_model(temperature=0.7, response_schema=schema)
        response = model.generate_content(prompt)
        payload = _clean_json_response(response.text or "")
        return _parse_prompt_results(payload)

    def fix_prompt_with_ai(self, failed_prompt: str) -> str:
        system_instruction = (
            "Bạn là chuyên gia sửa đổi prompt tạo ảnh. Prompt của người dùng đã bị từ chối vì vi phạm chính sách an toàn. "
            "Hãy viết lại nó để tuân thủ mà vẫn giữ ý định nghệ thuật ban đầu. Chỉ trả lời bằng prompt đã sửa."
        )
        model = genai.GenerativeModel(
            model_name=self.model_name,
            generation_config={"temperature": 0.4, "system_instruction": system_instruction},
        )
        response = model.generate_content(f"Prompt gốc: \"{failed_prompt}\"")
        fixed = (response.text or "").strip().strip('"')
        if not fixed:
            raise RuntimeError("AI trả về phản hồi rỗng khi sửa prompt.")
        return fixed

    # --- Image generation -----------------------------------------------
    def generate_images(
        self,
        prompts: Sequence[str],
        tokens: Sequence[str],
        *,
        aspect_ratio: str = "16:9",
    ) -> List[ImageGenerationResult]:
        valid_tokens = [token.strip() for token in tokens if token.strip()]
        if not prompts:
            return []
        if not valid_tokens:
            raise ValueError("Cần ít nhất một bearer token hợp lệ để tạo ảnh.")

        results: List[ImageGenerationResult] = []
        token_cycle = (valid_tokens[i % len(valid_tokens)] for i in range(len(prompts)))
        for prompt, token in zip(prompts, token_cycle):
            payload = _build_image_payload(prompt, aspect_ratio)
            headers = {**_AI_SANDBOX_HEADERS, "Authorization": f"Bearer {token}"}
            try:
                response = requests.post(_AI_SANDBOX_URL, headers=headers, json=payload, timeout=120)
            except requests.RequestException as exc:
                results.append(
                    ImageGenerationResult(prompt=prompt, status="failed", error=f"Lỗi mạng: {exc}")
                )
                continue

            if response.status_code in {401, 403}:
                results.append(
                    ImageGenerationResult(prompt=prompt, status="failed", error="Token không hợp lệ hoặc đã hết hạn."),
                )
                continue

            data = response.json()
            if not response.ok:
                error_message = data.get("error", {}).get("message") if isinstance(data, dict) else None
                message = f"Lỗi API: {response.status_code}"
                if error_message:
                    message += f". Chi tiết: {error_message}"
                results.append(ImageGenerationResult(prompt=prompt, status="failed", error=message))
                continue

            image_data = _extract_base64_from_response(data)
            if not image_data:
                results.append(
                    ImageGenerationResult(prompt=prompt, status="failed", error="Không tìm thấy dữ liệu ảnh trong phản hồi."),
                )
                continue

            results.append(ImageGenerationResult(prompt=prompt, status="success", image_data=image_data))
        return results

    # --- Automation convenience -----------------------------------------
    def run_full_automation(
        self,
        content_text: str,
        subtitle_text: str,
        *,
        merge_words_config: str = "5",
        prompt_conditions: str = "cinematic, 4k, hyper-realistic, detailed, professional color grading, soft light",
        image_tokens: Optional[Sequence[str]] = None,
        aspect_ratio: str = "16:9",
    ) -> dict:
        analysis = self.analyse_content(content_text, subtitle_text)
        merged_subtitle, rules = self.merge_subtitles_from_analysis(
            subtitle_text, analysis, merge_words_config=merge_words_config
        )
        prompt_results = self.generate_image_prompts(merged_subtitle, prompt_conditions)
        image_results: List[ImageGenerationResult] = []
        if image_tokens:
            prompts = [result.image_prompt for result in prompt_results]
            image_results = self.generate_images(prompts, image_tokens, aspect_ratio=aspect_ratio)

        return {
            "analysis": analysis,
            "merge_rules": rules,
            "merged_subtitle": merged_subtitle,
            "prompt_results": prompt_results,
            "image_results": image_results,
        }


__all__ = [
    "AnalysisResult",
    "MergeRule",
    "ImagePromptResult",
    "ImageGenerationResult",
    "SubtitleWorkflow",
    "configure_gemini",
    "prompt_for_gemini_api_key",
    "merge_srt_with_rules",
    "build_merge_rules",
]
